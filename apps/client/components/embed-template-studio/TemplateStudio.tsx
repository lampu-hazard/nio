'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { EmbedPreview } from './EmbedPreview';
import { TemplateEditor } from './TemplateEditor';
import type { FocusPath } from './TemplateEditor';
import type { CategoryMeta, EmbedTemplatePayload, TemplateListResponse, TemplateRow } from './template-types';
import { VariableChips } from './VariableChips';

function insertAt(value: string, token: string) {
  return `${value || ''}${token}`;
}

export function TemplateStudio({ guildId }: { guildId: string }) {
  const [categories, setCategories] = useState<CategoryMeta[]>([]);
  const [templates, setTemplates] = useState<Record<string, TemplateRow>>({});
  const [selected, setSelected] = useState('TAKO_PUBLIC_ANNOUNCEMENT');
  const [draft, setDraft] = useState<EmbedTemplatePayload>({ embeds: [{ description: '' }] });
  const [focusPath, setFocusPath] = useState<FocusPath>({ kind: 'embed', index: 0, key: 'description' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { load(); }, [guildId]);

  async function load() {
    setLoading(true);
    const res = await api<TemplateListResponse>(`/guilds/${guildId}/embed-templates`);
    setCategories(res.categories);
    setTemplates(res.templates);
    const first = res.templates[selected] ? selected : res.categories[0]?.category;
    if (first) {
      setSelected(first);
      setDraft(JSON.parse(JSON.stringify(res.templates[first].template)));
    }
    setLoading(false);
  }

  function selectCategory(category: string) {
    setSelected(category);
    setDraft(JSON.parse(JSON.stringify(templates[category].template)));
  }

  function insertVariable(token: string) {
    if (focusPath.kind === 'content') setDraft((prev) => ({ ...prev, content: insertAt(prev.content || '', token) }));
    if (focusPath.kind === 'embed') setDraft((prev) => ({
      ...prev,
      embeds: prev.embeds.map((embed, idx) => idx === focusPath.index
        ? focusPath.key === 'footer'
          ? { ...embed, footer: { ...(embed.footer || {}), text: insertAt(embed.footer?.text || '', token) } }
          : { ...embed, [focusPath.key]: insertAt((embed as any)[focusPath.key] || '', token) }
        : embed),
    }));
    if (focusPath.kind === 'field') setDraft((prev) => ({
      ...prev,
      embeds: prev.embeds.map((embed, idx) => idx === focusPath.embedIndex ? {
        ...embed,
        fields: (embed.fields || []).map((field, fIdx) => fIdx === focusPath.fieldIndex ? { ...field, [focusPath.key]: insertAt(field[focusPath.key], token) } : field),
      } : embed),
    }));
  }

  async function save() {
    setSaving(true);
    setMessage('');
    await api(`/guilds/${guildId}/embed-templates/${selected}`, {
      method: 'PUT',
      body: JSON.stringify({ template: draft }),
    });
    setMessage('Template saved.');
    await load();
    setSaving(false);
  }

  async function reset() {
    setSaving(true);
    await api(`/guilds/${guildId}/embed-templates/${selected}`, { method: 'DELETE' });
    setMessage('Template reset to default.');
    await load();
    setSaving(false);
  }

  if (loading) return <div className="card p-6 text-sm text-[var(--muted)]">Loading Embed Studio...</div>;
  const meta = categories.find((category) => category.category === selected) || categories[0];
  const groups = Array.from(new Set(categories.map((category) => category.group)));

  return (
    <div className="space-y-6">
      {message && <div className="notice notice-success">{message}</div>}
      <div className="grid gap-6 xl:grid-cols-[260px_1fr_420px]">
        <aside className="card p-4">
          <h2 className="text-sm font-bold text-[var(--text)]">Categories</h2>
          <div className="mt-3 space-y-4">
            {groups.map((group) => (
              <div key={group}>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">{group}</p>
                {categories.filter((category) => category.group === group).map((category) => (
                  <button
                    key={category.category}
                    type="button"
                    onClick={() => selectCategory(category.category)}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${selected === category.category ? 'bg-indigo-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--panel-strong)]'}`}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        <section className="space-y-4">
          <div className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Editing</p>
                <h2 className="text-xl font-bold text-[var(--text)]">{meta?.label}</h2>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={reset} disabled={saving} className="btn btn-secondary px-4">Reset</button>
                <button type="button" onClick={save} disabled={saving} className="btn btn-primary px-4">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          </div>
          <VariableChips variables={meta?.variables || []} onInsert={insertVariable} />
          <TemplateEditor guildId={guildId} template={draft} onChange={setDraft} onFocusPath={setFocusPath} />
        </section>

        <section className="space-y-4">
          <div className="card p-4">
            <h2 className="text-sm font-bold text-[var(--text)]">Live Preview</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Approximate Discord preview with example variable data.</p>
          </div>
          <EmbedPreview template={draft} />
        </section>
      </div>
    </div>
  );
}
