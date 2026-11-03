import type { APIEmbed, MessageCreateOptions } from 'discord.js';
import { AppError } from '../../common/errors/app-error';

export function validatePanelPayload(payload: MessageCreateOptions) {
  const fail = (message: string): never => { throw new AppError('PANEL_PAYLOAD_INVALID', message, 400); };
  const json = (value: any) => typeof value?.toJSON === 'function' ? value.toJSON() : value;
  const text = (value: string | undefined, max: number, label: string, required = false) => {
    if ((required && !value?.length) || (value?.length ?? 0) > max) fail(`${label} must contain ${required ? '1' : '0'}–${max} characters.`);
    return value?.length ?? 0;
  };
  text(payload.content ?? undefined, 2000, 'Message content');
  if ((payload.embeds?.length ?? 0) > 10) fail('Discord supports at most 10 embeds.');
  let total = 0;
  for (const raw of payload.embeds ?? []) {
    const embed = json(raw) as APIEmbed;
    total += text(embed.title, 256, 'Embed title') + text(embed.description, 4096, 'Embed description') + text(embed.footer?.text, 2048, 'Embed footer') + text(embed.author?.name, 256, 'Embed author');
    if ((embed.fields?.length ?? 0) > 25) fail('An embed supports at most 25 fields.');
    for (const field of embed.fields ?? []) total += text(field.name, 256, 'Field name', true) + text(field.value, 1024, 'Field value', true);
  }
  if (total > 6000) fail('All embeds together must contain at most 6,000 characters.');
  if ((payload.components?.length ?? 0) > 5) fail('Discord supports at most five control rows.');
  const ids = new Set<string>();
  for (const raw of payload.components ?? []) {
    const row = json(raw);
    if (row.type !== 1 || !row.components?.length || row.components.length > 5) fail('Control rows must contain 1–5 buttons or one dropdown.');
    for (const rawComponent of row.components) {
      const component = json(rawComponent);
      if (component.type === 2) {
        text(component.label, 80, 'Button label', true);
        if (component.style === 5) {
          try { const url = new URL(component.url); if (url.protocol !== 'https:' || url.username || url.password) fail('Link buttons require HTTPS URLs.'); } catch { fail('Link buttons require HTTPS URLs.'); }
          text(component.url, 512, 'Button URL', true);
        } else if (![1, 2, 3, 4].includes(component.style)) fail('Invalid button style.');
      } else if (component.type === 3) {
        if (row.components.length !== 1 || !component.options?.length || component.options.length > 25) fail('A dropdown needs 1–25 options and its own row.');
        text(component.placeholder, 150, 'Dropdown placeholder');
        const values = new Set<string>();
        for (const option of component.options) {
          text(option.label, 100, 'Dropdown label', true); text(option.value, 100, 'Dropdown value', true); text(option.description, 100, 'Dropdown description');
          if (values.has(option.value)) fail('Dropdown values must be unique.'); values.add(option.value);
        }
      } else fail('Unsupported Discord control type.');
      if (component.style !== 5) {
        text(component.custom_id, 100, 'Control ID', true);
        if (ids.has(component.custom_id)) fail('Control IDs must be unique.'); ids.add(component.custom_id);
      }
    }
  }
}
