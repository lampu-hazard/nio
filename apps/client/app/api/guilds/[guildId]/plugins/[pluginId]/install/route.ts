const BACKEND_URL = process.env.BACKEND_URL || 'http://nio-server:3002';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ guildId: string; pluginId: string }> },
) {
  const { guildId, pluginId } = await params;
  const cookie = request.headers.get('cookie');
  const response = await fetch(
    `${BACKEND_URL}/guilds/${encodeURIComponent(guildId)}/plugins/${encodeURIComponent(pluginId)}/install`,
    {
      method: 'POST',
      headers: {
        ...(cookie ? { cookie } : {}),
        'content-type': 'application/json',
      },
      body: '{}',
      cache: 'no-store',
    },
  );

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') || 'application/json',
    },
  });
}
