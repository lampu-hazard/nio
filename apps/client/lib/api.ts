const API_URL = process.env.BACKEND_URL || 'http://localhost:3002';

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isServer = typeof window === 'undefined';
  const targetUrl = isServer ? `${API_URL}${path}` : `/api${path}`;

  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }


  if (isServer) {
    try {
      const { cookies, headers: nextHeaders } = await import('next/headers');
      const cookieStore = await cookies();
      const cookieString = cookieStore.toString() || (await nextHeaders()).get('cookie') || '';
      if (cookieString) {
        headers['Cookie'] = cookieString;
      }
    } catch (e) {
      // Outside request context
    }
  }

  const response = await fetch(targetUrl, {
    cache: isServer ? 'no-store' : init.cache,
    ...init,
    credentials: 'include',
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `API request failed: ${response.status}`);
  }
  return data as T;
}

export function loginUrl() {
  return '/api/auth/discord';
}
