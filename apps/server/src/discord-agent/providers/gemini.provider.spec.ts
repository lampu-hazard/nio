import { GeminiProvider } from './gemini.provider';

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    provider = new GeminiProvider('mock-api-key', 'gemini-2.5-flash');
  });

  it('calls fetch to google gemini endpoint and returns generated text', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: 'mock AI response' }],
          },
        },
      ],
    };

    const globalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
    global.fetch = fetchMock;

    try {
      const response = await provider.generate('System prompt', 'User prompt', '{}');
      expect(response).toBe('mock AI response');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('gemini-2.5-flash:generateContent');
    } finally {
      global.fetch = globalFetch;
    }
  });

  it('throws an error on API failure', async () => {
    const globalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Error',
    });

    try {
      await expect(provider.generate('System', 'User', '{}')).rejects.toThrow('Gemini API returned status 500');
    } finally {
      global.fetch = globalFetch;
    }
  });
});
