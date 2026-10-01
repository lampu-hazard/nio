# Owner console deployment

The owner console is a separate Next.js service (`nio-owner`) with no published host port. Point a reverse proxy to `nio-owner:3000` on the Compose `private` network and expose it only on a private subdomain. Configure HTTPS and an access policy at the proxy (VPN, IP allowlist, or proxy authentication); the owner API also checks the signed-in Discord user against `OWNER_DISCORD_ID`.

Set these backend environment values in `apps/server/.env`:

- `OWNER_DISCORD_ID`: Discord user ID permitted to use owner APIs.
- `OWNER_FRONTEND_URL`: canonical HTTPS origin for the private owner site, e.g. `https://ops.example.com`.
- `OWNER_DISCORD_REDIRECT_URI`: exact callback URL registered in the Discord application's OAuth2 redirect list, e.g. `https://ops.example.com/auth/discord/callback`.

Register that callback URL in the Discord application. The reverse proxy must pass `/auth/*` and `/api/*` through to `nio-owner:3000`; Next.js proxies those paths to `nio-server:3002` so OAuth callback and browser API traffic retain the owner hostname's session cookie. Keep `FRONTEND_URL` and `DISCORD_REDIRECT_URI` set to the existing public client values.

DNS, proxy routing, TLS certificates, Discord application settings, and the VPS environment are external deployment steps; this repository does not configure them.
