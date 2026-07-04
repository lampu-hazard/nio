import type { Panel } from '@/lib/types';

const STYLE_LABELS: Record<string, string> = {
  PREMIUM: 'Premium finish',
  MINIMAL: 'Minimal',
  COLORFUL: 'Colorful',
  NEON: 'Neon edge',
};

export function EmbedPreview({ panel }: { panel?: Partial<Panel> | null }) {
  const roles = panel?.roles || [];
  const showRoleComponents = (panel?.type || 'SELF_ROLE') === 'SELF_ROLE';
  const color = panel?.color || '#18181B';
  const isPublished = panel?.status === 'PUBLISHED' && panel?.messageId;

  return (
    <aside className="sticky top-6 space-y-4">
      <div className="card overflow-hidden p-0">
        <div className="border-b border-[var(--border)] bg-[var(--bg-subtle)] px-6 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="badge mb-3">Discord Preview</div>
              <h2 className="text-2xl font-black tracking-tight">Live post</h2>
            </div>
            <span className={`badge ${isPublished ? 'badge-live' : ''}`}>{isPublished ? 'Live' : 'Draft'}</span>
          </div>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Preview follows the latest saved panel data.</p>
        </div>

        <div className="bg-[var(--panel)] p-6">
          <div className="rounded-2xl border border-[#2b2d31] bg-[#313338] p-4 shadow-sm">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 font-black text-zinc-950">n</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">nio</span>
                  <span className="rounded bg-[#5865f2] px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">bot</span>
                  <span className="text-xs text-[#949ba4]">Today at 12:00</span>
                </div>

                {panel?.imageUrl && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-black/20 bg-[#2b2d31]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={panel.imageUrl} alt="Panel banner" className="max-h-64 w-full object-cover" />
                  </div>
                )}

                <div className="mt-3 overflow-hidden rounded border border-black/20 bg-[#2b2d31]" style={{ borderLeft: `4px solid ${color}` }}>
                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="text-lg font-black text-white">{panel?.title || 'Self Roles'}</div>
                        {panel?.style !== 'MINIMAL' && panel?.accentText && (
                          <div className="mt-1 text-sm font-semibold" style={{ color }}>{panel.accentText}</div>
                        )}
                      </div>
                      {panel?.style !== 'MINIMAL' && panel?.thumbnailUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={panel.thumbnailUrl} alt="Panel thumbnail" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                      )}
                    </div>

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#dbdee1]">
                      {panel?.description || 'Select roles below to customize your profile.'}
                    </p>

                    {showRoleComponents && roles.length > 0 && (
                      <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                        {roles.map((role) => (
                          <div key={role.id} className="text-sm text-[#dbdee1]">
                            <span>{role.emoji || '•'}</span> <span className="font-semibold">@{role.label}</span>
                            {role.description && <span className="text-[#949ba4]"> — {role.description}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {panel?.style !== 'MINIMAL' && (
                      <div className="mt-4 flex items-center gap-2 border-t border-white/5 pt-3 text-xs text-[#949ba4]">
                        <span>{panel?.type === 'RULES' ? 'Rules panel' : panel?.type === 'ANNOUNCEMENT' ? 'Announcement panel' : 'Self-role panel'}</span>
                        <span>•</span>
                        <span>Today at 12:00</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {showRoleComponents && roles.slice(0, panel?.mode === 'MENU' ? 1 : 10).map((role) => (
                    <div key={role.id} className="rounded-lg border border-white/10 bg-[#2b2d31] px-3 py-2 text-sm font-semibold text-[#dbdee1]">
                      {role.emoji ? `${role.emoji} ` : ''}{role.label}
                    </div>
                  ))}
                  {showRoleComponents && panel?.mode === 'MENU' && roles.length > 0 && <div className="rounded-lg border border-white/10 bg-[#2b2d31] px-3 py-2 text-sm text-[#949ba4]">Dropdown with {roles.length} options</div>}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div className="card-flat p-4">
              <div className="text-zinc-500 dark:text-zinc-400">Mode</div>
              <div className="mt-1 font-black">{panel?.mode || 'BUTTONS'}</div>
            </div>
            <div className="card-flat p-4">
              <div className="text-zinc-500 dark:text-zinc-400">Style</div>
              <div className="mt-1 font-black">{STYLE_LABELS[panel?.style || 'PREMIUM']}</div>
            </div>
            <div className="card-flat p-4 sm:col-span-2">
              <div className="text-zinc-500 dark:text-zinc-400">Message ID</div>
              <div className="mt-1 break-all font-mono text-xs text-zinc-500 dark:text-zinc-400">{panel?.messageId || 'Not published yet'}</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
