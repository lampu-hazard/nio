export type VoiceLevelCard = { name: string; previousLevel: number; level: number; xp: bigint; avatarUrl: string | null };
export type VoiceStatsCard = {
  name: string;
  level: number;
  xp: bigint;
  totalDuration: string;
  sessionDuration: string;
  avatarUrl: string | null;
};

async function drawAvatarAndFrame(ctx: any, loadImage: (src: Buffer) => Promise<any>, name: string, avatarUrl: string | null, height: number, drawText: (value: string, x: number, y: number, size: number, color: string, width: number, bold?: boolean) => void) {
  ctx.fillStyle = '#141719'; ctx.fillRect(0, 0, 900, height);
  ctx.fillStyle = '#5145ee'; ctx.fillRect(0, 0, 6, height);
  ctx.fillStyle = '#252a31'; ctx.beginPath(); ctx.arc(96, 96, 52, 0, Math.PI * 2); ctx.fill();
  drawText(Array.from(name.trim())[0]?.toUpperCase() || '?', 78, 111, 38, '#edf0eb', 48, true);

  if (avatarUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    timeout.unref?.();
    try {
      const url = new URL(avatarUrl);
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
}

function makeTextDrawer(ctx: any) {
  return (value: string, x: number, y: number, size: number, color: string, width: number, bold = false) => {
    ctx.font = `${bold ? 'bold ' : ''}${size}px sans-serif`;
    const characters = Array.from(value.replace(/[\r\n\t]/g, ' ')).slice(0, 120);
    let label = characters.join('');
    while (characters.length && ctx.measureText(label).width > width) { characters.pop(); label = `${characters.join('')}…`; }
    ctx.fillStyle = color;
    ctx.fillText(label, x, y);
  };
}

export async function renderVoiceLevelCard(input: VoiceLevelCard): Promise<Buffer> {
  // ponytail: load native rendering on demand so a missing binary falls back to the text notification.
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const canvas = createCanvas(900, 320);
  const ctx = canvas.getContext('2d');
  const text = makeTextDrawer(ctx);
  await drawAvatarAndFrame(ctx, loadImage, input.name, input.avatarUrl, 320, text);

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

export async function renderVoiceStatsCard(input: VoiceStatsCard): Promise<Buffer> {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const canvas = createCanvas(900, 340);
  const ctx = canvas.getContext('2d');
  const text = makeTextDrawer(ctx);
  await drawAvatarAndFrame(ctx, loadImage, input.name, input.avatarUrl, 340, text);

  const floorXp = 100n * BigInt(input.level) ** 2n;
  const nextXp = 100n * (BigInt(input.level) + 1n) ** 2n;
  const span = nextXp > floorXp ? nextXp - floorXp : 100n;
  const gained = input.xp > floorXp ? input.xp - floorXp : 0n;
  const permille = Number((gained >= span ? span : gained) * 1000n / span);
  const ratio = Math.max(0, Math.min(1, permille / 1000));

  text(input.name, 176, 68, 28, '#edf0eb', 460, true);
  text('VOICE STATS & XP', 176, 95, 14, '#a2aaa6', 300);

  ctx.fillStyle = '#1d2127'; ctx.fillRect(656, 38, 200, 62);
  ctx.fillStyle = '#5145ee'; ctx.fillRect(656, 38, 4, 62);
  text('CURRENT LEVEL', 674, 60, 12, '#a2aaa6', 170);
  text(`LEVEL ${input.level}`, 674, 88, 26, '#edf0eb', 170, true);

  text(`XP MENUJU LEVEL ${input.level + 1}`, 176, 134, 14, '#a2aaa6', 300);
  text(`${input.xp.toLocaleString('id-ID')} / ${nextXp.toLocaleString('id-ID')} XP (${Math.round(ratio * 100)}%)`, 480, 134, 15, '#edf0eb', 376, true);
  ctx.fillStyle = '#252a31'; ctx.fillRect(176, 146, 680, 16);
  if (ratio > 0) {
    ctx.fillStyle = '#5145ee';
    ctx.fillRect(176, 146, Math.max(8, Math.round(680 * ratio)), 16);
  }

  ctx.fillStyle = '#303638'; ctx.fillRect(44, 192, 812, 1);

  ctx.fillStyle = '#1b1f24'; ctx.fillRect(44, 214, 394, 96);
  text('TOTAL WAKTU TERCATAT', 64, 244, 14, '#a2aaa6', 354);
  text(input.totalDuration, 64, 284, 28, '#edf0eb', 354, true);

  ctx.fillStyle = '#1b1f24'; ctx.fillRect(462, 214, 394, 96);
  text('SESI BERJALAN (CHANNEL INI)', 482, 244, 14, '#a2aaa6', 354);
  text(input.sessionDuration, 482, 284, 26, '#edf0eb', 354, true);

  return canvas.encode('png');
}
