import { Injectable } from '@nestjs/common';
import {
  AiGenerateRequest,
  AiGenerateResult,
  AiMessage,
  AiPart,
  AiProvider,
  PreparedChatCall,
  AiTextPart,
  AiToolDefinition,
} from '../interfaces/ai-provider.interface';
import { parseProviderJson, readProviderBody, readProviderChunk } from './provider-json';
import { prepareChatBody, ProviderCallError } from './chat-request-budget';
import { countGeminiTokens } from './chat-token-counter';
import { AgentProfile } from '../agent-profile.types';

@Injectable()
export class GeminiProvider implements AiProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    return this.generatePrepared(await this.prepare(request, { profile: 'ADMIN' }), request.signal, request.onTextDelta);
  }

  async prepare(request: AiGenerateRequest, options?: { profile?: AgentProfile }): Promise<PreparedChatCall> {
    if (!this.apiKey) throw new Error('Gemini API key is not configured.');
    if (!request.messages.length) throw new Error('Gemini request requires at least one message.');

    if (!['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'].includes(this.model)) {
      throw new ProviderCallError('BUDGET_UNSUPPORTED', false);
    }
    const cap = request.maxOutputTokens ?? 2048;
    const contents = request.messages.map((message) => this.toGeminiMessage(message));
    const systemInstruction = { parts: [{ text: request.systemPrompt }] };
    const tools = request.tools.length
      ? [{ functionDeclarations: request.tools.map((tool) => this.toGeminiTool(tool)) }]
      : [];
    const payload: Record<string, unknown> = {
      contents,
      systemInstruction,
      generationConfig: { maxOutputTokens: cap,
        ...(this.model.startsWith('gemini-2.5-') ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
    };
    if (tools.length) {
      payload.tools = tools;
    }

    const serializedBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    const estimate = await countGeminiTokens({
      apiKey: this.apiKey,
      model: this.model,
      contents,
      systemInstruction,
      tools: request.tools,
      serializedBytes,
      profile: options?.profile ?? 'PUBLIC',
      signal: request.signal,
    });
    const call = prepareChatBody(payload, cap, estimate);
    this.prepared.set(call, typeof request.onTextDelta === 'function');
    return call;
  }

  private readonly prepared = new WeakMap<PreparedChatCall, boolean>();

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
    const isStreaming = this.prepared.get(call);
    const action = isStreaming ? 'streamGenerateContent?alt=sse' : 'generateContent';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:${action}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.apiKey,
    };
    if (isStreaming) {
      headers['Accept'] = 'text/event-stream';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: call.body,
      signal,
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      const rejected = [400, 401, 403, 404, 413, 422, 429].includes(response.status);
      throw new ProviderCallError([400, 422].includes(response.status) ? 'BUDGET_UNSUPPORTED' : `GEMINI_HTTP_${response.status}`, true, rejected);
    }

    const contentType = response.headers?.get('content-type') || '';
    if (contentType.includes('text/event-stream') && response.body) {
      return this.readEventStream(response, { onTextDelta, signal });
    }

    const body = await readProviderBody(response, signal);

    const data = parseProviderJson(body, 'Gemini');
    if (!Array.isArray(data?.candidates) || !data.candidates.length) {
      throw new Error('GEMINI_INVALID_RESPONSE: No response candidates returned.');
    }
    const rawParts = data.candidates[0]?.content?.parts;
    if (!Array.isArray(rawParts)) {
      throw new Error('GEMINI_INVALID_RESPONSE: Candidate content parts are missing.');
    }
    const parts = Array.isArray(rawParts)
      ? rawParts.map((part: any, index: number) => this.fromGeminiPart(part, index)).filter(Boolean) as AiPart[]
      : [];
    const usage = data?.usageMetadata;
    const finishReason = data?.candidates?.[0]?.finishReason;
    return {
      message: { role: 'assistant', parts },
      ...(finishReason ? { finishReason: String(finishReason).toLowerCase() } : {}),
      ...(usage ? {
        usage: {
          promptTokens: usage.promptTokenCount,
          completionTokens: usage.candidatesTokenCount,
          totalTokens: usage.totalTokenCount,
        },
      } : {}),
    };
  }

  private async readEventStream(response: Response, request: Pick<AiGenerateRequest, 'onTextDelta' | 'signal'>): Promise<AiGenerateResult> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const parts: AiPart[] = [];
    let finishReason: string | undefined;
    let usage: any;
    let receivedBytes = 0;

    const processEvent = async (event: string) => {
      const dataLines = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!dataLines) return;
      if (dataLines === '[DONE]') return;

      let chunk: any;
      try {
        chunk = JSON.parse(dataLines);
      } catch {
        throw new Error('GEMINI_INVALID_STREAM_EVENT: Provider returned malformed stream data.');
      }

      const candidate = chunk?.candidates?.[0];
      const rawParts = candidate?.content?.parts;
      if (Array.isArray(rawParts)) {
        for (const rawPart of rawParts) {
          if (typeof rawPart?.text === 'string' && rawPart.text) {
            const existingText = parts.find((p): p is AiTextPart => p.type === 'text');
            if (existingText) {
              existingText.text += rawPart.text;
            } else {
              parts.push({ type: 'text', text: rawPart.text });
            }
            await request.onTextDelta?.(rawPart.text);
          } else {
            const parsed = this.fromGeminiPart(rawPart, parts.length);
            if (parsed) parts.push(parsed);
          }
        }
      }
      if (candidate?.finishReason) {
        finishReason = String(candidate.finishReason).toLowerCase();
      }
      if (chunk?.usageMetadata) {
        usage = chunk.usageMetadata;
      }
    };

    try {
      while (true) {
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
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }

    if (!parts.length) {
      return { message: { role: 'assistant', parts }, ...(finishReason ? { finishReason } : {}) };
    }

    return {
      message: { role: 'assistant', parts },
      ...(finishReason ? { finishReason } : {}),
      ...(usage
        ? {
            usage: {
              promptTokens: usage.promptTokenCount,
              completionTokens: usage.candidatesTokenCount,
              totalTokens: usage.totalTokenCount,
            },
          }
        : {}),
    };
  }

  private toGeminiTool(tool: AiToolDefinition) {
    const { safety: _safety, ...definition } = tool;
    return definition;
  }

  private toGeminiMessage(message: AiMessage) {
    return {
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: message.parts.map((part) => {
        if (part.type === 'text') return { text: part.text };
        if (part.type === 'tool_call') {
          return { functionCall: { name: part.name, args: part.arguments } };
        }
        return {
          functionResponse: {
            name: part.name,
            response: { content: JSON.stringify(part.result) },
          },
        };
      }),
    };
  }

  private fromGeminiPart(part: any, index: number): AiPart | null {
    if (typeof part?.text === 'string') return { type: 'text', text: part.text };
    if (part?.functionCall?.name) {
      if (part.functionCall.args != null && (typeof part.functionCall.args !== 'object' || Array.isArray(part.functionCall.args))) {
        throw new Error('GEMINI_INVALID_TOOL_ARGUMENTS: Tool arguments must be a JSON object.');
      }
      return {
        type: 'tool_call',
        id: typeof part.functionCall.id === 'string'
          ? part.functionCall.id
          : `${part.functionCall.name}:${index}`,
        name: String(part.functionCall.name),
        arguments: part.functionCall.args && typeof part.functionCall.args === 'object'
          ? part.functionCall.args
          : {},
      };
    }
    return null;
  }
}
