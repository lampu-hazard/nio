import { Injectable } from '@nestjs/common';

@Injectable()
export class PanelPublishLockService {
  private readonly pending = new Map<string, Promise<void>>();

  async run<T>(guildId: string, panelId: string, work: () => Promise<T>): Promise<T> {
    const key = `${guildId}:${panelId}`;
    const previous = this.pending.get(key) ?? Promise.resolve();
    let release!: () => void;
    const done = new Promise<void>(resolve => { release = resolve; });
    this.pending.set(key, done);
    await previous;
    try { return await work(); }
    finally {
      release();
      if (this.pending.get(key) === done) this.pending.delete(key);
    }
  }
}
