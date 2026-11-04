import { PreparedChatCall } from '../interfaces/ai-provider.interface';

export class ProviderCallError extends Error {
  constructor(readonly code: string, readonly dispatched: boolean, readonly definiteRejection = false) {
    super(code);
  }
}

export function prepareChatBody(payload: unknown, messages: number, tools: number, cap: number): PreparedChatCall {
  if (!Number.isInteger(cap) || cap < 128 || cap > 8192) throw new ProviderCallError('OUTPUT_CAP_INVALID', false);
  const body = JSON.stringify(payload);
  const bytes = Buffer.byteLength(body, 'utf8');
  if (bytes > 1048576) throw new ProviderCallError('REQUEST_TOO_LARGE', false);
  return Object.freeze({ body, inputAllowance: bytes + 1024 + 64 * (messages + tools), maxOutputTokens: cap });
}

export function validateTokenUsage(usage: unknown): number | null {
  if (!usage || typeof usage !== 'object') return null;
  const { promptTokens, completionTokens, totalTokens } = usage as Record<string, unknown>;
  const valid = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (!valid(totalTokens) || (promptTokens !== undefined && !valid(promptTokens))
    || (completionTokens !== undefined && !valid(completionTokens))) return null;
  if (totalTokens < (typeof promptTokens === 'number' ? promptTokens : 0) + (typeof completionTokens === 'number' ? completionTokens : 0)) return null;
  return totalTokens;
}
