import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { deliverPlannedAnswer, DeliveryPayload } from './agent-answer-delivery';
import { planAgentAnswer } from './agent-answer-plan';

describe('planned answer delivery', () => {
  it('records a sanitized warning without an optional logger callback', async () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    try {
      await deliverPlannedAnswer({ plan: { complete: true, parts: [{ content: 'hello', sourceText: 'hello' }] }, first: async () => { throw Error('secret transport details'); }, next: async () => ({}) });
      expect(warning).toHaveBeenCalledWith('ANSWER_DELIVERY_FAILED');
    } finally { warning.mockRestore(); }
  });
  it('awaits each send, sends extras once and does not replay success missing an ID', async () => {
    const sent: DeliveryPayload[] = [];
    let release!: () => void;
    const pending = deliverPlannedAnswer({
      plan: { complete: true, parts: [{ content: 'one', sourceText: 'one' }, { content: 'two', sourceText: 'two' }] },
      extras: { embeds: [{ title: 'card' }], files: [{ attachment: Buffer.from('image'), name: 'image.png' }] },
      first: async (p) => { sent.push(p); await new Promise<void>((r) => { release = r; }); return {}; },
      next: async (p) => { sent.push(p); return { id: 'two' }; },
    });
    expect(sent).toHaveLength(1);
    release();
    const receipt = await pending;
    expect(sent).toHaveLength(2);
    expect(sent[1].embeds).toBeUndefined();
    expect(sent[1].files).toBeUndefined();
    expect(sent.every((p) => p.allowedMentions.repliedUser === false && p.allowedMentions.parse.length === 0)).toBe(true);
    expect(receipt).toMatchObject({ delivered: true, complete: true, messageIds: ['two'], deliveredContent: 'onetwo' });
  });
  it.each([false, true])('retains only delivered text when continuation and warning edit fail=%s', async (warningFails) => {
    const sent: string[] = [];
    const receipt = await deliverPlannedAnswer({
      plan: { complete: true, parts: [1, 2, 3].map((n) => ({ content: `part${n}`, sourceText: `source${n}` })) },
      first: async (p) => { sent.push(p.content); return { id: 'first', edit: async (p) => { if (warningFails) throw Error('edit'); sent.push(p.content); } }; },
      next: async () => { throw Error('offline'); },
      warn: () => { throw Error('logger unavailable'); },
    });
    expect(receipt.complete).toBe(false);
    expect(receipt.messageIds).toEqual(['first']);
    expect(receipt.messageId).toBe('first');
    expect(receipt.deliveredContent).toBe(`source1${warningFails ? '' : '\n\nPengiriman jawaban terhenti. Sebagian jawaban belum terkirim.'}`);
    expect(sent).toHaveLength(warningFails ? 1 : 2);
  });
  it('does not upload first-message files again when editing a failure notice', async () => {
    const edits: DeliveryPayload[] = [];
    await deliverPlannedAnswer({
      plan: { complete: true, parts: [{ content: 'one', sourceText: 'one' }, { content: 'two', sourceText: 'two' }] },
      extras: { files: [{ attachment: Buffer.from('image'), name: 'nio-generated.png' }] },
      first: async () => ({ id: 'one', edit: async (p) => { edits.push(p); } }),
      next: async () => { throw Error('offline'); },
    });
    expect(edits[0].files).toBeUndefined();
  });
  it.each([1, 2, 3, 4])('stops at failed continuation boundary %s and preserves earlier parts', async (failure) => {
    let calls = 0;
    const receipt = await deliverPlannedAnswer({
      plan: { complete: true, parts: Array.from({ length: 5 }, (_, i) => ({ content: String(i), sourceText: String(i) })) },
      first: async () => ({ id: '0' }),
      next: async () => { calls++; if (calls === failure) throw Error('offline'); return { id: String(calls) }; },
    });
    expect(calls).toBe(failure);
    expect(receipt.messageIds).toEqual(Array.from({ length: failure }, (_, i) => String(i)));
    expect(receipt.deliveredContent).toBe(Array.from({ length: failure }, (_, i) => String(i)).join(''));
    expect(receipt.complete).toBe(false);
  });
  it('returns an empty receipt on failed first send', async () => {
    const receipt = await deliverPlannedAnswer({ plan: planAgentAnswer({ content: 'hello', canAttach: false, attachmentLimit: 0 }), first: async () => { throw Error(); }, next: async () => { throw Error('must not run'); } });
    expect(receipt).toEqual({ delivered: false, complete: false, messageIds: [], deliveredContent: '' });
  });
  it('stores canonical complete attachment text and not synthetic fence markers', async () => {
    const content = `\`\`\`ts\n${'hello\n'.repeat(2500)}\`\`\``;
    const plan = planAgentAnswer({ content, canAttach: true, attachmentLimit: 8388608 });
    let file: any;
    const receipt = await deliverPlannedAnswer({ plan, first: async (p) => { file = p.files?.[0]; return { id: 'file' }; }, next: async () => { throw Error(); } });
    expect(file.name).toBe('nio-answer.txt');
    expect(file.attachment.toString()).toBe(content);
    expect(receipt.deliveredContent).toContain(content);
  });
});
