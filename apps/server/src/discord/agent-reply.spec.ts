import { describe, expect, it, jest } from '@jest/globals';
import { deliverAgentReply } from './agent-reply';
describe('agent reply delivery', () => {
  it('splits long text, rejects untrusted text files, and stops on continuation failure', async () => {
    const payloads: any[] = [];
    const message = { reply: async (p: any) => { payloads.push(p); if (payloads.length === 2) throw Error('offline'); return { id: 'one' }; } };
    const result = await deliverAgentReply({ message, response: { content: 'hello '.repeat(1000), files: [{ attachment: Buffer.from('untrusted'), name: 'nio-answer.txt' }] } });
    expect(payloads).toHaveLength(2);
    expect(payloads[0].files).toBeUndefined();
    expect(result).toMatchObject({ delivered: true, complete: false, messageIds: ['one'] });
    expect((result as any).deliveredContent.length).toBeLessThan(2000);
  });
  it('forwards the same image bytes on edit failure and one fallback without mentions', async () => {
    const bytes = Buffer.from('validated image');
    const loadingMessage = { edit: jest.fn<any>(async () => { throw new Error('upload failed'); }) };
    const message = { reply: jest.fn<any>(async () => ({ id: 'reply' })) };
    const result = await deliverAgentReply({ message, loadingMessage, response: { content: 'image', files: [{ attachment: bytes, name: 'nio-generated.png', description: 'AI image' }] } });
    expect(result).toMatchObject({ delivered: true, complete: true, messageId: 'reply', messageIds: ['reply'], deliveredContent: 'image' });
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
    expect(await deliverAgentReply({ message, loadingMessage, response: { content: 'hello' } })).toEqual({ delivered: false, complete: false, messageIds: [], deliveredContent: '' });
    expect(message.reply).toHaveBeenCalledTimes(1);
    expect(loadingMessage.edit).toHaveBeenCalledTimes(1);
  });
});
