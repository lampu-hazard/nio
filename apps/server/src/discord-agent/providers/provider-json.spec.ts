import { describe, expect, it } from '@jest/globals';
import { parseProviderJson } from './provider-json';

describe('parseProviderJson', () => {
  it('parses JSON object responses', () => {
    expect(parseProviderJson('{"choices":[]}', 'openai-compatible')).toEqual({ choices: [] });
  });

  it('distinguishes empty and invalid JSON without including body contents', () => {
    expect(() => parseProviderJson('  ', 'gemini')).toThrow('GEMINI_EMPTY_RESPONSE');
    expect(() => parseProviderJson('<html>proxy failure</html>', 'gemini')).toThrow('GEMINI_INVALID_JSON');
  });

  it('rejects non-object roots', () => {
    expect(() => parseProviderJson('[]', 'openai-compatible')).toThrow('OPENAI_COMPATIBLE_INVALID_JSON');
  });
});
