import { ClaimForm } from './ClaimForm';

type PageProps = {
  searchParams: Promise<{
    guildId?: string;
    token?: string;
  }>;
};

export default async function BoosterRolePage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Boosters</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--text)]">Custom Booster Role</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Use your private booster link to create or update your custom role. You must stay an active server booster to save changes.
          </p>
        </div>

        {params.guildId && params.token ? (
          <ClaimForm guildId={params.guildId} token={params.token} />
        ) : (
          <div className="notice notice-error">This booster role link is missing required information.</div>
        )}
      </div>
    </main>
  );
}
