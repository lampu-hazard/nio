import { loginUrl } from '@/lib/api';

const FEATURES = [
  {
    title: 'Rules Panels',
    description: 'Create server rules, verification guides, and FAQs with banners, thumbnails, and Discord markdown.',
    icon: '📌',
  },
  {
    title: 'Self Role Panels',
    description: 'Let members pick roles with polished buttons or dropdown menus. Reorder roles visually.',
    icon: '🎭',
  },
  {
    title: 'Announcement Panels',
    description: 'Publish branded announcements, events, changelogs, and updates without writing commands.',
    icon: '📣',
  },
];

type HomePageProps = {
  searchParams?: Promise<{ authError?: string }> | { authError?: string };
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const hasAuthError = params?.authError === '1';

  return (
    <main className="shell overflow-hidden">
      <section className="container-wide grid min-h-[calc(100vh-80px)] items-center gap-12 py-10 xl:grid-cols-[1.05fr_.95fr]">
        <div>
          <div className="badge mb-6">Discord Panel Builder</div>
          <h1 className="max-w-5xl text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
            Build beautiful Discord panels without commands.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            nio helps server admins create rules, announcements, and self-role panels with banners, live previews, and one-click Discord publishing.
          </p>
          {hasAuthError && (
            <div className="notice notice-error mt-6 max-w-2xl">
              Login gagal. Silakan coba lagi.
            </div>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={loginUrl()} className="btn btn-primary px-6 py-4">Login with Discord</a>
            <a href="#features" className="btn px-6 py-4">See panel types</a>
          </div>
          <div id="features" className="mt-10 grid gap-4 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="card-flat p-5">
                <div className="text-3xl">{feature.icon}</div>
                <h3 className="mt-4 font-black">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5 md:p-7">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-slate-400">Live Discord preview</div>
              <h2 className="text-2xl font-black">Server Rules</h2>
            </div>
            <span className="badge badge-live">Publish ready</span>
          </div>

          <div className="rounded-3xl border border-[#2b2d31] bg-[#313338] p-4 shadow-2xl shadow-black/30">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 to-red-400 font-black text-white">n</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">nio</span>
                  <span className="rounded bg-[#5865f2] px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">app</span>
                  <span className="text-xs text-[#949ba4]">Today at 14:35</span>
                </div>
                <div className="mt-3 h-32 rounded-3xl bg-[radial-gradient(circle_at_20%_20%,#fb7185,transparent_35%),linear-gradient(135deg,#111827,#ec4899,#f97316)] p-6">
                  <div className="text-3xl font-black italic tracking-tight text-white drop-shadow-xl">SERVER RULES</div>
                </div>
                <div className="mt-3 rounded border border-black/20 bg-[#2b2d31] p-4" style={{ borderLeft: '4px solid #ff2f7d' }}>
                  <div className="text-lg font-black text-white">Welcome to server-rules!</div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#dbdee1]">**1. BASIC**\n• Respect every member and staff.\n• No spam, toxicity, scams, or harmful links.\n\n**2. GENERAL**\n• Use channels correctly.\n• Follow moderator instructions.</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="rounded-lg border border-white/10 bg-[#2b2d31] px-3 py-2 text-sm font-semibold text-[#dbdee1]">🎮 Gamer</div>
                  <div className="rounded-lg border border-white/10 bg-[#2b2d31] px-3 py-2 text-sm font-semibold text-[#dbdee1]">🎨 Artist</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
