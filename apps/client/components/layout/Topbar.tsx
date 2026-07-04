type TopbarProps = {
  title: string;
  subtitle?: string;
};

export function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)] backdrop-blur-md px-6 py-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Dashboard</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-[var(--text)]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>}
      </div>
    </header>
  );
}
