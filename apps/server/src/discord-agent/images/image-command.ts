export function parseImageCommand(rawContent: string, botId: string): { prompt: string } | null {
  if (!/^\d+$/.test(botId)) return null;
  const mention = new RegExp(`^\\s*<@!?${botId}>\\s+`).exec(rawContent);
  if (!mention) return null;
  const command = /^(?:buat\s+gambar|generate\s+image|gambar)(?:\s+|$)([\s\S]*)$/i.exec(rawContent.slice(mention[0].length));
  if (!command) return null;
  const prompt = command[1].trim();
  if (!prompt || prompt.length > 4000) throw new Error('IMAGE_PROMPT_INVALID');
  return { prompt };
}

export function isUnsupportedImageIntent(rawContent: string, botId: string): boolean {
  if (!/^\d+$/.test(botId) || !new RegExp(`<@!?${botId}>`).test(rawContent)) return false;
  try { if (parseImageCommand(rawContent, botId)) return false; } catch { return false; }
  const stripped = rawContent.replace(new RegExp(`^\\s*<@!?${botId}>\\s*`), '').trim();
  if (/^(?:gambarkan|buatkan\s+gambar|bikin(?:in)?\s+gambar|(?:tolong|bisa|coba)\s+(?:buat(?:kan)?\s+gambar|gambar(?:kan)?)|(?:please\s+)?(?:draw|create\s+(?:an?\s+)?image|make\s+(?:an?\s+)?image|generate\s+an\s+image))\b/i.test(stripped)) {
    return true;
  }
  return new RegExp(`^(?:tolong|bisa|coba|please)\\s+<@!?${botId}>\\s+(?:buat\\s+gambar|generate\\s+image|gambar(?:kan)?)\\b`, 'i').test(rawContent.trim());
}
