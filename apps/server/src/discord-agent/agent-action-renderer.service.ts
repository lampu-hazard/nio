import { Injectable } from '@nestjs/common';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

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
    const description = this.buildDescription(proposal, reason);

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`AI Action Proposal: ${proposal.actionType}`)
      .setDescription(description.length > 4096 ? `${description.slice(0, 4093)}...` : description)
      .setFooter({ text: `Proposal ID: ${proposal.id} · Expires ${proposal.expiresAt.toISOString()}` });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`agent:approve:${proposal.id}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`agent:cancel:${proposal.id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );

    return { embeds: [embed], components: [row] };
  }

  renderExecutionResult(title: string, description: string) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle(title)
          .setDescription(description)
          .setTimestamp(),
      ],
      components: [],
    };
  }

  private buildDescription(proposal: { actionType: string; targetUserId: string | null; payload: any }, reason: string) {
    const target = proposal.targetUserId ? `<@${proposal.targetUserId}>` : 'None';
    const lines = [`Target: ${target}`, `Reason: ${reason}`];

    if (proposal.actionType === 'TIMEOUT' && proposal.payload?.durationMinutes) {
      lines.push(`Duration: ${proposal.payload.durationMinutes} minutes`);
    }

    if (proposal.actionType === 'BAN') {
      lines.push(`Delete message history: ${proposal.payload?.deleteMessageSeconds ?? 0} seconds`);
    }

    if (proposal.actionType === 'ADD_ROLE' || proposal.actionType === 'REMOVE_ROLE') {
      lines.push(`Role: <@&${proposal.payload?.roleId}>`);
    }

    if (proposal.actionType === 'REVOKE_WARNING') {
      lines.push(`Warning ID: ${proposal.payload?.warningId}`);
    }

    if (proposal.actionType === 'REMOVE_TIMEOUT') {
      lines.push('Action: remove the active Discord timeout from this member.');
    }

    if (proposal.actionType === 'PURGE') {
      lines.push(`Channel: <#${proposal.payload?.channelId}>`);
      lines.push(`Limit: ${proposal.payload?.limit ?? 0} recent messages`);
      lines.push(`Filter: ${proposal.payload?.targetUserId ? `<@${proposal.payload.targetUserId}> only` : 'Any author'}`);
      lines.push('Constraint: only messages younger than 14 days and not pinned are eligible.');
    }

    if (proposal.actionType === 'UPDATE_SETTINGS') {
      const settings = proposal.payload?.settings || {};
      const changes = Object.entries(settings)
        .map(([key, value]) => `- ${key}: ${this.formatValue(value)}`)
        .join('\n');
      lines.push('Proposed settings:');
      lines.push(changes || '- No supported settings provided');
    }

    return lines.join('\n');
  }

  private formatValue(value: unknown) {
    if (Array.isArray(value)) return value.length ? value.join(', ') : '[]';
    if (value === null) return 'null';
    return String(value);
  }
}
