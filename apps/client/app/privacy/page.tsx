export const metadata = { title: 'Privacy Policy – nio' };

export default function PrivacyPage() {
  return (
    <main className="shell">
      <div className="container-wide max-w-3xl py-16">
        <h1 className="text-4xl font-black tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-400">Last updated: June 25, 2025</p>

        <div className="mt-10 space-y-8 text-slate-300 leading-7">
          <section>
            <h2 className="text-xl font-bold text-white">1. What We Collect</h2>
            <ul className="mt-2 list-disc pl-6 space-y-1">
              <li><strong>Discord account info</strong> — user ID, username, display name, and avatar (via Discord OAuth2).</li>
              <li><strong>Guild info</strong> — server ID, name, icon, and your permissions in servers where you use nio.</li>
              <li><strong>Session data</strong> — a session cookie to keep you logged in.</li>
            </ul>
            <p className="mt-2">We do <strong>not</strong> collect your email, password, messages, or any data from servers where nio is not installed.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">2. How We Use It</h2>
            <ul className="mt-2 list-disc pl-6 space-y-1">
              <li>Authenticate you and display the dashboard.</li>
              <li>Check your permissions to manage panels and stickers.</li>
              <li>Store panels, stickers, and audit logs you create.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">3. Data Storage</h2>
            <p className="mt-2">Data is stored in a PostgreSQL database (hosted on Neon) and Cloudflare R2 for uploaded media. Sessions are stored in the database and expire after 7 days.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">4. Third-Party Services</h2>
            <ul className="mt-2 list-disc pl-6 space-y-1">
              <li><strong>Discord API</strong> — for authentication and bot functionality.</li>
              <li><strong>Cloudflare R2</strong> — for sticker and media storage.</li>
              <li><strong>Neon (PostgreSQL)</strong> — for data persistence.</li>
            </ul>
            <p className="mt-2">We do not sell or share your data with advertisers or other third parties.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">5. Data Deletion</h2>
            <p className="mt-2">You can request deletion of your data by contacting us through the nio Discord support server. Removing the bot from your server deletes server-specific data (panels, stickers, audit logs).</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">6. Cookies</h2>
            <p className="mt-2">We use a single session cookie (<code className="rounded bg-white/10 px-1.5 py-0.5 text-sm">connect.sid</code>) for authentication. No tracking or analytics cookies are used.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">7. Changes</h2>
            <p className="mt-2">We may update this policy. Continued use of nio after changes constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">8. Contact</h2>
            <p className="mt-2">Questions about your data? Reach out via the nio Discord support server.</p>
          </section>
        </div>

        <div className="mt-12">
          <a href="/" className="btn px-5 py-3 text-sm">← Back to Home</a>
        </div>
      </div>
    </main>
  );
}
