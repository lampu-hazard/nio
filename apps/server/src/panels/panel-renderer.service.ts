import { Injectable } from '@nestjs/common';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Guild, StringSelectMenuBuilder } from 'discord.js';

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
};

@Injectable()
export class PanelRendererService {
  render(panel: any, guild: Guild) {
    const isMinimal = panel.style === 'MINIMAL';

    const embed = new EmbedBuilder()
      .setColor(this.parseColor(panel.color))
      .setTitle(panel.title || this.defaultTitle(panel.type))
      .setDescription(this.description(panel));

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
    return '✦ Self Roles';
  }

  private footer(panel: any) {
    const type = TYPE_LABELS[panel.type || 'SELF_ROLE'] || 'Panel';
    const count = panel.roles?.length || 0;
    if ((panel.type || 'SELF_ROLE') === 'SELF_ROLE') return `${count} role tersedia · ${panel.mode}`;
    if (count > 0) return `${type} · ${count} optional buttons`;
    return type;
  }

  private description(panel: any) {
    const roles = panel.roles || [];
    const isMinimal = panel.style === 'MINIMAL';
    const lines = [!isMinimal && panel.accentText, panel.description].filter(Boolean) as string[];
    if ((panel.type || 'SELF_ROLE') === 'SELF_ROLE' && roles.length) {
      lines.push('✦ ━━━━━━━━━━━━━━━━━━━━━━ ✦');
      for (const role of roles) {
        lines.push(`${role.emoji || '✧'}  ✧ <@&${role.roleId}>${role.description ? ` — ${role.description}` : ''}`);
      }
    }
    return lines.join('\n') || 'No content configured yet.';
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
