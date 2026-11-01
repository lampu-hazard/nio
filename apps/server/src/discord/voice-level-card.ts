export type VoiceLevelCard = { name: string; previousLevel: number; level: number; xp: bigint; avatarUrl: string | null };

export async function renderVoiceLevelCard(input: VoiceLevelCard): Promise<Buffer> {
  // ponytail: load native rendering on demand so a missing binary falls back to the text notification.
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const canvas = createCanvas(900, 320);
  const ctx = canvas.getContext('2d');
  const text = (value: string, x: number, y: number, size: number, color: string, width: number, bold = false) => {
    ctx.font = `${bold ? 'bold ' : ''}${size}px sans-serif`;
    const characters = Array.from(value.replace(/[\r\n\t]/g, ' ')).slice(0, 120);
    let label = characters.join('');
    while (characters.length && ctx.measureText(label).width > width) { characters.pop(); label = `${characters.join('')}…`; }
    ctx.fillStyle = color;
    ctx.fillText(label, x, y);
  };
  ctx.fillStyle = '#141719'; ctx.fillRect(0, 0, 900, 320);
  ctx.fillStyle = '#5145ee'; ctx.fillRect(0, 0, 6, 320);
  ctx.fillStyle = '#252a31'; ctx.beginPath(); ctx.arc(96, 96, 52, 0, Math.PI * 2); ctx.fill();
  text(Array.from(input.name.trim())[0]?.toUpperCase() || '?', 78, 111, 38, '#edf0eb', 48, true);

  if (input.avatarUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    timeout.unref();
    try {
      const url = new URL(input.avatarUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'cdn.discordapp.com' || url.port || url.username || url.password
        || !/^\/(?:avatars\/\d+\/[\w-]+|guilds\/\d+\/users\/\d+\/avatars\/[\w-]+|embed\/avatars\/\d+)\.png$/.test(url.pathname)) throw new Error('Unsupported avatar URL');
      url.search = '?size=128';
      const response = await fetch(url, { redirect: 'error', signal: controller.signal });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png') || !response.body) throw new Error('Avatar unavailable');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 256000) throw new Error('Avatar too large');
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
      const image = await loadImage(Buffer.concat(chunks));
      ctx.save(); ctx.beginPath(); ctx.arc(96, 96, 52, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(image, 44, 44, 104, 104); ctx.restore();
    } catch { /* Keep the initial when the avatar is unavailable. */ }
    finally { clearTimeout(timeout); }
  }

  text(input.name, 176, 72, 26, '#edf0eb', 450, true);
  text('VOICE LEVEL UP', 660, 70, 16, '#a2aaa6', 204);
  text(`LEVEL ${input.previousLevel}  →  ${input.level}`, 176, 143, 48, '#edf0eb', 680, true);
  ctx.fillStyle = '#303638'; ctx.fillRect(44, 186, 812, 1);
  text('TOTAL XP', 44, 225, 15, '#a2aaa6', 350);
  text(input.xp.toLocaleString('id-ID'), 44, 267, 30, '#edf0eb', 360, true);
  text(`TARGET LEVEL ${input.level + 1}`, 460, 225, 15, '#a2aaa6', 395);
  text(`${(100n * (BigInt(input.level) + 1n) ** 2n).toLocaleString('id-ID')} XP`, 460, 267, 30, '#edf0eb', 395, true);
  return canvas.encode('png');
}
