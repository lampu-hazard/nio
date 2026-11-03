import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

@Injectable()
export class PanelPreviewLimitService {
  private readonly buckets = new Map<string, { count: number; until: number }>();

  consume(guildId: string, userId: string) {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) if (bucket.until <= now) this.buckets.delete(key);
    const key = `${guildId}:${userId}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= 10_000) throw new AppError('PANEL_PREVIEW_LIMIT', 'Preview limit reached. Try again later.', 429);
      bucket = { count: 0, until: now + 60_000 };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= 10) throw new AppError('PANEL_PREVIEW_LIMIT', 'Preview limit is 10 requests per minute.', 429);
    bucket.count++;
  }
}
