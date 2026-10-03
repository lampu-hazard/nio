'use client';

import React, { useEffect, useState, use } from 'react';
import { api } from '@/lib/api';
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
    <main className="px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-4">
        {/* Compact Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-[var(--text)]">Sticker Keywords</h2>
            <p className="text-xs text-[var(--muted)]">Send sticker images automatically when users type matching trigger words.</p>
          </div>
          <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">
            {stickers.length} stickers
          </span>
        </div>

        {error && <div className="notice notice-error" role="alert">{error}</div>}

        {loading ? (
          <div className="card p-8 text-center text-xs text-[var(--muted)]">Loading stickers...</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Upload Sticker Form */}
            <div className="lg:col-span-1">
              <div className="card p-4 space-y-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">Add New Sticker</h3>
                  <p className="text-[11px] text-[var(--muted)]">Attach an image and define its trigger keyword.</p>
                </div>
                <form onSubmit={handleUpload} className="space-y-3">
                  <label className="block">
                    <span className="field-label">Keyword Trigger</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. hello"
                      disabled={uploading}
                      maxLength={32}
                      className="input py-1.5 text-xs"
                    />
                    <p className="mt-1 text-[10px] text-[var(--muted)]">Alphanumeric and dash only (exact match).</p>
                  </label>

                  <label className="block">
                    <span className="field-label">Image File (PNG, JPG, GIF ≤ 2MB)</span>
                    <input
                      id="sticker-file-input"
                      type="file"
                      accept="image/png, image/jpeg, image/gif"
                      disabled={uploading}
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="block w-full text-xs text-[var(--muted)] file:mr-3 file:rounded-md file:border file:border-[var(--border)] file:bg-[var(--surface)] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-[var(--text)] hover:file:bg-[var(--surface-muted)] cursor-pointer"
                    />
                  </label>

                  {uploading && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] text-[var(--muted)]">
                        <span>Uploading file...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
                        <div className="h-full bg-indigo-600 transition-all duration-300 dark:bg-indigo-500" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    </div>
                  )}

                  <button type="submit" disabled={uploading} className="btn btn-primary w-full py-1.5 text-xs font-bold">
                    {uploading ? 'Uploading...' : 'Save Sticker'}
                  </button>
                </form>
              </div>
            </div>

            {/* Sticker Collection Grid */}
            <div className="lg:col-span-2">
              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">Sticker Collection</h3>
                  <span className="text-xs text-[var(--muted)]">{stickers.length} configured</span>
                </div>
                {stickers.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[var(--muted)]">No stickers uploaded yet. Use the form to add one.</div>
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 max-h-[500px] overflow-y-auto p-1">
                    {stickers.map((sticker) => (
                      <div key={sticker.id} className="group flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 transition-colors hover:bg-[var(--surface-muted)]">
                        <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-[var(--surface-muted)] p-1.5">
                          <img src={sticker.url} alt={sticker.name} className="max-h-full max-w-full object-contain" />
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-[var(--text)]" title={sticker.name}>{sticker.name}</p>
                            <span className="rounded border border-[var(--border)] bg-[var(--panel)] px-1 py-0.2 text-[9px] font-mono text-[var(--muted)]">
                              {sticker.type.split('/')[1]?.toUpperCase() || 'IMG'}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDelete(sticker.id)}
                            className="rounded px-2 py-0.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors"
                            title="Delete sticker"
                          >
                            Delete
                          </button>
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
