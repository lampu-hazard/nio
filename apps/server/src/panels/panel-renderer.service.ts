import { Injectable, Inject, Optional, forwardRef } from '@nestjs/common';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Guild, StringSelectMenuBuilder } from 'discord.js';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { EmbedTemplateService } from '../embed-templates/embed-template.service';
import { EmbedTemplateRendererService } from '../embed-templates/embed-template-renderer.service';
import { EmbedTemplateCategory } from '../embed-templates/embed-template.types';

const BUTTON_STYLES: Record<string, ButtonStyle> = {
  PRIMARY: ButtonStyle.Primary,
  SECONDARY: ButtonStyle.Secondary,
  SUCCESS: ButtonStyle.Success,
  DANGER: ButtonStyle.Danger,
};

const TYPE_LABELS: Record<string, string> = {
  SELF_ROLE: 'Self-role panel',
  RULES: 'Rules panel',
  ANNOUNCEMENT: 'Announcement panel',
  LEADERBOARD: 'Leaderboard panel',
};

// ponytail: map panel type → template category. Extend when new panel types are added.
const PANEL_TYPE_CATEGORY: Record<string, EmbedTemplateCategory> = {
  SELF_ROLE: 'PANEL_SELF_ROLE',
  RULES: 'PANEL_RULES',
  ANNOUNCEMENT: 'PANEL_ANNOUNCEMENT',
  LEADERBOARD: 'PANEL_LEADERBOARD',
};

@Injectable()
export class PanelRendererService {
  constructor(
    @Inject(forwardRef(() => LeaderboardService))
    private readonly leaderboard: LeaderboardService,
    @Optional() private readonly templates?: EmbedTemplateService,
    @Optional() private readonly templateRenderer?: EmbedTemplateRendererService,
  ) {}

