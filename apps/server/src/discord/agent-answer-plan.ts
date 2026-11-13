export type PlannedAnswerPart = { content: string; sourceText: string };
export type AnswerPlan = {
  parts: PlannedAnswerPart[];
  complete: boolean;
  textFile?: { attachment: Buffer; name: 'nio-answer.txt' };
};
export const ANSWER_OMITTED = 'Jawaban belum terkirim seluruhnya karena batas pesan. Minta bagian tertentu untuk melanjutkan.';
const FILE_NOTICE = 'Jawaban lengkap tersedia di berkas nio-answer.txt.';
const PART_LIMIT = 1840;
type Fence = { opening: string; marker: string };
type Range = { start: number; end: number };

/** Source slices are canonical; synthetic close/reopen delimiters never enter memory. */
export function planAgentAnswer(input: {
  content: string; canAttach: boolean; attachmentLimit: number;
}): AnswerPlan {
  const text = input.content;
  const protectedRanges: Range[] = [];
  const events: Array<{ end: number; fence: Fence | undefined }> = [];
  let active: Fence | undefined;
  for (const match of text.matchAll(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)(?:\r?\n|$)/gm)) {
    const marker = match[1];
    if (!active) {
      if (marker[0] === '`' && match[2].includes('`')) continue;
      active = { opening: match[0].replace(/\r?\n$/, ''), marker };
    } else if (marker[0] === active.marker[0] && marker.length >= active.marker.length && !match[2].trim()) {
      active = undefined;
    } else continue;
    protectedRanges.push({ start: match.index!, end: match.index! + match[0].length });
    events.push({ end: match.index! + match[0].length, fence: active });
  }
  // Keep ordinary Markdown links and bare URLs indivisible. Nested URL parentheses
  // are accepted to one level; unusual Markdown remains ordinary Unicode-safe text.
  for (const match of text.matchAll(/\[[^\]\r\n]*\]\((?:[^\s()]|\([^\s()]*\))*\)|https?:\/\/[^\s<>]+/g)) {
    protectedRanges.push({ start: match.index!, end: match.index! + match[0].length });
  }
  protectedRanges.sort((a, b) => a.start - b.start);
  const stateAt = (position: number): Fence | undefined => {
    let state: Fence | undefined;
    for (const event of events) { if (event.end > position) break; state = event.fence; }
    return state;
  };
  const render = (start: number, end: number): PlannedAnswerPart => {
    const before = stateAt(start);
    const after = stateAt(end);
    const sourceText = text.slice(start, end);
    const prefix = before ? `${before.opening}\n` : '';
    const body = prefix + sourceText;
    return { sourceText, content: body + (after ? `${body.endsWith('\n') ? '' : '\n'}${after.marker}` : '') };
  };
  const whole = render(0, text.length);
  if (whole.content.length <= 2000) return { parts: [whole], complete: true };

  const safeEnd = (end: number, start: number): number => {
    for (const range of protectedRanges) {
      if (range.start >= end) break;
      if (range.end > end) end = range.start;
    }
    if (end > start && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end] ?? '')) end--;
    return end;
  };
  const parts: PlannedAnswerPart[] = [];
  let position = 0;
  while (position < text.length && parts.length < 5) {
    const needsNotice = parts.length === 4 && render(position, text.length).content.length > PART_LIMIT;
    const budget = PART_LIMIT - (needsNotice ? ANSWER_OMITTED.length + 2 : 0);
    const prefix = stateAt(position);
    let end = safeEnd(Math.min(text.length, position + budget - (prefix ? prefix.opening.length + 1 : 0)), position);
    // Reserve the actual closing fence, including its separator, then reconsider
    // boundaries. Fence headers themselves are protected from partial sends.
    while (end > position && render(position, end).content.length > budget) {
      end = safeEnd(end - Math.max(1, render(position, end).content.length - budget), position);
    }
    if (end <= position) break;
    if (end < text.length) {
      const slice = text.slice(position, end);
      let boundary = 0;
      for (const pattern of [/\n\s*\n/g, /\n/g, /\s+/g]) {
        for (const match of slice.matchAll(pattern)) {
          const candidate = position + match.index! + match[0].length;
          if (safeEnd(candidate, position) === candidate) boundary = candidate;
        }
        if (boundary > position) break;
      }
      if (boundary > position) end = boundary;
    }
    parts.push(render(position, end));
    position = end;
  }
  if (position === text.length) return { parts, complete: true };
  const byteLength = Buffer.byteLength(text, 'utf8');
  if (input.canAttach && Number.isFinite(input.attachmentLimit) && input.attachmentLimit > 0 && byteLength <= Math.min(262144, input.attachmentLimit)) {
    return {
      parts: [{ content: FILE_NOTICE, sourceText: `${text}\n\n${FILE_NOTICE}` }], complete: true,
      textFile: { attachment: Buffer.from(text, 'utf8'), name: 'nio-answer.txt' },
    };
  }
  if (!parts.length) parts.push({ content: '', sourceText: '' });
  const last = parts[parts.length - 1];
  // A stopped oversized token may leave fewer than five full parts. A separate
  // notice keeps their source intact and still respects the message bound.
  if (last.content.length + 2 + ANSWER_OMITTED.length > PART_LIMIT) {
    parts.push({ content: ANSWER_OMITTED, sourceText: ANSWER_OMITTED });
  } else {
    last.content += `${last.content ? '\n\n' : ''}${ANSWER_OMITTED}`;
    last.sourceText += `${last.sourceText ? '\n\n' : ''}${ANSWER_OMITTED}`;
  }
  return { parts, complete: false };
}
