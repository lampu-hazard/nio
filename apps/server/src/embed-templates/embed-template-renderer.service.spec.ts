import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';
import { EmbedTemplateRendererService } from './embed-template-renderer.service';

describe('EmbedTemplateRendererService', () => {
  const service = new EmbedTemplateRendererService();

  it('interpolates whitelisted variables and blanks unknown variables', () => {
    const result = service.render({ embeds: [{ description: 'Halo {user.mention} {missing.value}' }] }, { 'user.mention': '<@1>' });
    expect(result.embeds[0].toJSON().description).toBe('Halo <@1>');
  });

  it('rejects too long titles', () => {
    expect(() => service.render({ embeds: [{ title: 'x'.repeat(257) }] }, {})).toThrow(BadRequestException);
  });

  it('parses hex colors', () => {
    const result = service.render({ embeds: [{ color: '#F59E0B', description: 'ok' }] }, {});
    expect(result.embeds[0].toJSON().color).toBe(0xf59e0b);
  });
});
