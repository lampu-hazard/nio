export interface SmartEmbedPayload {
  title: string;
  description: string;
  color: number;
  footer?: { text: string };
  timestamp?: string;
}

export interface SmartEmbedDecision {
  shouldEmbed: boolean;
  embed?: SmartEmbedPayload;
}

export function decideSmartEmbed(input: {
  content: string;
  profile?: 'PUBLIC' | 'ADMIN';
  canEmbed?: boolean;
  hasCustomEmbeds?: boolean;
}): SmartEmbedDecision {
  if (input.canEmbed === false || input.hasCustomEmbeds) {
    return { shouldEmbed: false };
  }

  const raw = (input.content || '').trim();
  if (raw.length < 180 || raw.length > 4000) {
    return { shouldEmbed: false };
  }

  let totalCodeLength = 0;
  for (const match of raw.matchAll(/```[\s\S]*?```/g)) {
    totalCodeLength += match[0].length;
  }
  if (totalCodeLength > 350 || totalCodeLength / raw.length > 0.45) {
    return { shouldEmbed: false };
  }

  const listMatches = raw.match(/^[\t ]*(?:[-*]|\d+\.) /gm) || [];
  const hasList = listMatches.length >= 2;
  const hasDivider = /^---+\s*$/m.test(raw) || /^===+\s*$/m.test(raw);
  const hasHeader = /^#{1,3}\s+\S+/m.test(raw) || /^[*_]{2}[^*_\r\n]+[*_]{2}:?\s*$/m.test(raw);
  const hasLinks =
    /\[[^\]]+\]\(https?:\/\/[^\s)]+\)/.test(raw) ||
    /(?:Tautan|Sumber|Source):\s*(?:\[[^\]]+\]\()?(?:https?:\/\/[^\s)]+)/i.test(raw);

  if (!hasList && !hasDivider && !hasHeader && !hasLinks) {
    return { shouldEmbed: false };
  }

  let title = input.profile === 'ADMIN' ? 'NIO Security' : 'NIO Intelligence';
  let body = raw;

  const firstLineEnd = raw.indexOf('\n');
  const firstLine = firstLineEnd === -1 ? raw : raw.slice(0, firstLineEnd).trim();

  const headerMatch = firstLine.match(/^#{1,3}\s+(.+)$/);
  const boldMatch = firstLine.match(/^[*_]{2}([^*_]+)[*_]{2}:?$/);

  if (headerMatch && headerMatch[1].trim().length <= 256) {
    title = headerMatch[1].trim();
    body = (firstLineEnd === -1 ? '' : raw.slice(firstLineEnd)).trim();
  } else if (boldMatch && boldMatch[1].trim().length <= 256) {
    title = boldMatch[1].trim();
    body = (firstLineEnd === -1 ? '' : raw.slice(firstLineEnd)).trim();
  }

  if (body.length === 0) {
    body = raw;
  }

  const color = input.profile === 'ADMIN' ? 0xed4245 : 0x5865f2;
  const footerText = input.profile === 'ADMIN' ? 'NIO Security AI' : 'NIO Assistant';

  return {
    shouldEmbed: true,
    embed: {
      title,
      description: body.slice(0, 4096),
      color,
      footer: { text: footerText },
      timestamp: new Date().toISOString(),
    },
  };
}
