import { createHash } from 'crypto';
import { getEncoding } from 'js-tiktoken';
import { AgentProfile } from '../agent-profile.types';
import { TokenEstimate } from '../interfaces/ai-provider.interface';

type SupportedEncoding = 'o200k_base' | 'cl100k_base';

const OPENAI_MODEL_ENCODINGS: Record<string, SupportedEncoding> = {
  'gpt-4o': 'o200k_base',
  'gpt-4o-mini': 'o200k_base',
  'gpt-4o-2024-08-06': 'o200k_base',
  'gpt-4o-2024-11-20': 'o200k_base',
  'gpt-4o-mini-2024-07-18': 'o200k_base',
  'gpt-4.1': 'o200k_base',
  'gpt-4.1-mini': 'o200k_base',
  'gpt-4.1-nano': 'o200k_base',
  'o1': 'o200k_base',
  'o1-mini': 'o200k_base',
  'o3-mini': 'o200k_base',
  'gpt-4-turbo': 'cl100k_base',
  'gpt-4': 'cl100k_base',
  'gpt-3.5-turbo': 'cl100k_base',
};

const GEMINI_RECOGNIZED_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
]);

const encoderCache = new Map<SupportedEncoding, ReturnType<typeof getEncoding>>();
const schemaTokenCache = new Map<string, number>();

function encoderFor(encoding: SupportedEncoding) {
  let cached = encoderCache.get(encoding);
  if (!cached) {
    cached = getEncoding(encoding);
    encoderCache.set(encoding, cached);
  }
  return cached;
}

function countTextTokens(encoding: SupportedEncoding, text: string): number {
  if (!text) return 0;
  return encoderFor(encoding).encode(text).length;
}

function countStaticToolsTokens(encoding: SupportedEncoding, tools: unknown[]): number {
  if (!tools.length) return 0;
  const serialized = JSON.stringify(tools);
  const hash = createHash('sha256').update(`${encoding}:${serialized}`).digest('hex');
  const cached = schemaTokenCache.get(hash);
  if (cached !== undefined) return cached;
  let tokens = 12;
  for (const tool of tools as any[]) {
    const fn = tool?.function ?? tool;
    tokens += 8;
    tokens += countTextTokens(encoding, String(fn?.name ?? ''));
    tokens += countTextTokens(encoding, String(fn?.description ?? ''));
    tokens += countTextTokens(encoding, JSON.stringify(fn?.parameters ?? {}));
  }
  if (schemaTokenCache.size >= 256) {
    const oldest = schemaTokenCache.keys().next().value;
    if (oldest) schemaTokenCache.delete(oldest);
  }
  schemaTokenCache.set(hash, tokens);
  return tokens;
}

export function createConservativeFallbackEstimate(
  serializedBytes: number,
  messageCount: number,
  toolCount: number,
): TokenEstimate {
  return {
    inputTokens: Math.max(1, serializedBytes + 1024 + 64 * (messageCount + toolCount)),
    source: 'CONSERVATIVE_FALLBACK',
    counterVersion: 'utf8-ceiling:v1',
    confidence: 'CONSERVATIVE',
  };
}

export function countOpenAiTokens(
  model: string,
  messages: Array<Record<string, any>>,
  tools: unknown[],
  serializedBytes: number,
): TokenEstimate {
  const normalized = String(model || '').trim();
  const encoding = OPENAI_MODEL_ENCODINGS[normalized];
  if (!encoding) {
    return createConservativeFallbackEstimate(serializedBytes, messages.length, tools.length);
  }

  let tokens = 3 + countStaticToolsTokens(encoding, tools);
  for (const msg of messages) {
    tokens += 4;
    tokens += countTextTokens(encoding, String(msg.role ?? ''));
    if (typeof msg.name === 'string') {
      tokens += 1 + countTextTokens(encoding, msg.name);
    }
    if (typeof msg.content === 'string') {
      tokens += countTextTokens(encoding, msg.content);
    }
    if (typeof msg.tool_call_id === 'string') {
      tokens += 2 + countTextTokens(encoding, msg.tool_call_id);
    }
    if (Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        tokens += 6;
        tokens += countTextTokens(encoding, String(tc?.id ?? ''));
        tokens += countTextTokens(encoding, String(tc?.function?.name ?? ''));
        tokens += countTextTokens(encoding, String(tc?.function?.arguments ?? ''));
      }
    }
  }

  return {
    inputTokens: Math.max(1, tokens),
    source: 'MODEL_TOKENIZER',
    counterVersion: `js-tiktoken:1.0.21/${encoding}:v1`,
    confidence: 'ESTIMATED',
  };
}

export async function countGeminiTokens(input: {
  apiKey: string;
  model: string;
  contents: unknown[];
  systemInstruction?: unknown;
  tools: unknown[];
  serializedBytes: number;
  profile: AgentProfile;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<TokenEstimate> {
  const { apiKey, model, contents, systemInstruction, tools, serializedBytes, profile, signal } = input;
  const fetchFn = input.fetchImpl ?? fetch;

  if (!GEMINI_RECOGNIZED_MODELS.has(model)) {
    return createConservativeFallbackEstimate(serializedBytes, contents.length + 1, tools.length);
  }

  if (profile === 'ADMIN') {
    const encoding: SupportedEncoding = 'o200k_base';
    const textTokens = countTextTokens(encoding, JSON.stringify({ systemInstruction, contents }));
    const toolTokens = countStaticToolsTokens(encoding, tools);
    return {
      inputTokens: Math.max(1, textTokens + toolTokens + 8),
      source: 'MODEL_TOKENIZER',
      counterVersion: 'js-tiktoken:1.0.21/o200k_base-gemini-local:v1',
      confidence: 'ESTIMATED',
    };
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const payload: Record<string, unknown> = {
      contents,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(tools.length ? { tools } : {}),
    };
    const response = await fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );
    if (response.ok) {
      const data: any = await response.json();
      const total = data?.totalTokens;
      if (typeof total === 'number' && Number.isSafeInteger(total) && total > 0) {
        return {
          inputTokens: total,
          source: 'PROVIDER_COUNT',
          counterVersion: 'gemini-countTokens:v1beta',
          confidence: 'REPORTED_COUNT',
        };
      }
    }
  } catch {
    // Fall back safely on timeout or network failure
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }

  return createConservativeFallbackEstimate(serializedBytes, contents.length + 1, tools.length);
}
