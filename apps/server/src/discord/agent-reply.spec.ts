import { describe, expect, it, jest } from '@jest/globals';
import { deliverAgentReply } from './agent-reply';
describe('agent reply delivery', () => {
  it('forwards the same image bytes on edit failure and one fallback without mentions', async () => {
    const bytes = Buffer.from('validated image');
    const loadingMessage = { edit: jest.fn<any>(async () => { throw new Error('upload failed'); }) };
    const message = { reply: jest.fn<any>(async () => ({ id: 'reply' })) };
    const result = await deliverAgentReply({ message, loadingMessage, response: { content: 'image', files: [{ attachment: bytes, name: 'nio-generated.png', description: 'AI image' }] } });
    expect(result).toEqual({ delivered: true, messageId: 'reply' });
    expect(loadingMessage.edit).toHaveBeenCalledTimes(1);
    expect(message.reply).toHaveBeenCalledTimes(1);
    const payload = message.reply.mock.calls[0][0] as any;
    expect(payload.files[0].attachment).toBe(bytes);
    expect(payload.allowedMentions).toEqual({ parse: [], users: [], roles: [], repliedUser: false });
  });
  it('returns delivery failure after at most two upload attempts', async () => {
    const fail = async () => { throw new Error('Discord unavailable'); };
    const message = { reply: jest.fn<any>(fail) };
    const loadingMessage = { edit: jest.fn<any>(fail) };
    expect(await deliverAgentReply({ message, loadingMessage, response: { content: 'hello' } })).toEqual({ delivered: false });
    expect(message.reply).toHaveBeenCalledTimes(1);
    expect(loadingMessage.edit).toHaveBeenCalledTimes(1);
  });
});
