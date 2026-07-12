'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type TakoSettings = {
  enabled: boolean;
  rewardRoleId: string | null;
  minimumAmount: number;
  paymentMethods: string[];
};

type CheckoutResponse = {
  ok: boolean;
  paymentUrl: string;
  transactionId?: string;
};

export function CheckoutForm({ guildId, userId, username }: { guildId: string; userId?: string; username?: string }) {
  const [settings, setSettings] = useState<TakoSettings | null>(null);
  const [amount, setAmount] = useState<number>(10000);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('qris');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSettings();
  }, [guildId]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api<{ ok: boolean; settings: TakoSettings }>(`/guilds/${guildId}/tako/public-settings`);
      if (!res.settings.enabled || !res.settings.rewardRoleId) {
        setError('Tako donation rewards are not enabled on this server.');
        return;
      }
      setSettings(res.settings);
      setAmount(res.settings.minimumAmount);
      if (res.settings.paymentMethods.length > 0) {
        setPaymentMethod(res.settings.paymentMethods[0]);
      }
    } catch (err: any) {
      const message = err?.message || 'Failed to load donation settings.';
      if (!userId && (message.toLowerCase().includes('login') || message.toLowerCase().includes('unauthorized') || message.toLowerCase().includes('access denied'))) {
        window.location.href = `/api/auth/discord?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!settings) return;

    if (amount < settings.minimumAmount) {
      setError(`Minimum donation amount is Rp${settings.minimumAmount.toLocaleString('id-ID')}.`);
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const res = await api<CheckoutResponse>(`/guilds/${guildId}/tako/checkout`, {
        method: 'POST',
        body: JSON.stringify({
          amount,
          email,
          paymentMethod,
          message: message.trim() || undefined,
          ...(userId ? { discordUserId: userId } : {}),
          ...(username ? { discordUsername: username } : {}),
        }),
      });
      window.location.href = res.paymentUrl;
    } catch (err: any) {
      setError(err?.message || 'Failed to process payment checkout.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="card p-6 text-center text-sm text-[var(--muted)]">Loading checkout details...</div>;
  }

  if (error && !settings) {
    return <div className="notice notice-error">{error}</div>;
  }

  if (!settings) return null;

  const presets = [
    settings.minimumAmount,
    settings.minimumAmount + 15000,
    settings.minimumAmount + 40000,
    settings.minimumAmount + 90000,
  ];

  return (
    <form onSubmit={submit} className="card p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-[var(--text)]">Donation Checkout</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          You are supporting the server. Reaching the target rewards you with the <span className="font-semibold text-indigo-500">Donator Role</span>.
        </p>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      <div>
        <span className="field-label">Choose donation amount</span>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => setAmount(val)}
              className={`rounded-lg border px-4 py-3 text-sm font-semibold transition-colors ${
                amount === val
                  ? 'border-zinc-950 bg-zinc-950 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--panel-strong)]'
              }`}
            >
              Rp {val.toLocaleString('id-ID')}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="field-label">Custom amount (Rp)</span>
        <input
          type="number"
          className="input"
          value={amount}
          min={settings.minimumAmount}
          onChange={(event) => setAmount(parseInt(event.target.value) || settings.minimumAmount)}
          required
        />
      </label>

      <label className="block">
        <span className="field-label">Your Email</span>
        <input
          type="email"
          className="input"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="your.email@example.com"
          required
        />
        <p className="mt-1.5 text-xs text-[var(--muted)]">Used by Tako to send payment invoices and receipts.</p>
      </label>

      <label className="block">
        <span className="field-label">Payment Method</span>
        <select
          value={paymentMethod}
          onChange={(event) => setPaymentMethod(event.target.value)}
          className="input"
          required
        >
          {settings.paymentMethods.map((method) => (
            <option key={method} value={method}>
              {method.toUpperCase()}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="field-label">Donation Message</span>
        <textarea
          className="input min-h-24 resize-y"
          value={message}
          maxLength={200}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="semangat bang!"
        />
        <p className="mt-1.5 text-xs text-[var(--muted)]">Optional message shown in the public donation announcement.</p>
      </label>

      <button type="submit" disabled={submitting} className="btn btn-primary w-full py-3">
        {submitting ? 'Redirecting to Tako...' : `Donate Rp ${amount.toLocaleString('id-ID')} & Claim Role`}
      </button>
    </form>
  );
}
