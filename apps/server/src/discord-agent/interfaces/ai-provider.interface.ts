export interface AiProvider {
  generate(systemPrompt: string, userPrompt: string, history: any[], tools: any[]): Promise<any>;
}
