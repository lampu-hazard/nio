import { useState } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '@/lib/api';
import type { ReactNode } from 'react';
import type { EmbedTemplatePayload } from './template-types';

type Path = { kind: 'content' } | { kind: 'embed'; index: number; key: string } | { kind: 'field'; embedIndex: number; fieldIndex: number; key: 'name' | 'value' };

type SortableFieldRowProps = {
  id: string;
  children: (handle: ReactNode) => ReactNode;
};

function SortableFieldRow({ id, children }: SortableFieldRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const handle = (
    <button
      type="button"
      className="btn btn-secondary h-9 px-2 text-xs cursor-grab active:cursor-grabbing"
      aria-label="Drag field"
      {...attributes}
      {...listeners}
    >
      ⋮⋮
    </button>
  );

  return <div ref={setNodeRef} style={style}>{children(handle)}</div>;
}

export function TemplateEditor({ guildId, template, onChange, onFocusPath }: {
  guildId: string;
  template: EmbedTemplatePayload;
  onChange: (template: EmbedTemplatePayload) => void;
  onFocusPath: (path: Path) => void;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const updateEmbed = (index: number, patch: any) => {
    onChange({ ...template, embeds: template.embeds.map((embed, idx) => idx === index ? { ...embed, ...patch } : embed) });
  };
  const updateField = (embedIndex: number, fieldIndex: number, patch: any) => {
    onChange({
      ...template,
      embeds: template.embeds.map((embed, idx) => idx === embedIndex ? {
        ...embed,
        fields: (embed.fields || []).map((field, fIdx) => fIdx === fieldIndex ? { ...field, ...patch } : field),
      } : embed),
    });
  };
  const addField = (embedIndex: number) => updateEmbed(embedIndex, { fields: [...(template.embeds[embedIndex].fields || []), { name: 'Field', value: 'Value', inline: false }] });
  const removeField = (embedIndex: number, fieldIndex: number) => updateEmbed(embedIndex, { fields: (template.embeds[embedIndex].fields || []).filter((_, idx) => idx !== fieldIndex) });
  const moveField = (embedIndex: number, fieldIndex: number, direction: -1 | 1) => {
    const fields = [...(template.embeds[embedIndex].fields || [])];
    const nextIndex = fieldIndex + direction;
    if (nextIndex < 0 || nextIndex >= fields.length) return;
    updateEmbed(embedIndex, { fields: arrayMove(fields, fieldIndex, nextIndex) });
  };
  const dragField = (embedIndex: number, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = Number(active.id);
    const newIndex = Number(over.id);
    if (Number.isNaN(oldIndex) || Number.isNaN(newIndex)) return;
    updateEmbed(embedIndex, { fields: arrayMove(template.embeds[embedIndex].fields || [], oldIndex, newIndex) });
  };
  const uploadImage = async (embedIndex: number, key: 'imageUrl' | 'thumbnailUrl', file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      alert('Upload PNG, JPG, GIF, or WEBP only.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be 5MB or smaller.');
      return;
    }
    const uploadKey = `${embedIndex}-${key}`;
    setUploading(uploadKey);
    try {
      const res = await api<{ ok: boolean; uploadUrl: string; url: string }>(`/guilds/${guildId}/panels/upload-url`, {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, contentType: file.type }),
      });
      await fetch(res.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      updateEmbed(embedIndex, { [key]: res.url });
    } catch (err: any) {
      alert(err?.message || 'Upload failed.');
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="field-label">Message Content</span>
        <textarea className="input min-h-20" value={template.content || ''} onFocus={() => onFocusPath({ kind: 'content' })} onChange={(e) => onChange({ ...template, content: e.target.value })} />
      </label>

      {template.embeds.map((embed, index) => {
        const fields = embed.fields || [];
        return (
          <div key={index} className="card space-y-4 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[var(--text)]">Embed {index + 1}</h3>
              {template.embeds.length > 1 && <button type="button" className="btn btn-secondary h-8 px-3 text-xs" onClick={() => onChange({ ...template, embeds: template.embeds.filter((_, idx) => idx !== index) })}>Remove</button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="field-label">Title</span><input className="input" value={embed.title || ''} onFocus={() => onFocusPath({ kind: 'embed', index, key: 'title' })} onChange={(e) => updateEmbed(index, { title: e.target.value })} /></label>
              <label className="block"><span className="field-label">Color</span><input className="input" value={embed.color || '#5865F2'} onChange={(e) => updateEmbed(index, { color: e.target.value })} /></label>
            </div>
            <label className="block"><span className="field-label">Description</span><textarea className="input min-h-28" value={embed.description || ''} onFocus={() => onFocusPath({ kind: 'embed', index, key: 'description' })} onChange={(e) => updateEmbed(index, { description: e.target.value })} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['imageUrl', 'thumbnailUrl'] as const).map((key) => {
                const label = key === 'imageUrl' ? 'Main Image' : 'Thumbnail';
                const value = embed[key] || '';
                const uploadKey = `${index}-${key}`;
                return (
                  <div key={key} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="field-label">{label}</span>
                      {value && <button type="button" className="text-xs font-semibold text-red-500 hover:underline" onClick={() => updateEmbed(index, { [key]: '' })}>Remove</button>}
                    </div>
                    {value ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel-strong)]">
                        <img src={value} alt="" className={key === 'thumbnailUrl' ? 'h-24 w-full object-cover' : 'h-36 w-full object-cover'} />
                      </div>
                    ) : (
                      <label className="mt-2 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel-strong)] px-4 py-5 text-center hover:border-indigo-500/60">
                        <span className="text-sm font-bold text-[var(--text)]">Upload {label}</span>
                        <span className="mt-1 text-xs text-[var(--muted)]">PNG, JPG, GIF, WEBP · max 5MB · saved to R2</span>
                        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={(e) => uploadImage(index, key, e.target.files?.[0])} />
                      </label>
                    )}
                    <div className="mt-2 flex gap-2">
                      <input className="input text-xs" value={value} placeholder="Or paste image URL" onFocus={() => onFocusPath({ kind: 'embed', index, key })} onChange={(e) => updateEmbed(index, { [key]: e.target.value })} />
                      <label className="btn btn-secondary flex h-11 cursor-pointer items-center px-3 text-xs">
                        {uploading === uploadKey ? 'Uploading...' : 'Upload'}
                        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" disabled={uploading === uploadKey} onChange={(e) => uploadImage(index, key, e.target.files?.[0])} />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            <label className="block"><span className="field-label">Footer</span><input className="input" value={embed.footer?.text || ''} onFocus={() => onFocusPath({ kind: 'embed', index, key: 'footer' })} onChange={(e) => updateEmbed(index, { footer: { ...(embed.footer || {}), text: e.target.value } })} /></label>
            <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
              <input type="checkbox" checked={Boolean(embed.timestamp)} onChange={(e) => updateEmbed(index, { timestamp: e.target.checked })} />
              Show timestamp
            </label>

            <div>
              <div className="flex items-center justify-between"><span className="field-label">Fields</span><button type="button" className="btn btn-secondary h-8 px-3 text-xs" onClick={() => addField(index)}>Add Field</button></div>
              <DndContext collisionDetection={closestCenter} onDragEnd={(event) => dragField(index, event)}>
                <SortableContext items={fields.map((_, fieldIndex) => String(fieldIndex))} strategy={verticalListSortingStrategy}>
                  <div className="mt-2 space-y-2">
                    {fields.map((field, fieldIndex) => (
                      <SortableFieldRow key={`${fieldIndex}-${field.name}`} id={String(fieldIndex)}>
                        {(handle) => (
                          <div className="grid gap-2 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-[auto_1fr_1fr_auto]">
                            <div>{handle}</div>
                            <input className="input" value={field.name} onFocus={() => onFocusPath({ kind: 'field', embedIndex: index, fieldIndex, key: 'name' })} onChange={(e) => updateField(index, fieldIndex, { name: e.target.value })} />
                            <input className="input" value={field.value} onFocus={() => onFocusPath({ kind: 'field', embedIndex: index, fieldIndex, key: 'value' })} onChange={(e) => updateField(index, fieldIndex, { value: e.target.value })} />
                            <div className="flex flex-wrap gap-2">
                              <button type="button" className="btn btn-secondary h-9 px-2 text-xs" disabled={fieldIndex === 0} onClick={() => moveField(index, fieldIndex, -1)}>↑</button>
                              <button type="button" className="btn btn-secondary h-9 px-2 text-xs" disabled={fieldIndex === fields.length - 1} onClick={() => moveField(index, fieldIndex, 1)}>↓</button>
                              <label className="flex h-9 items-center gap-1 text-xs font-semibold text-[var(--muted)]"><input type="checkbox" checked={Boolean(field.inline)} onChange={(e) => updateField(index, fieldIndex, { inline: e.target.checked })} /> Inline</label>
                              <button type="button" className="btn btn-secondary h-9 px-3 text-xs" onClick={() => removeField(index, fieldIndex)}>Remove</button>
                            </div>
                          </div>
                        )}
                      </SortableFieldRow>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </div>
        );
      })}
      <button type="button" className="btn btn-secondary" onClick={() => onChange({ ...template, embeds: [...template.embeds, { color: '#5865F2', description: '' }] })}>Add Embed</button>
    </div>
  );
}
export type FocusPath = Path;
