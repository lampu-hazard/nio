import { describe, expect, it } from '@jest/globals';
import { parseProviderJson } from './provider-json';

describe('parseProviderJson', () => {
  it('parses JSON object responses', () => {
    expect(parseProviderJson('{"choices":[]}', 'openai-compatible')).toEqual({ choices: [] });
  });

  it('distinguishes empty and invalid JSON without including body contents', () => {
    expect(() => parseProviderJson('  ', 'gemini')).toThrow('GEMINI_EMPTY_RESPONSE');
    expect(() => parseProviderJson('<html>proxy failure</html>', 'gemini')).toThrow('GEMINI_HTML_RESPONSE');
  });

  it('identifies HTML responses without exposing the body', () => {
    expect(() => parseProviderJson('<!doctype html><html>proxy failure</html>', 'openai-compatible')).toThrow('OPENAI_COMPATIBLE_HTML_RESPONSE');
    expect(() => parseProviderJson('<!doctype html><html>proxy failure</html>', 'openai-compatible')).not.toThrow('proxy failure');
  });

  it('rejects non-object roots', () => {
    expect(() => parseProviderJson('[]', 'openai-compatible')).toThrow('OPENAI_COMPATIBLE_INVALID_JSON');
  });
});
