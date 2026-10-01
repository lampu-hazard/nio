'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { OwnerConsole } from '@/components/OwnerConsole';
import { api } from '@/lib/api';

export default function HomePage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    setAuthError(new URLSearchParams(window.location.search).has('authError'));
    api('/auth/me').then(() => setAuthenticated(true)).catch(() => setAuthenticated(false));
  }, []);

  return <><div className="owner-topbar"><strong>NIO / PRIVATE OPERATIONS</strong>{!authenticated && <Link href="/login">{authError ? 'Discord sign-in failed — retry' : 'Sign in with Discord'}</Link>}</div>{authenticated ? <OwnerConsole /> : <main className="owner-page"><p>{authError ? 'Discord sign-in failed. Please try again.' : 'Sign in with your owner Discord account to continue.'}</p></main>}</>;
}
