import { Injectable, Optional } from '@nestjs/common';
import { ChatInputCommandInteraction, MessageFlags, PermissionsBitField } from 'discord.js';
import { AgentProfile, parseAgentProfile } from './agent-profile.types';
import { AgentRequestService } from './agent-request.service';
import { AgentProfileRouterService } from './agent-profile-router.service';
import { AgentAccessService } from './agent-access.service';
import { ConversationMemoryService } from './conversation-memory.service';
import { parseImageCommand } from './images/image-command';

@Injectable()
export class AgentCommandService {
  constructor(
    private readonly requests: AgentRequestService,
    @Optional() private readonly router?: AgentProfileRouterService,
    @Optional() private readonly access?: AgentAccessService,
    @Optional() private readonly memory?: ConversationMemoryService,
  ) {}

  async handle(interaction: ChatInputCommandInteraction, profile: AgentProfile): Promise<void> {
    const resolvedProfile = parseAgentProfile(profile);

    if (!interaction.guildId || !interaction.guild || !interaction.channelId) {
      await interaction.reply({
        content: '⚠️ Perintah ini hanya dapat digunakan di dalam server Discord.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const prompt = (interaction.options.getString('prompt') || '').trim();
    if (!prompt) {
      await interaction.reply({
        content: '⚠️ Sebutkan pertanyaan atau instruksi.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel: any = interaction.channel;

    if (this.router) {
      const routedProfile = await this.router.resolve(
        interaction.guildId,
        interaction.channelId,
        resolvedProfile,
      );
      if (!routedProfile) {
        await interaction.reply({
          content: this.describeRouteError('CHANNEL_UNASSIGNED', resolvedProfile),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    if (this.access) {
      let isImage = false;
      try {
        isImage = Boolean(parseImageCommand(`<@0> ${prompt}`, '0'));
      } catch {
        isImage = false;
      }
      const capability = isImage ? 'IMAGE' : 'CHAT';
      const decision = await this.access.resolve(
        {
          guildId: interaction.guildId,
          profile: resolvedProfile,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        },
        capability,
      );
      if (!decision.allowed) {
        await interaction.reply({
          content: this.describeAccessError(decision.code, resolvedProfile),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    if (resolvedProfile === 'ADMIN') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } else {
      await interaction.deferReply();
    }

    const me = interaction.guild.members?.me;
    const perms = channel && me ? channel.permissionsFor?.(me) : null;
    const canAttach = Boolean(
      perms?.has(PermissionsBitField.Flags.AttachFiles) &&
        (!channel?.isThread?.() || perms?.has(PermissionsBitField.Flags.SendMessagesInThreads)),
    );
    const guildMax =
      typeof (interaction.guild as any).maximumAttachmentSize === 'number' &&
      (interaction.guild as any).maximumAttachmentSize > 0
        ? (interaction.guild as any).maximumAttachmentSize
        : 8_388_608;
    const attachmentLimit = Math.min(guildMax, 8_388_608);

    const reply = await this.requests.handle({
      guildId: interaction.guildId,
      profile: resolvedProfile,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      requestId: interaction.id,
      prompt,
      source: 'SLASH',
      canAttach,
      attachmentLimit,
    });

    if (!reply) {
      await interaction.editReply({
        content: '⚠️ Permintaan tidak dapat diproses untuk profil ini.',
      });
      return;
    }

    const edited: any = await interaction.editReply({
      content: reply.content,
      ...(reply.embeds ? { embeds: reply.embeds } : {}),
      ...(reply.components ? { components: reply.components } : {}),
      ...(reply.files ? { files: reply.files } : {}),
    });

    if (resolvedProfile === 'PUBLIC' && reply.conversationTurns && this.memory) {
      const replyId =
        edited?.id ||
        (await interaction.fetchReply?.()
          .then((m: any) => m?.id)
          .catch(() => null));
      if (replyId) {
        await this.memory.saveConversation(
          {
            guildId: interaction.guildId,
            profile: 'PUBLIC',
            channelId: interaction.channelId,
            userId: interaction.user.id,
          },
          replyId,
          reply.conversationTurns,
        );
      }
    }
  }

  private describeRouteError(code: string, profile: AgentProfile): string {
    const label = profile === 'ADMIN' ? 'Agent Admin' : 'Agent Umum';
    if (code === 'CHANNEL_EXCLUDED') {
      return `⚠️ Channel ini dikecualikan untuk ${label}.`;
    }
    if (code === 'AMBIGUOUS_CHANNEL_PROFILE') {
      return '⚠️ Konfigurasi channel bentrok antara Agent Umum dan Agent Admin. Hubungi administrator server.';
    }
    if (code === 'PROFILE_DISABLED' || code === 'CHANNEL_UNASSIGNED') {
      return `⚠️ Channel ini belum diaktifkan untuk ${label}.`;
    }
    return `⚠️ Permintaan ${label} tidak diizinkan di channel ini.`;
  }

  private describeAccessError(code: string, profile: AgentProfile): string {
    const label = profile === 'ADMIN' ? 'Agent Admin' : 'Agent Umum';
    if (code === 'AGENT_DISABLED' || code === 'IMAGE_DISABLED') {
      return `⚠️ ${label} belum diaktifkan di server ini.`;
    }
    if (code === 'CHANNEL_EXCLUDED' || code === 'CHANNEL_NOT_ALLOWED') {
      return `⚠️ ${label} tidak diizinkan di channel ini.`;
    }
    if (code === 'ROLE_DENIED' || code === 'USER_DENIED') {
      return `⚠️ Kamu tidak memiliki izin untuk menggunakan ${label}.`;
    }
    return `⚠️ Akses ke ${label} ditolak (${code}).`;
  }
}
