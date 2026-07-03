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

  // Form State
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
      setError(err?.message || 'Failed to fetch stickers data');
    } finally {
      setLoading(false);
    }
  };

  // PUT upload directly to R2 with simple retry mechanism (resumable on failure)
  const uploadToR2 = async (url: string, file: File, retries = 3): Promise<void> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type,
          },
        });

        if (!response.ok) {
          throw new Error(`Upload failed with status: ${response.status}`);
        }
        return; // Success
      } catch (err) {
        if (attempt === retries) {
          throw err; // Last attempt failed, propagate error
        }
        // Wait before retrying (exponential backoff)
        setUploadProgress((prev) => Math.min(prev + 5, 90));
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !file) {
      setError('Please provide a keyword and select an image file');
      return;
    }

    const sanitizedName = name.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(sanitizedName)) {
      setError('Keyword must be lowercase alphanumeric or dash only (e.g. malas)');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('File size exceeds the 2MB limit');
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

      // Reset input element value
      const fileInput = document.getElementById('sticker-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      // Refresh list
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
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-4xl font-black">Sticker Keywords</h1>
          <p className="mt-1 text-slate-400">Trigger bot to send sticker images when users type specific keywords.</p>
        </div>

        <DashboardNav guildId={guildId} activeTab="stickers" />

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center text-slate-400">
            Loading stickers data...
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Left: Settings & Upload */}
            <div className="space-y-6 lg:col-span-1">
              {/* Upload Form Card */}
              <div className="card p-6">
                <h2 className="text-lg font-bold mb-4">Create Sticker</h2>
                <form onSubmit={handleUpload} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                      Keyword Trigger
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. malas"
                      disabled={uploading}
                      maxLength={32}
                      className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Lowercase alphanumeric & dashes only. Matches exact message content.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                      Image File
                    </label>
                    <input
                      id="sticker-file-input"
                      type="file"
                      accept="image/png, image/jpeg, image/gif"
                      disabled={uploading}
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Supports PNG, JPG, or GIF. Max 2MB.
                    </p>
                  </div>

                  {uploading && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Uploading file...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={uploading}
                    className="w-full rounded-xl bg-indigo-500 py-3 text-center text-sm font-bold hover:bg-indigo-400 disabled:opacity-50 transition"
                  >
                    {uploading ? 'Uploading...' : 'Save Sticker'}
                  </button>
                </form>
              </div>
            </div>

            {/* Right: Stickers Grid */}
            <div className="lg:col-span-2">
              <div className="card p-6">
                <h2 className="text-lg font-bold mb-6">Sticker Collection ({stickers.length})</h2>

                {stickers.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">
                    No stickers uploaded yet. Use the form to add one.
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                    {stickers.map((sticker) => (
                      <div
                        key={sticker.id}
                        className="group relative flex flex-col items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:bg-white/[0.04]"
                      >
                        <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-black/20 p-2">
                          <img
                            src={sticker.url}
                            alt={sticker.name}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div className="mt-3 flex w-full items-center justify-between">
                          <div className="truncate pr-2">
                            <p className="truncate text-sm font-bold" title={sticker.name}>
                              {sticker.name}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {sticker.type.split('/')[1]?.toUpperCase() || 'IMAGE'}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDelete(sticker.id)}
                            className="rounded-lg bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Delete sticker"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                              className="h-4 w-4"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                              />
                            </svg>
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
