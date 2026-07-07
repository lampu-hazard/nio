import { Injectable } from '@nestjs/common';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

type ActionTheme = {
  color: number;
  label: string;
  category: string;
};

@Injectable()
export class AgentActionRendererService {
  renderProposalMessage(proposal: {
    id: string;
    actionType: string;
    targetUserId: string | null;
    payload: any;
    expiresAt: Date;
  }) {
    const reason = String(proposal.payload?.reason || 'No reason provided.');
    const theme = this.getActionTheme(proposal.actionType);
    const description = this.formatProposalDescription(proposal, reason, theme);

    const embed = new EmbedBuilder()
      .setColor(theme.color)
      .setTitle(theme.label)
      .setDescription(description.length > 4096 ? `${description.slice(0, 4093)}...` : description)
      .setFooter({ text: `Proposal ${proposal.id} · Expires ${proposal.expiresAt.toISOString()}` })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`agent:approve:${proposal.id}`)
        .setLabel('Execute')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`agent:cancel:${proposal.id}`)
        .setLabel('Dismiss')
        .setStyle(ButtonStyle.Secondary),
    );

    return { embeds: [embed], components: [row] };
  }

  renderExecutionResult(title: string, description: string) {
    const isCancelled = /cancel|dismiss/i.test(title);
    const isExecuted = /executed|success|berhasil/i.test(title);

    return {
      embeds: [
        new EmbedBuilder()
          .setColor(isExecuted ? 0x2ecc71 : isCancelled ? 0x7f8c8d : 0x2b2d31)
          .setTitle(isExecuted ? 'Action Executed' : isCancelled ? 'Proposal Dismissed' : title)
          .setDescription(description)
          .setTimestamp(),
      ],
      components: [],
    };
  }

  private formatProposalDescription(
    proposal: { actionType: string; targetUserId: string | null; payload: any },
    reason: string,
    theme: ActionTheme,
  ) {
    const target = proposal.targetUserId ? `<@${proposal.targetUserId}> (\`${proposal.targetUserId}\`)` : '`No member target`';
    const details = this.formatActionDetails(proposal);

    return [
      `### ${theme.category}`,
      '**Action**',
      `> \`${proposal.actionType}\``,
      '',
      '**Target**',
      `> ${target}`,
      '',
      '**Reason**',
      `> ${reason}`,
      '',
      '**Details**',
      details || '> No extra details.',
    ].join('\n');
  }

  private formatActionDetails(proposal: { actionType: string; payload: any }) {
    const lines: string[] = [];

    if (proposal.actionType === 'TIMEOUT' && proposal.payload?.durationMinutes) {
      lines.push(`> Duration: \`${proposal.payload.durationMinutes} minutes\``);
    }

    if (proposal.actionType === 'BAN') {
      lines.push(`> Delete message history: \`${proposal.payload?.deleteMessageSeconds ?? 0} seconds\``);
    }

    if (proposal.actionType === 'ADD_ROLE' || proposal.actionType === 'REMOVE_ROLE') {
      lines.push(`> Role: <@&${proposal.payload?.roleId}> (\`${proposal.payload?.roleId}\`)`);
    }

    if (proposal.actionType === 'REVOKE_WARNING') {
      lines.push(`> Warning ID: \`${proposal.payload?.warningId}\``);
    }

    if (proposal.actionType === 'REMOVE_TIMEOUT') {
      lines.push('> Remove the active Discord timeout from this member.');
    }

    if (proposal.actionType === 'LOCKDOWN') {
      lines.push(`> Channel: <#${proposal.payload?.channelId}>`);
      lines.push('> Action: deny Send Messages permission override for @everyone.');
    }

    if (proposal.actionType === 'UNLOCK') {
      lines.push(`> Channel: <#${proposal.payload?.channelId}>`);
      lines.push('> Action: reset/clear Send Messages permission override for @everyone.');
    }

    if (proposal.actionType === 'SET_SLOWMODE') {
      lines.push(`> Channel: <#${proposal.payload?.channelId}>`);
      lines.push(`> Slowmode: \`${proposal.payload?.slowmodeSeconds ?? 0} seconds\``);
    }

    if (proposal.actionType === 'SEND_ANNOUNCEMENT') {
      lines.push(`> Channel: <#${proposal.payload?.channelId}>`);
      if (proposal.payload?.title) {
        lines.push(`> Title: **${proposal.payload.title}**`);
      }
      lines.push(`> Content: ${proposal.payload?.content}`);
      lines.push(`> Ping: \`${proposal.payload?.announcementPing || 'none'}\``);
      if (proposal.payload?.announcementColor) {
        lines.push(`> Color: \`${proposal.payload.announcementColor}\``);
      }
      if (proposal.payload?.announcementImageUrl) {
        lines.push(`> Image: [link](${proposal.payload.announcementImageUrl})`);
      }
      if (proposal.payload?.announcementThumbnailUrl) {
        lines.push(`> Thumbnail: [link](${proposal.payload.announcementThumbnailUrl})`);
      }
      if (proposal.payload?.announcementFooter) {
        lines.push(`> Footer: ${proposal.payload.announcementFooter}`);
      }
    }

    if (proposal.actionType === 'PURGE') {
      lines.push(`> Channel: <#${proposal.payload?.channelId}>`);
      lines.push(`> Limit: \`${proposal.payload?.limit ?? 0} recent messages\``);
      lines.push(`> Filter: ${proposal.payload?.targetUserId ? `<@${proposal.payload.targetUserId}> only` : '`Any author`'}`);
      lines.push('> Constraint: only messages younger than 14 days and not pinned are eligible.');
    }

    if (proposal.actionType === 'PURGE_USER_MESSAGES') {
      const channels = Array.isArray(proposal.payload?.channels) ? proposal.payload.channels : [];
      lines.push(`> Member: <@${proposal.payload?.targetUserId}> (\`${proposal.payload?.targetUserId}\`)`);
      lines.push(`> Limit: \`${proposal.payload?.limit ?? 0} recent messages per channel\``);
      lines.push(`> Channels: ${channels.length ? channels.map((channelId: string) => `<#${channelId}>`).join(', ') : '`All text channels`'}`);
      lines.push('> Constraint: only messages younger than 14 days and not pinned are eligible.');
    }

    if (['MASS_TIMEOUT', 'MASS_KICK', 'MASS_BAN'].includes(proposal.actionType)) {
      const targets = (proposal.payload?.targetUserIds as string[]) || [];
      const targetMentions = targets.map((id) => `<@${id}>`).join(', ');
      lines.push(`> Action: mass \`${proposal.actionType.replace('MASS_', '')}\``);
      lines.push(`> Target Members (${targets.length}): ${targetMentions}`);
      if (proposal.actionType === 'MASS_TIMEOUT' && proposal.payload?.durationMinutes) {
        lines.push(`> Duration: \`${proposal.payload.durationMinutes} minutes\``);
      }
    }

    if (proposal.actionType === 'MANAGE_STICKER') {
      const action = proposal.payload?.stickerAction;
      lines.push(`> Action: \`${action}\` sticker trigger`);
      lines.push(`> Keyword Name: \`${proposal.payload?.stickerName}\``);
      if (action === 'ADD') {
        lines.push(`> File URL: [link](${proposal.payload?.stickerUrl})`);
      } else if (action === 'DELETE') {
        lines.push(`> Sticker ID: \`${proposal.payload?.stickerId}\``);
      }
    }

    if (proposal.actionType === 'UPDATE_SETTINGS') {
      const settings = proposal.payload?.settings || {};
      const changes = Object.entries(settings).map(([key, value]) => `> ${key}: \`${this.formatValue(value)}\``);
      lines.push(...(changes.length ? changes : ['> No supported settings provided.']));
    }

    return lines.join('\n');
  }

  private getActionTheme(actionType: string): ActionTheme {
    if (actionType === 'BAN' || actionType === 'KICK' || actionType === 'MASS_BAN' || actionType === 'MASS_KICK') {
      return { color: 0xe74c3c, label: 'Critical Moderation Proposal', category: 'Critical moderation action' };
    }
    if (actionType === 'WARN' || actionType === 'TIMEOUT' || actionType === 'MASS_TIMEOUT') {
      return { color: 0xe67e22, label: 'Moderation Proposal', category: 'Moderation action' };
    }
    if (actionType === 'ADD_ROLE' || actionType === 'REMOVE_ROLE' || actionType === 'MANAGE_STICKER') {
      return { color: 0x5865f2, label: 'Role Management Proposal', category: 'Role management action' };
    }
    if (actionType === 'REVOKE_WARNING' || actionType === 'REMOVE_TIMEOUT' || actionType === 'UNLOCK') {
      return { color: 0x2ecc71, label: 'Recovery Proposal', category: 'Moderation recovery action' };
    }
    if (actionType === 'LOCKDOWN') {
      return { color: 0xe74c3c, label: 'Lockdown Proposal', category: 'Channel lockdown action' };
    }
    if (actionType === 'SET_SLOWMODE') {
      return { color: 0x7f8c8d, label: 'Set Slowmode Proposal', category: 'Channel slowmode action' };
    }
    if (actionType === 'SEND_ANNOUNCEMENT') {
      return { color: 0x5865f2, label: 'Send Announcement Proposal', category: 'Guild announcement action' };
    }
    if (actionType === 'PURGE_USER_MESSAGES') {
      return { color: 0xe67e22, label: 'User Message Purge Proposal', category: 'Message cleanup action' };
    }
    if (actionType === 'PURGE' || actionType === 'UPDATE_SETTINGS') {
      return { color: 0x7f8c8d, label: 'Server Operations Proposal', category: 'Server operations action' };
    }
    return { color: 0x2b2d31, label: 'AI Action Proposal', category: 'AI action proposal' };
  }

  private formatValue(value: unknown) {
    if (Array.isArray(value)) return value.length ? value.join(', ') : '[]';
    if (value === null) return 'null';
    return String(value);
  }
}
