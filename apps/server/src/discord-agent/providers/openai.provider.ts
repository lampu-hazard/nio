import { Injectable } from '@nestjs/common';
import {
  AiGenerateRequest,
  AiGenerateResult,
  AiMessage,
  AiPart,
  AiProvider,
  PreparedChatCall,
  AiTextPart,
  AiToolCallPart,
  AiToolDefinition,
  AiToolResultPart,
} from '../interfaces/ai-provider.interface';
import { parseProviderJson, readProviderBody, readProviderChunk } from './provider-json';
import { prepareChatBody, ProviderCallError } from './chat-request-budget';
import { countOpenAiTokens } from './chat-token-counter';
import { AgentProfile } from '../agent-profile.types';

@Injectable()
export class OpenAiProvider implements AiProvider {
  private readonly endpoint: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string = 'https://api.openai.com/v1',
  ) {
    const cleanBase = (this.baseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
    this.endpoint = cleanBase.endsWith('/chat/completions')
      ? cleanBase
      : `${cleanBase}/chat/completions`;
  }

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    return this.generatePrepared(await this.prepare(request), request.signal, request.onTextDelta);
  }

  async prepare(request: AiGenerateRequest, _options?: { profile?: AgentProfile }): Promise<PreparedChatCall> {
    if (!this.apiKey && this.endpoint.includes('api.openai.com')) {
      throw new Error('OpenAI API key is not configured.');
    }
    if (!request.messages.length) {
      throw new Error('OpenAI request requires at least one message.');
    }

    const cap = request.maxOutputTokens ?? 2048;
    const messages = this.toOpenAiMessages(request.messages, request.systemPrompt);
    const tools = request.tools && request.tools.length > 0
      ? request.tools.map((tool) => this.toOpenAiTool(tool))
      : [];
    const payload: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: cap,
    };

    if (tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    const serializedBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    const estimate = countOpenAiTokens(this.model, messages, tools, serializedBytes);
    const call = prepareChatBody(payload, cap, estimate);
    this.prepared.add(call);
    return call;
  }

  private readonly prepared = new WeakSet<PreparedChatCall>();

  async generatePrepared(call: PreparedChatCall, signal?: AbortSignal, onTextDelta?: AiGenerateRequest['onTextDelta']): Promise<AiGenerateResult> {
    if (!this.prepared.has(call)) throw new ProviderCallError('INVALID_PREPARED_CALL', false);
    if (signal?.aborted) throw new ProviderCallError('PROVIDER_ABORTED', false);
    try {
      return await this.sendPrepared(call, signal, onTextDelta);
    } catch (error) {
      if (error instanceof ProviderCallError) throw error;
      const code = error instanceof Error && /^[A-Z][A-Z0-9_]+:/.test(error.message) ? error.message.split(':')[0] : 'PROVIDER_NETWORK_ERROR';
      throw new ProviderCallError(signal?.aborted ? 'PROVIDER_ABORTED' : code, true);
    }
  }

  private async sendPrepared(call: PreparedChatCall, signal?: AbortSignal, onTextDelta?: AiGenerateRequest['onTextDelta']): Promise<AiGenerateResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: call.body,
      signal,
    });

    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      const rejected = [400, 401, 403, 404, 413, 422, 429].includes(response.status);
      throw new ProviderCallError([400, 422].includes(response.status) ? 'BUDGET_UNSUPPORTED' : `OPENAI_HTTP_${response.status}`, true, rejected);
    }

    const contentType = response.headers?.get('content-type') || '';
    if (contentType.includes('text/event-stream') && response.body) {
      return this.readEventStream(response, { onTextDelta, signal });
    }

    const body = await readProviderBody(response, signal);
    const data = parseProviderJson(body, 'OpenAI-compatible');
    if (!Array.isArray(data?.choices) || !data.choices.length) {
      throw new Error('OPENAI_INVALID_RESPONSE: No completion choices returned.');
    }
    const choice = data.choices[0];
    const choiceMessage = choice?.message;
    if (!choiceMessage || typeof choiceMessage !== 'object') {
      throw new Error('OPENAI_INVALID_RESPONSE: Missing assistant message in provider response.');
    }
    if (choiceMessage.content != null && typeof choiceMessage.content !== 'string' && !Array.isArray(choiceMessage.content)) {
      throw new Error('OPENAI_INVALID_RESPONSE: Assistant content has an unsupported shape.');
    }
    if (choiceMessage.content != null && typeof choiceMessage.content !== 'string') {
      throw new Error('OPENAI_INVALID_RESPONSE: Assistant content must be text or null.');
    }
    if (choiceMessage.tool_calls != null && !Array.isArray(choiceMessage.tool_calls)) {
      throw new Error('OPENAI_INVALID_RESPONSE: Tool calls must be an array.');
    }
    const parts: AiPart[] = [];
    if (typeof choiceMessage?.content === 'string' && choiceMessage.content.length > 0) {
      parts.push({ type: 'text', text: choiceMessage.content });
    }

    if (Array.isArray(choiceMessage?.tool_calls)) {
      choiceMessage.tool_calls.forEach((tc: any, index: number) => {
        let args: Record<string, unknown> = {};
        if (tc?.function?.arguments) {
          if (typeof tc.function.arguments === 'object' && tc.function.arguments !== null) {
            args = tc.function.arguments;
          } else if (typeof tc.function.arguments === 'string') {
            try {
              const parsed: unknown = JSON.parse(tc.function.arguments);
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('Tool arguments must be a JSON object.');
              }
              args = parsed as Record<string, unknown>;
            } catch {
              throw new Error('OPENAI_INVALID_TOOL_ARGUMENTS: Tool arguments were not a valid JSON object.');
            }
          } else {
            throw new Error('OPENAI_INVALID_TOOL_ARGUMENTS: Tool arguments must be a JSON object.');
          }
        }
        if (!tc?.function?.name || typeof tc.function.name !== 'string') {
          throw new Error('OPENAI_INVALID_TOOL_CALL: Tool call is missing a function name.');
        }
        parts.push({
          type: 'tool_call',
          id: tc.id || `${tc?.function?.name || 'tool'}:${index}`,
          name: String(tc?.function?.name || ''),
          arguments: args,
        });
      });
    }

    const finishReason = choice?.finish_reason;
    const usage = data?.usage;

    return {
      message: { role: 'assistant', parts },
      ...(finishReason ? { finishReason: String(finishReason).toLowerCase() } : {}),
      ...(usage
        ? {
            usage: {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            },
          }
        : {}),
    };
  }

  private async readEventStream(response: Response, request: Pick<AiGenerateRequest, 'onTextDelta' | 'signal'>): Promise<AiGenerateResult> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();
    let buffer = '';
    let content = '';
    let finishReason: string | undefined;
    let usage: any;
    let sawDone = false;
    let receivedBytes = 0;

    const processEvent = async (event: string) => {
      const data = event.split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) return;
      if (data === '[DONE]') {
        sawDone = true;
        return;
      }
      let chunk: any;
      try {
        chunk = JSON.parse(data);
      } catch {
        throw new Error('OPENAI_INVALID_STREAM_EVENT: Provider returned malformed stream data.');
      }
      const choice = chunk?.choices?.[0];
      const delta = choice?.delta;
      if (typeof delta?.content === 'string' && delta.content) {
        content += delta.content;
        await request.onTextDelta?.(delta.content);
      }
      if (Array.isArray(delta?.tool_calls)) {
        for (const toolDelta of delta.tool_calls) {
          const index = Number(toolDelta?.index);
          if (!Number.isInteger(index) || index < 0) {
            throw new Error('OPENAI_INVALID_TOOL_CALL: Streamed tool call has an invalid index.');
          }
          const current = toolCalls.get(index) || { id: '', name: '', arguments: '' };
          if (typeof toolDelta.id === 'string') current.id += toolDelta.id;
          if (typeof toolDelta.function?.name === 'string') current.name += toolDelta.function.name;
          if (typeof toolDelta.function?.arguments === 'string') current.arguments += toolDelta.function.arguments;
          toolCalls.set(index, current);
        }
      }
      if (choice?.finish_reason) finishReason = String(choice.finish_reason).toLowerCase();
      if (chunk?.usage) usage = chunk.usage;
    };

    try {
      while (!sawDone) {
        const { value, done } = await readProviderChunk(reader, request.signal);
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > 8388608) throw new ProviderCallError('PROVIDER_RESPONSE_TOO_LARGE', true);
        buffer += decoder.decode(value, { stream: true });
        let separator: number;
        while ((separator = buffer.search(/\r?\n\r?\n/)) !== -1) {
          const event = buffer.slice(0, separator);
          const separatorLength = buffer.slice(separator).startsWith('\r\n\r\n') ? 4 : 2;
          buffer = buffer.slice(separator + separatorLength);
          await processEvent(event);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) await processEvent(buffer);
      if (!sawDone && !finishReason) {
        throw new Error('OPENAI_TRUNCATED_STREAM: Provider stream ended before completion.');
      }
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }

    const parts: AiPart[] = [];
    if (content) parts.push({ type: 'text', text: content });
    for (const [index, call] of [...toolCalls.entries()].sort(([a], [b]) => a - b)) {
      if (!call.name) throw new Error('OPENAI_INVALID_TOOL_CALL: Tool call is missing a function name.');
      let args: Record<string, unknown> = {};
      if (call.arguments) {
        try {
          const parsed: unknown = JSON.parse(call.arguments);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
          args = parsed as Record<string, unknown>;
        } catch {
          throw new Error('OPENAI_INVALID_TOOL_ARGUMENTS: Tool arguments were not a valid JSON object.');
        }
      }
      parts.push({ type: 'tool_call', id: call.id || `${call.name}:${index}`, name: call.name, arguments: args });
    }

    return {
      message: { role: 'assistant', parts },
      ...(finishReason ? { finishReason } : {}),
      ...(usage ? { usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      } } : {}),
    };
  }

  private toOpenAiTool(tool: AiToolDefinition) {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  }

  private toOpenAiMessages(messages: AiMessage[], systemPrompt?: string): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];
    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const message of messages) {
      if (message.role === 'assistant') {
        const textParts = message.parts.filter((p): p is AiTextPart => p.type === 'text');
        const toolCallParts = message.parts.filter((p): p is AiToolCallPart => p.type === 'tool_call');
        const content = textParts.length > 0 ? textParts.map((p) => p.text).join('\n') : null;

        const assistantMsg: Record<string, unknown> = {
          role: 'assistant',
          content,
        };

        if (toolCallParts.length > 0) {
          assistantMsg.tool_calls = toolCallParts.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {}),
            },
          }));
        }

        result.push(assistantMsg);
      } else {
        const toolResultParts = message.parts.filter((p): p is AiToolResultPart => p.type === 'tool_result');
        const textParts = message.parts.filter((p): p is AiTextPart => p.type === 'text');

        for (const part of toolResultParts) {
          result.push({
            role: 'tool',
            tool_call_id: part.toolCallId,
            content: typeof part.result === 'string' ? part.result : JSON.stringify(part.result ?? {}),
          });
        }

        if (textParts.length > 0) {
          result.push({
            role: 'user',
            content: textParts.map((p) => p.text).join('\n'),
          });
        }
      }
    }

    return result;
  }
}
