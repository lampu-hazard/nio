export async function readProviderChunk(reader: ReadableStreamDefaultReader<Uint8Array>, signal?: AbortSignal): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (!signal) return reader.read();
  return new Promise((resolve, reject) => {
    const aborted = () => {
      signal.removeEventListener('abort', aborted);
      reject(new Error('PROVIDER_ABORTED: Request canceled.'));
      void reader.cancel().catch(() => {});
    };
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener('abort', aborted, { once: true });
    reader.read().then((value) => { signal.removeEventListener('abort', aborted); resolve(value); },
      (error) => { signal.removeEventListener('abort', aborted); reject(error); });
  });
}

export async function readProviderBody(response: Response, signal?: AbortSignal, maxBytes = 8388608): Promise<string> {
  if (signal?.aborted) throw new Error('PROVIDER_ABORTED: Request canceled.');
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let body = '';
    try {
      while (true) {
        const { value, done } = await readProviderChunk(reader, signal);
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) throw new Error('PROVIDER_RESPONSE_TOO_LARGE: Response limit exceeded.');
        body += decoder.decode(value, { stream: true });
      }
      return body + decoder.decode();
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  // Non-standard adapters and test doubles may only expose text/json.
  const body = typeof response.text === 'function' ? await response.text()
    : typeof response.json === 'function' ? JSON.stringify(await response.json()) : '';
  if (Buffer.byteLength(body) > maxBytes) throw new Error('PROVIDER_RESPONSE_TOO_LARGE: Response limit exceeded.');
  return body;
}

export function parseProviderJson(body: string, provider: string): Record<string, any> {
  const code = provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!body.trim()) {
    throw new Error(`${code}_EMPTY_RESPONSE: Provider returned an empty response.`);
  }
  if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(body)) {
    throw new Error(`${code}_HTML_RESPONSE: Provider returned an HTML page instead of API JSON.`);
  }
  try {
    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Response root must be an object.');
    }
    return value;
  } catch {
    throw new Error(`${code}_INVALID_JSON: Provider returned a response that is not valid JSON.`);
  }
}
