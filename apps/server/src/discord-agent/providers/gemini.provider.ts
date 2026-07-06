import { Injectable } from '@nestjs/common';
import { AiProvider } from '../interfaces/ai-provider.interface';

@Injectable()
export class GeminiProvider implements AiProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generate(systemPrompt: string, userPrompt: string, history: any[], tools: any[]): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Gemini API key is not configured.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const requestContents = [...history];
    if (userPrompt) {
      requestContents.push({
        role: 'user',
        parts: [{ text: userPrompt }],
      });
    }

    const payload: any = {
      contents: requestContents,
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
    };

    if (tools && tools.length > 0) {
      payload.tools = [{ functionDeclarations: tools }];
    }

    console.log('Gemini Request Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Gemini API returned status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data;
  }
}
