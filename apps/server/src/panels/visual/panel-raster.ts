import sharp from 'sharp';

export type ValidatedRasterAsset = { bytes: Buffer; width: number; height: number };

export async function inspectPanelRaster(bytes: Buffer, contentType?: string): Promise<ValidatedRasterAsset> {
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Panel image exceeds the 5 MiB size limit.');
  const format = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpeg'
    : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null;
  if (!format || (contentType && contentType.split(';')[0].trim().toLowerCase() !== `image/${format}`)) {
    throw new Error('Panel image type and signature do not match an allowed raster.');
  }
  const metadata = await sharp(bytes, { limitInputPixels: 16_000_000, animated: true }).metadata();
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > 16_000_000 || (metadata.pages ?? 1) !== 1) {
    throw new Error('Panel image exceeds decoded size limit or is animated.');
  }
  return { bytes, width: metadata.width, height: metadata.height };
}
