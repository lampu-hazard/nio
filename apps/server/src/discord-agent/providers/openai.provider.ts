import { Injectable } from '@nestjs/common';
import {
  AiGenerateRequest,
  AiGenerateResult,
  AiMessage,
  AiPart,
  AiProvider,
  AiTextPart,
  AiToolCallPart,
  AiToolDefinition,
  AiToolResultPart,
} from '../interfaces/ai-provider.interface';

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
    if (!this.apiKey && this.endpoint.includes('api.openai.com')) {
      throw new Error('OpenAI API key is not configured.');
    }
    if (!request.messages.length) {
      throw new Error('OpenAI request requires at least one message.');
    }

    const messages = this.toOpenAiMessages(request.messages, request.systemPrompt);
    const payload: Record<string, unknown> = {
      model: this.model,
      messages,
    };

    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map((tool) => this.toOpenAiTool(tool));
      payload.tool_choice = 'auto';
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`OpenAI API returned status ${response.status}: ${errText}`);
    }

    const data: any = await response.json();
    const choice = data?.choices?.[0];
    const choiceMessage = choice?.message;

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
              args = JSON.parse(tc.function.arguments);
            } catch {
              args = { raw: tc.function.arguments };
            }
          }
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
