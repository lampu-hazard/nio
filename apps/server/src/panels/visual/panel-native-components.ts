import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import type { NativePanelControl } from './panel-visual.document';

type Role = { id: string; roleId: string; label: string; emoji?: string | null; description?: string | null; buttonStyle: string };
type Panel = { id: string; type?: string; mode?: string; roles?: Role[] };
const styles: Record<string, ButtonStyle> = { PRIMARY: ButtonStyle.Primary, SECONDARY: ButtonStyle.Secondary, SUCCESS: ButtonStyle.Success, DANGER: ButtonStyle.Danger };
export function nativePanelComponents(panel: Panel, controls?: NativePanelControl[]) {
  const roles = panel.roles ?? [];
  const requested = controls ?? ((panel.type ?? 'SELF_ROLE') === 'SELF_ROLE' ? roles.map(role => ({ kind: 'role' as const, panelRoleId: role.id })) : []);
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  let buttons = new ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>();
  const flush = () => { if (buttons.components.length) { rows.push(buttons); buttons = new ActionRowBuilder(); } };
  const selected = requested.filter(control => control.kind === 'role').map(control => {
    const role = roles.find(role => role.id === control.panelRoleId);
    if (!role || (panel.type ?? 'SELF_ROLE') !== 'SELF_ROLE') throw new Error('Invalid native role control.');
    return role;
  });
  if (selected.length > 25 || new Set(selected.map(role => role.id)).size !== selected.length) throw new Error('Invalid role menu capacity.');
  let menuInserted = false;
  for (const control of requested) {
    if (control.kind === 'role' && panel.mode === 'MENU') {
      if (menuInserted) continue;
      flush();
      const menu = new StringSelectMenuBuilder().setCustomId(`sr-menu:${panel.id}`).setPlaceholder('Pilih role').addOptions(selected.map(role => ({ label: role.label, value: role.roleId, description: role.description || `Toggle ${role.label}`, ...(role.emoji ? { emoji: role.emoji } : {}) })));
      rows.push(new ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>().addComponents(menu));
      menuInserted = true;
    } else {
      const button = new ButtonBuilder();
      if (control.kind === 'link') button.setStyle(ButtonStyle.Link).setLabel(control.label).setURL(control.url);
      else {
        const role = selected.find(role => role.id === control.panelRoleId)!;
        button.setCustomId(`sr:${panel.id}:${role.roleId}`).setStyle(styles[role.buttonStyle] ?? ButtonStyle.Secondary).setLabel(role.label);
        if (role.emoji) button.setEmoji(role.emoji);
      }
      buttons.addComponents(button);
      if (buttons.components.length === 5) flush();
    }
  }
  flush();
  if (rows.length > 5) throw new Error('Native controls exceed Discord’s five-row capacity.');
  return rows;
}