  async render(panel: any, guild: Guild) {
    const isMinimal = panel.style === 'MINIMAL';
    const category = PANEL_TYPE_CATEGORY[panel.type || 'SELF_ROLE'];

    // Try custom template first
    if (category && this.templates && this.templateRenderer) {
      try {
        const tpl = await this.templates.getTemplate(panel.guildId, category);
        if (tpl && !tpl.isDefault) {
          const variables = await this.panelVariables(panel, guild);
          const rendered = this.templateRenderer.render(tpl.template, variables);
          return { ...rendered, components: this.components(panel) };
        }
      } catch { /* fall through to default */ }
    }

    const embed = new EmbedBuilder()
      .setColor(this.parseColor(panel.color))
      .setTitle(panel.title || this.defaultTitle(panel.type))
      .setDescription(await this.description(panel));

    if (!isMinimal) {
      embed.setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 128 }) || undefined });
      embed.setFooter({ text: this.footer(panel) });
      embed.setTimestamp();
    }

    if (!isMinimal && panel.thumbnailUrl && panel.thumbnailUrl.startsWith('http')) {
      embed.setThumbnail(panel.thumbnailUrl);
    }
    if (panel.imageUrl && panel.imageUrl.startsWith('http')) {
      embed.setImage(panel.imageUrl);
    }

    return { embeds: [embed], components: this.components(panel) };
  }

  private async panelVariables(panel: any, guild: Guild): Promise<Record<string, unknown>> {
    return {
      'guild.name': guild.name,
      'panel.name': panel.name || '',
      'panel.title': panel.title || this.defaultTitle(panel.type),
      'panel.accentText': panel.accentText || '',
      'panel.description': panel.description || '',
      'panel.role_count': (panel.roles?.length || 0).toString(),
      'leaderboard.lines': panel.type === 'LEADERBOARD' ? await this.leaderboardLines(panel) : '',
    };
  }

  private async leaderboardLines(panel: any): Promise<string> {
    const isVoice = panel.name?.toLowerCase().includes('voice');
    if (isVoice) {
      const data = await this.leaderboard.getVoiceLeaderboard(panel.guildId, '7', 10);
      if (!data?.length) return '*Belum ada aktivitas voice session tercatat.*';
      return data.map((row) => {
        const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `**#${row.rank}**`;
        return `${medal} <@${row.userId}> — \`${this.formatVoiceDuration(row.score)}\``;
      }).join('\n');
    }
    const data = await this.leaderboard.getChatLeaderboard(panel.guildId, '7', 10);
    if (!data?.length) return '*Belum ada aktivitas pesan tercatat.*';
    return data.map((row) => {
      const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `**#${row.rank}**`;
      return `${medal} <@${row.userId}> — \`${row.score} pesan\``;
    }).join('\n');
  }

  private parseColor(color?: string | null): number {
    const defaultColor = 0x5865f2;
    if (!color) return defaultColor;
    const clean = color.replace('#', '');
    if (!/^[0-9a-fA-F]{3,6}$/.test(clean)) return defaultColor;
    const parsed = parseInt(clean, 16);
    return isNaN(parsed) ? defaultColor : parsed;
  }

  private defaultTitle(type?: string) {
    if (type === 'RULES') return 'Server Rules';
    if (type === 'ANNOUNCEMENT') return 'Announcement';
    if (type === 'LEADERBOARD') return '✦ Server Leaderboard';
    return '✦ Self Roles';
  }

  private footer(panel: any) {
    const type = TYPE_LABELS[panel.type || 'SELF_ROLE'] || 'Panel';
    const count = panel.roles?.length || 0;
    if ((panel.type || 'SELF_ROLE') === 'SELF_ROLE') return `${count} role tersedia · ${panel.mode}`;
    if (count > 0) return `${type} · ${count} optional buttons`;
    return type;
  }

  private async description(panel: any) {
    const isMinimal = panel.style === 'MINIMAL';
    const lines = [!isMinimal && panel.accentText, panel.description].filter(Boolean) as string[];

    if (panel.type === 'LEADERBOARD') {
      lines.push('✦ ━━━━━━━━━━━━━━━━━━━━━━ ✦');
      const isVoice = panel.name?.toLowerCase().includes('voice');
      if (isVoice) {
        lines.push('🎙️ **VOICE LEADERBOARD (7 HARI TERAKHIR)**\n');
        const data = await this.leaderboard.getVoiceLeaderboard(panel.guildId, '7', 10);
        if (!data || !data.length) {
          lines.push('*Belum ada aktivitas voice session tercatat.*');
        } else {
          data.forEach((row) => {
            const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `**#${row.rank}**`;
            const durationFormatted = this.formatVoiceDuration(row.score);
            lines.push(`${medal} <@${row.userId}> — \`${durationFormatted}\``);
          });
        }
      } else {
        lines.push('💬 **CHAT LEADERBOARD (7 HARI TERAKHIR)**\n');
        const data = await this.leaderboard.getChatLeaderboard(panel.guildId, '7', 10);
        if (!data || !data.length) {
          lines.push('*Belum ada aktivitas pesan tercatat.*');
        } else {
          data.forEach((row) => {
            const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `**#${row.rank}**`;
            lines.push(`${medal} <@${row.userId}> — \`${row.score} pesan\``);
          });
        }
      }
      return lines.join('\n');
    }

    const roles = panel.roles || [];
    if ((panel.type || 'SELF_ROLE') === 'SELF_ROLE' && roles.length) {
      lines.push('✦ ━━━━━━━━━━━━━━━━━━━━━━ ✦');
      for (const role of roles) {
        lines.push(`${role.emoji || '✧'}  ✧ <@&${role.roleId}>${role.description ? ` — ${role.description}` : ''}`);
      }
    }
    return lines.join('\n') || 'No content configured yet.';
  }

  private formatVoiceDuration(seconds: number): string {
    if (seconds <= 0) return '0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  private components(panel: any) {
    const roles = panel.roles || [];
    if (!roles.length) return [];
    if ((panel.type || 'SELF_ROLE') !== 'SELF_ROLE') return [];
    if (panel.mode === 'MENU') {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`sr-menu:${panel.id}`)
        .setPlaceholder('✦ Pilih role yang kamu inginkan...')
        .addOptions(roles.slice(0, 25).map((role: any) => {
          const emoji = this.componentEmoji(role.emoji);
          return {
            label: role.label,
            value: role.roleId,
            description: role.description || `Toggle ${role.label}`,
            ...(emoji ? { emoji } : {}),
          };
        }));
      return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
    }

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let row = new ActionRowBuilder<ButtonBuilder>();
    roles.forEach((role: any, index: number) => {
      const button = new ButtonBuilder()
        .setCustomId(`sr:${panel.id}:${role.roleId}`)
        .setLabel(role.label)
        .setStyle(BUTTON_STYLES[role.buttonStyle] || ButtonStyle.Secondary);
      const emoji = this.componentEmoji(role.emoji);
      if (emoji) button.setEmoji(emoji);
      row.addComponents(button);
      if ((index + 1) % 5 === 0) {
        rows.push(row);
        row = new ActionRowBuilder<ButtonBuilder>();
      }
    });
    if (row.components.length) rows.push(row);
    return rows;
  }

  private componentEmoji(emoji?: string | null) {
    const value = emoji?.trim();
    if (!value) return undefined;
    if (/^<a?:\w{2,32}:\d{17,20}>$/.test(value)) return value;
    if (/^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})$/u.test(value)) return value;
    return undefined;
  }
}
