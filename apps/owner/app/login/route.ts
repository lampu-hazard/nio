import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const backend = process.env.BACKEND_URL || 'http://nio-server:3002';
  const response = await fetch(`${backend}/auth/discord?client=owner`, {
    headers: { cookie: request.headers.get('cookie') || '' },
    redirect: 'manual',
    cache: 'no-store',
  });
  const location = response.headers.get('location');
  if (!location) return NextResponse.json({ message: 'Could not start Discord login.' }, { status: 502 });
  let target: URL;
  try {
    target = new URL(location);
  } catch {
    return NextResponse.json({ message: 'Unexpected Discord login destination.' }, { status: 502 });
  }
  if (target.origin !== 'https://discord.com' || target.pathname !== '/oauth2/authorize') {
    return NextResponse.json({ message: 'Unexpected Discord login destination.' }, { status: 502 });
  }
  const result = NextResponse.redirect(location, 302);
  for (const cookie of response.headers.getSetCookie()) result.headers.append('set-cookie', cookie);
  return result;
}
