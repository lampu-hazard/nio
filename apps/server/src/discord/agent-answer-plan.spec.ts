import { describe, expect, it } from '@jest/globals';
import { planAgentAnswer } from './agent-answer-plan';

const plan = (content: string, canAttach = false, attachmentLimit = 8388608) => planAgentAnswer({ content, canAttach, attachmentLimit });
describe('answer planning', () => {
  it('uses all five parts before declaring omission and handles oversized code lines', () => {
    const content = 'a'.repeat(1840 * 5);
    const result = plan(content);
    expect(result.complete).toBe(true);
    expect(result.parts).toHaveLength(5);
    expect(result.parts.map((p) => p.sourceText).join('')).toBe(content);
    const code = plan(`\`\`\`js\n${'a'.repeat(4000)}\n\`\`\``);
    expect(code.complete).toBe(true);
    expect(code.parts.every((p) => p.content.length <= 1840)).toBe(true);
  });
  it.each([0, -1, NaN, Infinity])('disables text attachments with invalid upload cap %s', (cap) => {
    expect(plan('a'.repeat(20000), true, cap).textFile).toBeUndefined();
  });
  it('preserves lists and prioritizes newline over whitespace', () => {
    const content = `1. ${'first '.repeat(150)}\n2. ${'second '.repeat(250)}\n- final`;
    const result = plan(content);
    expect(result.parts[0].sourceText.endsWith('\n')).toBe(true);
    expect(result.parts.map((p) => p.sourceText).join('')).toBe(content);
  });
  it('preserves a full 2000-unit single answer', () => {
    expect(plan('x'.repeat(2000))).toMatchObject({ complete: true, parts: [{ content: 'x'.repeat(2000), sourceText: 'x'.repeat(2000) }] });
  });
  it('splits paragraphs without losing source text or surrogate pairs', () => {
    const content = `${'a'.repeat(1200)}\n\n${'😀'.repeat(1000)}`;
    const result = plan(content);
    expect(result.parts.length).toBeGreaterThan(1);
    expect(result.parts[0].sourceText).toBe(`${'a'.repeat(1200)}\n\n`);
    expect(result.parts.map((p) => p.sourceText).join('')).toBe(content);
    for (const p of result.parts) {
      expect(p.content.length).toBeLessThanOrEqual(1840);
      expect(p.content).not.toMatch(/[\uD800-\uDBFF]$/);
      expect(p.content).not.toMatch(/^[\uDC00-\uDFFF]/);
    }
  });
  it.each(['```ts', '~~~~js'])('closes and reopens %s fences without changing source', (opening) => {
    const closing = opening.match(/^[`~]+/)![0];
    const content = `${opening}\n${'const a = 1;\n'.repeat(400)}${closing}`;
    const result = plan(content);
    expect(result.complete).toBe(true);
    expect(result.parts.map((p) => p.sourceText).join('')).toBe(content);
    for (const p of result.parts) {
      expect(p.content.length).toBeLessThanOrEqual(1840);
      expect(p.content.startsWith(`${opening}\n`)).toBe(true);
      expect(p.content.trimEnd().endsWith(closing)).toBe(true);
    }
  });
  it('preserves links that fit in a part', () => {
    const link = `[source](https://example.com/${'a'.repeat(250)})`;
    const content = `${'a'.repeat(1750)} ${link}\n${'z'.repeat(100)}`;
    const result = plan(content);
    expect(result.parts.some((p) => p.content.includes(link))).toBe(true);
    expect(result.parts.map((p) => p.sourceText).join('')).toBe(content);
  });
  it('falls back to a trusted whole-answer attachment, bounded by UTF8 bytes', () => {
    const content = '😀'.repeat(5000);
    const result = plan(content, true);
    expect(result.parts).toHaveLength(1);
    expect(result.textFile?.name).toBe('nio-answer.txt');
    expect(result.textFile?.attachment.toString('utf8')).toBe(content);
    expect(result.complete).toBe(true);
    expect(plan(content, true, 100).textFile).toBeUndefined();
  });
  it('limits excerpts and explicitly marks omitted content without an attachment', () => {
    const result = plan('x'.repeat(20000));
    expect(result.complete).toBe(false);
    expect(result.parts).toHaveLength(5);
    expect(result.parts.at(-1)?.content).toContain('Jawaban belum terkirim seluruhnya');
    expect(result.parts.every((p) => p.content.length <= 1840)).toBe(true);
  });
  it('uses fallback for an oversized indivisible URL instead of breaking it', () => {
    const content = `https://example.com/${'a'.repeat(2500)}`;
    expect(plan(content, true).textFile?.attachment.toString()).toBe(content);
    const excerpt = plan(content);
    expect(excerpt.complete).toBe(false);
    expect(excerpt.parts[0].content).not.toContain('https://');
  });
  it('closes an unclosed fence and allows embed-only content', () => {
    expect(plan('```ts\nhello').parts[0].content).toBe('```ts\nhello\n```');
    expect(plan('').parts).toEqual([{ content: '', sourceText: '' }]);
  });
  it('enforces the text attachment byte ceiling', () => {
    expect(plan('a'.repeat(262144), true).textFile?.attachment.length).toBe(262144);
    expect(plan('a'.repeat(262145), true).textFile).toBeUndefined();
  });
});
