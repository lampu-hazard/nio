type FontLoader = { load(font: string): Promise<unknown[]>; ready: Promise<unknown> };

export async function ensurePanelFonts(fonts: FontLoader = document.fonts): Promise<void> {
  const loaded = await Promise.all([
    fonts.load('400 24px "Panel DejaVu Sans"'),
    fonts.load('700 24px "Panel DejaVu Sans"'),
  ]);
  await fonts.ready;
  if (loaded.some(faces => faces.length === 0)) throw new Error('Panel fonts could not be loaded.');
}
