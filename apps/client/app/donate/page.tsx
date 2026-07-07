import { CheckoutForm } from './CheckoutForm';

type PageProps = {
  searchParams: Promise<{
    guildId?: string;
    userId?: string;
    username?: string;
  }>;
};

export default async function DonatePage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Support & Donate</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--text)]">Tako Donation Reward</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Donate to receive a special role on the Discord server. You will be redirected to Tako to complete your payment securely.
          </p>
        </div>

        {params.guildId ? (
          <CheckoutForm
            guildId={params.guildId}
            userId={params.userId}
            username={params.username}
          />
        ) : (
          <div className="notice notice-error">Missing Discord server ID. Please use the link provided by the bot.</div>
        )}
      </div>
    </main>
  );
}
