import { isSafeApiPath } from './api-path';

const API_URL = process.env.BACKEND_URL || 'http://nio-server:3002';

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isSafeApiPath(path) || !path.startsWith('/owner/') && path !== '/auth/me') throw new Error('Invalid API path.');
  const isServer = typeof window === 'undefined';
  const url = isServer ? `${API_URL}${path}` : `/api${path}`;
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (isServer) {
    const { cookies } = await import('next/headers');
    const cookie = (await cookies()).toString();
    if (cookie) headers.set('Cookie', cookie);
  }
  const response = await fetch(url, { cache: isServer ? 'no-store' : init.cache, ...init, credentials: 'include', headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `API request failed: ${response.status}`);
  return data as T;
}
