'use client';

import React, { useEffect, useState, use } from 'react';
import { api } from '@/lib/api';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import type { Sticker } from '@/lib/types';

type PageProps = {
  params: Promise<{ guildId: string }>;
};

export default function StickersPage({ params }: PageProps) {
  const { guildId } = use(params);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, [guildId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api<{ ok: boolean; stickers: Sticker[] }>(`/guilds/${guildId}/stickers`);
      setStickers(res.stickers || []);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch sticker data');
    } finally {
      setLoading(false);
    }
  };

  const uploadToR2 = async (url: string, file: File, retries = 3): Promise<void> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
        if (!response.ok) throw new Error(`Upload failed with status: ${response.status}`);
        return;
      } catch (err) {
        if (attempt === retries) throw err;
        setUploadProgress((prev) => Math.min(prev + 5, 90));
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !file) {
      setError('Please provide a keyword and select an image file.');
      return;
    }

    const sanitizedName = name.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(sanitizedName)) {
      setError('Keyword must be lowercase alphanumeric or dash only (e.g. hello).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('File size exceeds the 2MB limit.');
      return;
    }

    try {
      setUploading(true);
      setError('');
      setUploadProgress(10);

      const { uploadUrl, key } = await api<{ ok: boolean; uploadUrl: string; key: string }>(
        `/guilds/${guildId}/stickers/upload-url`,
        {
          method: 'POST',
          body: JSON.stringify({ fileName: file.name, contentType: file.type }),
        }
      );

      setUploadProgress(40);
      await uploadToR2(uploadUrl, file);
      setUploadProgress(70);

      await api<{ ok: boolean; sticker: Sticker }>(`/guilds/${guildId}/stickers`, {
        method: 'POST',
        body: JSON.stringify({ name: sanitizedName, key, type: file.type }),
      });

      setUploadProgress(100);
      setName('');
      setFile(null);
      const fileInput = document.getElementById('sticker-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      await fetchData();
    } catch (err: any) {
      setError(err?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this sticker?')) return;
    try {
      await api(`/guilds/${guildId}/stickers/${id}`, { method: 'DELETE' });
      setStickers((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      setError(err?.message || 'Failed to delete sticker');
    }
  };

  return (
    <main className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Media</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--text)]">Sticker Keywords</h1>
          <p className="mt-1 text-[var(--muted)]">Send sticker images when users type specific keyword triggers.</p>
        </div>

        <DashboardNav guildId={guildId} activeTab="stickers" />
        {error && <div className="notice notice-error mb-6">{error}</div>}

        {loading ? (
          <div className="flex h-64 items-center justify-center text-[var(--muted)]">Loading stickers...</div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <div className="card p-6">
                <h2 className="text-lg font-bold text-[var(--text)]">Create Sticker</h2>
                <form onSubmit={handleUpload} className="mt-5 space-y-4">
                  <label className="block">
                    <span className="field-label">Keyword Trigger</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. hello"
                      disabled={uploading}
                      maxLength={32}
                      className="input"
                    />
                    <p className="mt-2 text-xs text-[var(--muted)]">Lowercase letters, numbers, and dashes only. Exact message match.</p>
                  </label>

                  <label className="block">
                    <span className="field-label">Image File</span>
                    <input
                      id="sticker-file-input"
                      type="file"
                      accept="image/png, image/jpeg, image/gif"
                      disabled={uploading}
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="block w-full text-sm text-[var(--muted)] file:mr-4 file:rounded-md file:border file:border-[var(--border)] file:bg-[var(--surface)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--text)] hover:file:bg-[var(--surface-muted)] dark:hover:file:bg-[var(--surface-muted)]"
                    />
                    <p className="mt-2 text-xs text-[var(--muted)]">Supports PNG, JPG, or GIF. Max 2MB.</p>
                  </label>

                  {uploading && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-[var(--muted)]">
                        <span>Uploading file...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
                        <div className="h-full bg-indigo-600 transition-all duration-300 dark:bg-indigo-500" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    </div>
                  )}

                  <button type="submit" disabled={uploading} className="btn btn-primary w-full">
                    {uploading ? 'Uploading...' : 'Save Sticker'}
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="card p-6">
                <h2 className="text-lg font-bold text-[var(--text)]">Sticker Collection ({stickers.length})</h2>
                {stickers.length === 0 ? (
                  <div className="py-12 text-center text-sm text-[var(--muted)]">No stickers uploaded yet. Use the form to add one.</div>
                ) : (
                  <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                    {stickers.map((sticker) => (
                      <div key={sticker.id} className="group flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:bg-[var(--surface-muted)]">
                        <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-muted)] p-2">
                          <img src={sticker.url} alt={sticker.name} className="max-h-full max-w-full object-contain" />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--text)]" title={sticker.name}>{sticker.name}</p>
                            <p className="text-xs text-[var(--muted)]">{sticker.type.split('/')[1]?.toUpperCase() || 'IMAGE'}</p>
                          </div>
                          <button onClick={() => handleDelete(sticker.id)} className="btn btn-danger h-8 px-3 text-xs" title="Delete sticker">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
