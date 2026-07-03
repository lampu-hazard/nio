'use client';

import { useRouter } from 'next/navigation';
import { DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import type { Panel, PanelRole } from '@/lib/types';

type DiscordRole = {
  id: string;
  name: string;
  color?: string;
  position: number;
  manageable: boolean;
};

type FormState = {
  loading?: boolean;
  deletingId?: string;
  editingId?: string;
  publishing?: boolean;
  unpublishing?: boolean;
  reordering?: boolean;
  error?: string;
  success?: string;
};

type EditRoleDraft = {
  label: string;
  emoji: string;
  description: string;
  buttonStyle: PanelRole['buttonStyle'];
};

const BUTTON_STYLES = [
  { value: 'SECONDARY', label: 'Gray' },
  { value: 'PRIMARY', label: 'Blurple' },
  { value: 'SUCCESS', label: 'Green' },
  { value: 'DANGER', label: 'Red' },
];

function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function RoleOptionList({
  guildId,
  panel,
  availableRoles = [],
}: {
  guildId: string;
  panel: Panel;
  availableRoles?: DiscordRole[];
}) {
  const router = useRouter();
  const [state, setState] = useState<FormState>({});
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [orderedRoles, setOrderedRoles] = useState<PanelRole[]>(panel.roles);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditRoleDraft | null>(null);

  useEffect(() => setOrderedRoles(panel.roles), [panel.roles]);

  const selectedRole = useMemo(
    () => availableRoles.find((role) => role.id === selectedRoleId),
    [availableRoles, selectedRoleId],
  );
  const addedRoleIds = useMemo(() => new Set(orderedRoles.map((role) => role.roleId)), [orderedRoles]);
  const addableRoles = availableRoles.filter((role) => !addedRoleIds.has(role.id));
  const roleBuilderEnabled = panel.type === 'SELF_ROLE';
  const isPublished = panel.status === 'PUBLISHED' && Boolean(panel.messageId);

  async function addRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roleBuilderEnabled) {
      setState({ error: 'Ganti panel type ke Self Role untuk menambahkan role buttons.' });
      return;
    }
    setState({ loading: true });

    const formData = new FormData(event.currentTarget);
    const roleId = String(formData.get('roleId') || '');
    const role = availableRoles.find((item) => item.id === roleId);
    const label = String(formData.get('label') || role?.name || '').trim();

    if (!roleId || !label) {
      setState({ error: 'Pilih role dan isi label dulu.' });
      return;
    }

    try {
      const response = await fetch(`/api/guilds/${guildId}/panels/${panel.id}/roles`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleId,
          label,
          emoji: String(formData.get('emoji') || '').trim() || undefined,
          description: String(formData.get('description') || '').trim() || undefined,
          buttonStyle: String(formData.get('buttonStyle') || 'SECONDARY'),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Gagal menambahkan role');

      setSelectedRoleId('');
      setState({ success: 'Role berhasil ditambahkan ke panel.' });
      router.refresh();
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : 'Gagal menambahkan role' });
    }
  }

  async function removeRole(roleOptionId: string) {
    setState({ deletingId: roleOptionId });
    try {
      const response = await fetch(`/api/guilds/${guildId}/panels/${panel.id}/roles/${roleOptionId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Gagal menghapus role');
      setState({ success: 'Role dihapus dari panel.' });
      router.refresh();
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : 'Gagal menghapus role' });
    }
  }

  function startEditingRole(role: PanelRole) {
    setEditingRoleId(role.id);
    setEditDraft({
      label: role.label,
      emoji: role.emoji || '',
      description: role.description || '',
      buttonStyle: role.buttonStyle,
    });
    setState({});
  }

  function cancelEditingRole() {
    setEditingRoleId(null);
    setEditDraft(null);
    setState({});
  }

  async function updateRole(event: FormEvent<HTMLFormElement>, roleOptionId: string) {
    event.preventDefault();
    if (!editDraft) return;

    const label = editDraft.label.trim();
    if (!label) {
      setState({ error: 'Label role wajib diisi.' });
      return;
    }

    setState({ editingId: roleOptionId });

    try {
      const response = await fetch(`/api/guilds/${guildId}/panels/${panel.id}/roles/${roleOptionId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          emoji: editDraft.emoji.trim() || undefined,
          description: editDraft.description.trim() || undefined,
          buttonStyle: editDraft.buttonStyle,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Gagal mengedit role');

      setEditingRoleId(null);
      setEditDraft(null);
      setState({ success: isPublished ? 'Role option disimpan. Klik Update Discord Message untuk sync ke Discord.' : 'Role option berhasil disimpan.' });
      router.refresh();
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : 'Gagal mengedit role' });
    }
  }

  async function publishPanel() {
    setState({ publishing: true });
    try {
      const response = await fetch(`/api/guilds/${guildId}/panels/${panel.id}/publish`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Gagal publish panel');
      setState({ success: isPublished ? 'Discord message berhasil diupdate.' : `Panel berhasil dipublish. Message ID: ${data.messageId}` });
      router.refresh();
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : 'Gagal publish panel' });
    }
  }

  async function unpublishPanel() {
    setState({ unpublishing: true });
    try {
      const response = await fetch(`/api/guilds/${guildId}/panels/${panel.id}/publish`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Gagal menghapus message Discord');
      setState({ success: 'Message Discord dihapus. Panel kembali menjadi draft.' });
      router.refresh();
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : 'Gagal menghapus message Discord' });
    }
  }

  async function persistOrder(nextRoles: PanelRole[]) {
    setOrderedRoles(nextRoles);
    setState({ reordering: true });
    try {
      const response = await fetch(`/api/guilds/${guildId}/panels/${panel.id}/roles/reorder`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleOptionIds: nextRoles.map((role) => role.id) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Gagal mengurutkan role');
      setState({ success: 'Urutan role disimpan.' });
      router.refresh();
    } catch (error) {
      setOrderedRoles(panel.roles);
      setState({ error: error instanceof Error ? error.message : 'Gagal mengurutkan role' });
    }
  }

  function onDropRole(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const from = orderedRoles.findIndex((role) => role.id === draggedId);
    const to = orderedRoles.findIndex((role) => role.id === targetId);
    if (from < 0 || to < 0) return;
    setDraggedId(null);
    void persistOrder(moveItem(orderedRoles, from, to));
  }

  function nudgeRole(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= orderedRoles.length) return;
    void persistOrder(moveItem(orderedRoles, index, target));
  }

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-[var(--border)] bg-[var(--bg-subtle)] px-6 py-5 md:px-7">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="badge mb-3">Publish & Components</div>
          <h2 className="text-2xl font-black tracking-tight">Message controls</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Publish/update/delete pesan Discord. Role buttons aktif khusus panel type Self Role.</p>
        </div>
        <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--border)] bg-white p-2">
          <button type="button" onClick={publishPanel} disabled={state.publishing} className="btn btn-success">
            {state.publishing ? 'Syncing...' : isPublished ? 'Update Discord Message' : 'Publish Panel'}
          </button>
          {panel.messageId && (
            <button type="button" onClick={unpublishPanel} disabled={state.unpublishing} className="btn btn-danger">
              {state.unpublishing ? 'Deleting...' : 'Delete Discord Message'}
            </button>
          )}
        </div>
      </div>
      </div>

      <div className="px-6 py-6 md:px-7">
      {state.error && <div className="notice notice-error">{state.error}</div>}
      {state.success && <div className="notice notice-success mt-4">{state.success}</div>}
      {!roleBuilderEnabled && (
        <div className="notice mt-4 border-blue-200 bg-blue-50 text-blue-800">
          Panel type ini adalah {panel.type}. Role buttons tidak akan dikirim ke Discord. Ganti type ke Self Role kalau ingin memakai button/dropdown role.
        </div>
      )}

      <div className={`mt-5 grid gap-5 2xl:grid-cols-[360px_1fr] ${roleBuilderEnabled ? '' : 'opacity-60'}`}>
        <form onSubmit={addRole} className="card-flat p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-black">Add role</h3>
            <span className="text-xs font-bold text-slate-500">{orderedRoles.length}/25</span>
          </div>
          <div className="mt-4 grid gap-3">
            <label className="block">
              <span className="field-label">Discord role</span>
              <select name="roleId" value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)} className="input" required disabled={!roleBuilderEnabled}>
                <option value="" disabled>Pilih role</option>
                {addableRoles.map((role) => (
                  <option key={role.id} value={role.id} disabled={!role.manageable}>@{role.name}{role.manageable ? '' : ' — bot role kurang tinggi'}</option>
                ))}
              </select>
              {!availableRoles.length && <p className="mt-2 text-xs text-amber-300">Role belum kebaca. Pastikan bot ada di server.</p>}
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="field-label">Label</span>
                <input key={selectedRoleId || 'empty-label'} name="label" defaultValue={selectedRole?.name || ''} placeholder="Gamer" className="input" required />
              </label>
              <label className="block">
                <span className="field-label">Emoji</span>
                <input name="emoji" placeholder="🎮" className="input" />
              </label>
            </div>

            <label className="block">
              <span className="field-label">Description</span>
              <input name="description" placeholder="Opsional" className="input" />
            </label>

            <label className="block">
              <span className="field-label">Button style</span>
              <select name="buttonStyle" defaultValue="SECONDARY" className="input">
                {BUTTON_STYLES.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}
              </select>
            </label>
          </div>
          <button disabled={state.loading || !addableRoles.length || !roleBuilderEnabled} className="btn btn-primary mt-4 w-full">
            {state.loading ? 'Adding...' : '+ Add Role Option'}
          </button>
        </form>

        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-bold text-slate-700">Current order</p>
            {state.reordering && <span className="text-xs text-slate-500">Saving order...</span>}
          </div>
          {orderedRoles.map((role, index) => {
            const isEditing = editingRoleId === role.id;
            const isMutatingThisRole = isEditing || state.editingId === role.id;

            return (
              <div
                key={role.id}
                draggable={!isEditing}
                onDragStart={() => !isEditing && setDraggedId(role.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => !isEditing && onDropRole(event, role.id)}
                onDragEnd={() => setDraggedId(null)}
                className={`rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm transition ${draggedId === role.id ? 'opacity-50 ring-2 ring-blue-400/40' : ''}`}
              >
                {isEditing && editDraft ? (
                  <form id={`edit-role-${role.id}`} onSubmit={(event) => updateRole(event, role.id)} className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-blue-100 pb-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-xl bg-white px-3 py-1 text-sm font-black text-blue-900">#{index + 1}</span>
                            <span className="badge border-blue-200 bg-white text-blue-700">Editing role option</span>
                          </div>
                          <div className="mt-2 text-lg font-black text-slate-900">{role.emoji || '□'} {role.label}</div>
                          <div className="mt-1 text-xs text-slate-500">Role ID: {role.roleId}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="submit" disabled={state.editingId === role.id} className="btn btn-primary px-4 py-2 text-sm">
                            {state.editingId === role.id ? 'Saving...' : 'Save changes'}
                          </button>
                          <button type="button" onClick={cancelEditingRole} disabled={state.editingId === role.id} className="btn px-4 py-2 text-sm">Cancel</button>
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[1fr_120px]">
                        <label className="block">
                          <span className="field-label">Label</span>
                          <input value={editDraft.label} onChange={(event) => setEditDraft({ ...editDraft, label: event.target.value })} className="input" required />
                        </label>
                        <label className="block">
                          <span className="field-label">Emoji</span>
                          <input value={editDraft.emoji} onChange={(event) => setEditDraft({ ...editDraft, emoji: event.target.value })} className="input text-center text-xl" placeholder="🎮" />
                        </label>
                        <label className="block lg:col-span-2">
                          <span className="field-label">Description</span>
                          <input value={editDraft.description} onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })} className="input" placeholder="Opsional" />
                        </label>
                        <label className="block lg:col-span-2">
                          <span className="field-label">Button style</span>
                          <select value={editDraft.buttonStyle} onChange={(event) => setEditDraft({ ...editDraft, buttonStyle: event.target.value as PanelRole['buttonStyle'] })} className="input">
                            {BUTTON_STYLES.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}
                          </select>
                        </label>
                      </div>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 cursor-grab rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-slate-400 active:cursor-grabbing">⋮⋮</div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-xl bg-[var(--bg-subtle)] px-3 py-1 text-sm font-black text-slate-700">#{index + 1}</span>
                          <span className="font-black">{role.emoji || '□'} {role.label}</span>
                          <span className="badge">{role.buttonStyle}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">Role ID: {role.roleId}</div>
                        {role.description && <div className="mt-1 text-sm text-slate-400">{role.description}</div>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <button type="button" onClick={() => startEditingRole(role)} disabled={Boolean(editingRoleId) || state.reordering} className="btn px-3 py-2 text-sm">Edit</button>
                      <button type="button" onClick={() => nudgeRole(index, -1)} disabled={index === 0 || state.reordering || isMutatingThisRole} className="btn px-3 py-2 text-sm">↑</button>
                      <button type="button" onClick={() => nudgeRole(index, 1)} disabled={index === orderedRoles.length - 1 || state.reordering || isMutatingThisRole} className="btn px-3 py-2 text-sm">↓</button>
                      <button type="button" onClick={() => removeRole(role.id)} disabled={state.deletingId === role.id || isMutatingThisRole} className="btn btn-danger px-3 py-2 text-sm">
                        {state.deletingId === role.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!orderedRoles.length && <p className="card-flat p-5 text-slate-500">Belum ada role di panel. Tambahkan role dari form di sebelah kiri.</p>}
        </div>
      </div>
      </div>
    </section>
  );
}
