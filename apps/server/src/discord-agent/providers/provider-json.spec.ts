import { describe, expect, it } from '@jest/globals';
import { parseProviderJson, readProviderBody, readProviderChunk } from './provider-json';

describe('parseProviderJson', () => {
  it('bounds actual chunked response bytes while reading', async () => {
    const response = new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(5)); controller.enqueue(new Uint8Array(5)); controller.close();
    } }));
    await expect(readProviderBody(response, undefined, 8)).rejects.toThrow('PROVIDER_RESPONSE_TOO_LARGE');
  });
  it('aborts a stalled body read and cancels the underlying stream', async () => {
    const abort = new AbortController();
    let canceled = false;
    const reader = new ReadableStream<Uint8Array>({ cancel() { canceled = true; } }).getReader();
    const reading = readProviderChunk(reader, abort.signal);
    abort.abort();
    await expect(reading).rejects.toThrow('PROVIDER_ABORTED');
    expect(canceled).toBe(true);
  });
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
