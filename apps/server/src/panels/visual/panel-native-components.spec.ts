import { describe, expect, it } from '@jest/globals';
import { nativePanelComponents } from './panel-native-components';
const panel = { id: 'p', type: 'SELF_ROLE', mode: 'BUTTONS', roles: [{ id: 'r', roleId: '123', label: 'Role', buttonStyle: 'PRIMARY' }] };
const link = { kind: 'link' as const, id: 'link', label: 'Website', url: 'https://example.com/' };
describe('native panel controls', () => {
  it('preserves mixed role and link order with existing custom IDs', () => {
    const rows = nativePanelComponents(panel, [link, { kind: 'role', panelRoleId: 'r' }]).map(row => row.toJSON());
    expect(rows[0].components).toMatchObject([{ style: 5, url: 'https://example.com/' }, { custom_id: 'sr:p:123' }]);
  });
  it('uses a whole menu row and separate link buttons', () => {
    const rows = nativePanelComponents({ ...panel, mode: 'MENU' }, [link, { kind: 'role', panelRoleId: 'r' }]).map(row => row.toJSON());
    expect(rows).toHaveLength(2);
    expect(rows[1].components[0]).toMatchObject({ custom_id: 'sr-menu:p', options: [{ value: '123' }] });
  });
  it('distinguishes absent defaults and explicitly empty controls', () => {
    expect(nativePanelComponents(panel, undefined)).toHaveLength(1);
    expect(nativePanelComponents(panel, [])).toHaveLength(0);
  });
  it('allows links but not role handlers in rules panels', () => {
    expect(nativePanelComponents({ ...panel, type: 'RULES' }, [link])).toHaveLength(1);
    expect(() => nativePanelComponents({ ...panel, type: 'RULES' }, [{ kind: 'role', panelRoleId: 'r' }])).toThrow();
  });
  it('rejects invalid references and rows beyond Discord capacity', () => {
    expect(() => nativePanelComponents(panel, [{ kind: 'role', panelRoleId: 'foreign' }])).toThrow();
    expect(() => nativePanelComponents(panel, Array.from({ length: 26 }, (_, i) => ({ ...link, id: String(i) })))).toThrow();
  });
});
