export async function readProviderBody(response: Response): Promise<string> {
  if (typeof response.text === 'function') return response.text().catch(() => '');
  // Test doubles and non-standard fetch adapters may only implement json().
  if (typeof response.json === 'function') {
    try { return JSON.stringify(await response.json()); } catch { return ''; }
  }
  return '';
}

export function parseProviderJson(body: string, provider: string): Record<string, any> {
  const code = provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!body.trim()) {
    throw new Error(`${code}_EMPTY_RESPONSE: Provider returned an empty response.`);
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
