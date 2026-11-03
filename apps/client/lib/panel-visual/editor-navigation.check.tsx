import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PanelEditorNavigation, PanelEditorSection } from '../../components/panel-editor/PanelEditorNavigation';

for (const active of ['content', 'appearance', 'settings']) {
  const html = renderToStaticMarkup(<>
    <PanelEditorNavigation label="Panel settings" active={active} onChange={() => {}} items={[{ id: 'content', label: 'Content' }, { id: 'appearance', label: 'Appearance' }, { id: 'settings', label: 'Settings' }]} />
    {['content', 'appearance', 'settings'].map(id => <PanelEditorSection key={id} id={id} active={active}><input name={id} defaultValue="retained draft" /></PanelEditorSection>)}
  </>);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((html.match(/hidden=""/g) ?? []).length, 2, 'Only one settings section is visible');
  assert.equal((html.match(/retained draft/g) ?? []).length, 3, 'Inactive sections keep their fields mounted');
  assert.ok(html.includes('aria-label="Panel settings"'));
  assert.equal((html.match(/type="button"/g) ?? []).length, 3, 'Navigation must never submit the form');
}
console.log('Panel editor navigation: single visible section and mounted draft retention passed.');
