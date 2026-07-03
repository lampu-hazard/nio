const API_URL = process.env.BACKEND_URL || 'http://localhost:3002';

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isServer = typeof window === 'undefined';
  const targetUrl = isServer ? `${API_URL}${path}` : `/api${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> || {}),
  };


  if (isServer) {
    try {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      const cookieString = cookieStore.toString();
      if (cookieString) {
        headers['Cookie'] = cookieString;
      }
    } catch (e) {
      // Diluar request context
    }
  }

  const response = await fetch(targetUrl, {
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
