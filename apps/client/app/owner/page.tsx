'use client';

import { useEffect, useState } from 'react';
import { OwnerConsole } from '@/components/owner/OwnerConsole';
import { api, loginUrl } from '@/lib/api';

type AuthStatus = { ok: true; isOwner: boolean };

type Access = 'checking' | 'signed-out' | 'denied' | 'allowed';

export default function OwnerPage() {
  const [access, setAccess] = useState<Access>('checking');
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    setAuthError(new URLSearchParams(window.location.search).has('authError'));
    let active = true;
    api<AuthStatus>('/auth/me')
      .then(({ isOwner }) => { if (active) setAccess(isOwner ? 'allowed' : 'denied'); })
      .catch(() => { if (active) setAccess('signed-out'); });
    return () => { active = false; };
  }, []);

  if (access === 'allowed') return <OwnerConsole />;
  if (access === 'checking') return <main className="owner-access"><p role="status">Checking access…</p></main>;
  if (access === 'signed-out') {
    return <main className="owner-access"><h1>Sign in required</h1><p>{authError ? 'Discord sign-in failed. Please try again.' : 'Sign in with the configured owner Discord account to continue.'}</p><a className="btn btn-primary" href={loginUrl()}>Sign in with Discord</a></main>;
  }
  return <main className="owner-access"><h1>Access denied</h1><p>This page is not available for this Discord account.</p><a className="btn" href="/dashboard">Return to dashboard</a></main>;
}

