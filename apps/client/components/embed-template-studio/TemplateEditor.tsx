import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

export function TemplateEditor({ template, onChange, onFocusPath }: {
  template: EmbedTemplatePayload;
  onChange: (template: EmbedTemplatePayload) => void;
  onFocusPath: (path: Path) => void;
}) {
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
              <label className="block"><span className="field-label">Image URL</span><input className="input" value={embed.imageUrl || ''} onFocus={() => onFocusPath({ kind: 'embed', index, key: 'imageUrl' })} onChange={(e) => updateEmbed(index, { imageUrl: e.target.value })} /></label>
              <label className="block"><span className="field-label">Thumbnail URL</span><input className="input" value={embed.thumbnailUrl || ''} onFocus={() => onFocusPath({ kind: 'embed', index, key: 'thumbnailUrl' })} onChange={(e) => updateEmbed(index, { thumbnailUrl: e.target.value })} /></label>
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
