import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { PanelsService } from '../panels.service';
import { DiscordPublisherService } from '../discord-publisher.service';
import { PanelPublishLockService } from './panel-publish-lock.service';

@Injectable()
export class PanelPublishCoordinatorService {
  constructor(private readonly panels: PanelsService, private readonly publisher: DiscordPublisherService, private readonly locks: PanelPublishLockService) {}

  async publish(guildId: string, panelId: string, userId: string, expectedRevision?: number) {
    const snapshot = await this.panels.get(guildId, panelId);
    if (expectedRevision !== undefined && snapshot.revision !== expectedRevision) this.conflict();
    const prepared = await this.publisher.prepare(snapshot);
    return this.locks.run(guildId, panelId, async () => {
      const current = await this.panels.get(guildId, panelId);
      if (current.revision !== snapshot.revision) this.conflict();
      const message = await this.publisher.sendPrepared(current, prepared);
      const panel = await this.panels.markPublished(guildId, panelId, message!.id, userId, true);
      return { ok: true, messageId: message!.id, panel };
    });
  }

  unpublish(guildId: string, panelId: string, userId: string) {
    return this.locks.run(guildId, panelId, async () => {
      const current = await this.panels.get(guildId, panelId);
      await this.publisher.deletePublishedMessage(current);
      return { ok: true, panel: await this.panels.markUnpublished(guildId, panelId, userId, true) };
    });
  }

  private conflict(): never {
    throw new AppError('PANEL_REVISION_CONFLICT', 'Panel changed. Save or reload before publishing.', 409);
  }
}
