import { Injectable, Optional } from '@nestjs/common';
import {
  AgentProgressCallback,
  AgentReply,
  DiscordAgentService,
  ReferencedMessageContext,
} from './discord-agent.service';
import { AgentRequestScope, parseAgentProfile } from './agent-profile.types';
import { AgentImageService } from './images/agent-image.service';
import { isUnsupportedImageIntent, parseImageCommand } from './images/image-command';

export type AgentRequestInput = AgentRequestScope & {
  requestId: string;
  prompt: string;
  source: 'MENTION' | 'REPLY' | 'SLASH';
  referencedBotMessageId?: string;
  replyContext?: ReferencedMessageContext;
  canAttach?: boolean;
  attachmentLimit?: number;
  onProgress?: AgentProgressCallback;
};

@Injectable()
export class AgentRequestService {
  constructor(
    private readonly agent: DiscordAgentService,
    @Optional() private readonly images?: AgentImageService,
  ) {}

  async handle(input: AgentRequestInput): Promise<AgentReply | null> {
    const profile = parseAgentProfile(input.profile);
    const botId = input.source === 'SLASH' ? '0' : (process.env.DISCORD_CLIENT_ID || '0');
    const rawForImage = input.source === 'SLASH' ? `<@${botId}> ${input.prompt}` : input.prompt;

    let imageCommand: { prompt: string } | null = null;
    try {
      imageCommand = parseImageCommand(rawForImage, botId);
    } catch {
      return {
        profile,
        content: '⚠️ Gunakan @nio gambar <prompt> dengan prompt 1–4.000 karakter.',
      };
    }

    if (imageCommand) {
      if (!this.images) {
        return {
          profile,
          content: '⚠️ Fitur generasi gambar belum diaktifkan untuk server ini.',
        };
      }
      const reply = await this.images.handle({
        guildId: input.guildId,
        profile,
        channelId: input.channelId,
        userId: input.userId,
        messageId: input.requestId,
        prompt: imageCommand.prompt,
        canAttach: Boolean(input.canAttach),
        attachmentLimit: input.attachmentLimit ?? 8_388_608,
      });
      return {
        profile,
        ...reply,
      };
    }

    if (isUnsupportedImageIntent(rawForImage, botId)) {
      return {
        profile,
        content: 'ℹ️ Untuk membuat gambar, gunakan perintah eksplisit di awal pesan: `@nio gambar <prompt>`, `@nio buat gambar <prompt>`, atau `@nio generate image <prompt>`.',
      };
    }

    return this.agent.handleMention(
      input.guildId,
      input.channelId,
      input.userId,
      input.prompt,
      input.referencedBotMessageId,
      input.replyContext,
      input.onProgress,
      profile,
    );
  }
}
