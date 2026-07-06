export interface AiProvider {
  generate(systemPrompt: string, userPrompt: string, contextJson: string): Promise<string>;
}
