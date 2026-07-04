type TopbarProps = {
  title: string;
  subtitle?: string;
};

export function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Dashboard</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
      </div>
    </header>
  );
}
