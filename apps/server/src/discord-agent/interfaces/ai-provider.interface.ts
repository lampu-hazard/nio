export type JsonSchema = {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
};

export type ToolSafety = {
  mode: 'read' | 'write';
  proposalRequired: boolean;
  ownerOnly?: boolean;
};

export type AiToolDefinition = {
  name: string;
  description: string;
  parameters: JsonSchema;
  safety: ToolSafety;
};

export type AiTextPart = { type: 'text'; text: string };
export type AiToolCallPart = {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};
export type AiToolResult = {
  ok: boolean;
  value?: unknown;
  error?: { code: string; message: string };
  truncated?: boolean;
};
export type AiToolResultPart = {
  type: 'tool_result';
  toolCallId: string;
  name: string;
  result: AiToolResult;
};
export type AiPart = AiTextPart | AiToolCallPart | AiToolResultPart;

export type AiMessage = {
  role: 'user' | 'assistant';
  parts: AiPart[];
};

export type AiGenerateRequest = {
  systemPrompt: string;
  messages: AiMessage[];
  tools: AiToolDefinition[];
};

export type AiGenerateResult = {
  message: AiMessage;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export interface AiProvider {
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
}
