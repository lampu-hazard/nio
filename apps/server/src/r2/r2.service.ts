import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class R2Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow('R2_BUCKET_NAME');
    const publicUrl = new URL(this.config.getOrThrow('R2_PUBLIC_URL'));
    if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash) {
      throw new Error('R2_PUBLIC_URL must be an absolute HTTPS URL without credentials, query or fragment.');
    }
    this.publicUrl = publicUrl.href.replace(/\/+$/, '');

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${this.config.getOrThrow('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.config.getOrThrow('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow('R2_SECRET_ACCESS_KEY'),
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    maxSizeBytes: number,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: 900 });
  }

  async headObject(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async readPanelAsset(guildId: string, assetKey: string, signal?: AbortSignal) {
    if (!/^\d+$/.test(guildId) || !new RegExp(`^panels/${guildId}/[\\w-]+\\.(?:png|jpe?g|webp)$`, 'i').test(assetKey)) {
      throw new Error('Panel asset must belong to this server.');
    }
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: assetKey }), { abortSignal: signal });
    const limit = 5 * 1024 * 1024;
    const body = result.Body;
    if (!body) throw new Error('Panel asset is empty.');
    const stream = body as typeof body & AsyncIterable<Uint8Array> & { destroy?: () => void };
    try {
      if (result.ContentLength !== undefined && result.ContentLength > limit) throw new Error('Panel asset exceeds size limit.');
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of stream) {
        signal?.throwIfAborted();
        size += chunk.byteLength;
        if (size > limit) throw new Error('Panel asset exceeds size limit.');
        chunks.push(Buffer.from(chunk));
      }
      return { bytes: Buffer.concat(chunks), contentType: result.ContentType };
    } finally {
      stream.destroy?.();
    }
  }

  getPublicUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }
}
