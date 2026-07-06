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
    const duration = proposal.payload?.durationMinutes ? `\nDuration: ${proposal.payload.durationMinutes} minutes` : '';

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`AI Action Proposal: ${proposal.actionType}`)
      .setDescription(`Target: ${proposal.targetUserId ? `<@${proposal.targetUserId}>` : 'Unknown'}\nReason: ${reason}${duration}`)
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
}
