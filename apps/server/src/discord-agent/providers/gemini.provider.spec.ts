import { GeminiProvider } from './gemini.provider';

describe('GeminiProvider with Tool Calling', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    provider = new GeminiProvider('mock-api-key', 'gemini-2.5-flash');
  });

  it('handles regular text generation', async () => {
    const mockResponse = {
      candidates: [
        { content: { parts: [{ text: 'plain text response' }] } }
      ]
    };
    const globalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    try {
      const response = await provider.generate('System', 'User', [], []);
      expect(response.candidates[0].content.parts[0].text).toBe('plain text response');
    } finally {
      global.fetch = globalFetch;
    }
  });

  it('handles model requesting function call', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{
              functionCall: {
                name: 'get_user_warnings',
                args: { targetUserId: '123' }
              }
            }]
          }
        }
      ]
    };
    const globalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    try {
      const response = await provider.generate('System', 'User', [], []);
      const call = response.candidates[0].content.parts[0].functionCall;
      expect(call.name).toBe('get_user_warnings');
      expect(call.args.targetUserId).toBe('123');
    } finally {
      global.fetch = globalFetch;
    }
  });
});
