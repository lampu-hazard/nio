import { Injectable } from '@nestjs/common';
import {
  AiGenerateRequest,
  AiGenerateResult,
  AiMessage,
  AiPart,
  AiProvider,
  AiToolDefinition,
} from '../interfaces/ai-provider.interface';

@Injectable()
export class GeminiProvider implements AiProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    if (!this.apiKey) throw new Error('Gemini API key is not configured.');
    if (!request.messages.length) throw new Error('Gemini request requires at least one message.');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const payload: Record<string, unknown> = {
      contents: request.messages.map((message) => this.toGeminiMessage(message)),
      systemInstruction: { parts: [{ text: request.systemPrompt }] },
    };
    if (request.tools.length) {
      payload.tools = [{ functionDeclarations: request.tools.map((tool) => this.toGeminiTool(tool)) }];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Gemini API returned status ${response.status}: ${errText}`);
    }

    const data: any = await response.json();
    const rawParts = data?.candidates?.[0]?.content?.parts;
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
