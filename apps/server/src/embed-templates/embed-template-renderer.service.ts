import { BadRequestException, Injectable } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';
import { EmbedTemplatePayload } from './embed-template.types';

@Injectable()
export class EmbedTemplateRendererService {
  render(template: EmbedTemplatePayload, variables: Record<string, unknown>) {
    const content = this.interpolate(template.content || '', variables).slice(0, 2000) || undefined;
    const embeds = (template.embeds || []).slice(0, 10).map((source) => {
      const embed = new EmbedBuilder().setColor(this.parseColor(source.color));
      const title = this.interpolate(source.title || '', variables);
      const description = this.interpolate(source.description || '', variables);
      if (title) embed.setTitle(this.limit(title, 256, 'Embed title'));
      if (description) embed.setDescription(this.limit(description, 4096, 'Embed description'));
      const authorName = this.interpolate(source.author?.name || '', variables);
      const authorIcon = this.interpolate(source.author?.iconUrl || '', variables);
      if (authorName) embed.setAuthor({ name: this.limit(authorName, 256, 'Embed author'), iconURL: this.validUrl(authorIcon) });
      const footerText = this.interpolate(source.footer?.text || '', variables);
      const footerIcon = this.interpolate(source.footer?.iconUrl || '', variables);
      if (footerText) embed.setFooter({ text: this.limit(footerText, 2048, 'Embed footer'), iconURL: this.validUrl(footerIcon) });
      const imageUrl = this.validUrl(this.interpolate(source.imageUrl || '', variables));
      const thumbnailUrl = this.validUrl(this.interpolate(source.thumbnailUrl || '', variables));
      if (imageUrl) embed.setImage(imageUrl);
      if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
      const fields = (source.fields || []).slice(0, 25)
        .map((field) => ({
          name: this.limit(this.interpolate(field.name, variables), 256, 'Embed field name') || '​',
          value: this.limit(this.interpolate(field.value, variables), 1024, 'Embed field value') || '​',
          inline: Boolean(field.inline),
        }));
      if (fields.length) embed.addFields(fields);
      if (source.timestamp) embed.setTimestamp();
      return embed;
    });
    this.validateTotalLength(embeds);
    return { ...(content ? { content } : {}), embeds };
  }

  interpolate(value: string, variables: Record<string, unknown>) {
    return String(value || '').replace(/\{([a-zA-Z0-9_.-]+)\}/g, (_match, key) => {
      const raw = variables[key];
      return raw === undefined || raw === null ? '' : String(raw);
    }).replace(/[ \t]+\n/g, '\n').trim();
  }

  private limit(value: string, max: number, label: string) {
    if (value.length > max) throw new BadRequestException(`${label} must be ${max} characters or fewer.`);
    return value;
  }

  private parseColor(color?: string) {
    const clean = (color || '#5865F2').replace('#', '');
    return /^[0-9a-fA-F]{6}$/.test(clean) ? parseInt(clean, 16) : 0x5865f2;
  }

  private validUrl(value: string) {
    if (!value) return undefined;
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  private validateTotalLength(embeds: EmbedBuilder[]) {
    const total = embeds.reduce((sum, embed) => {
      const data = embed.toJSON();
      return sum
        + (data.title?.length || 0)
        + (data.description?.length || 0)
        + (data.footer?.text?.length || 0)
        + (data.author?.name?.length || 0)
        + (data.fields || []).reduce((fieldSum, field) => fieldSum + field.name.length + field.value.length, 0);
    }, 0);
    if (total > 6000) throw new BadRequestException('Embed content must be 6000 characters or fewer.');
  }
}
