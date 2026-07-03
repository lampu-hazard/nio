export const metadata = { title: 'Terms of Service – nio' };

export default function TermsPage() {
  return (
    <main className="shell">
      <div className="container-wide max-w-3xl py-16">
        <h1 className="text-4xl font-black tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-400">Last updated: June 25, 2025</p>

        <div className="mt-10 space-y-8 text-slate-300 leading-7">
          <section>
            <h2 className="text-xl font-bold text-white">1. Acceptance</h2>
            <p className="mt-2">By using nio ("the Service"), you agree to these Terms. If you do not agree, do not use the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">2. Description</h2>
            <p className="mt-2">nio is a Discord bot and web dashboard that lets server administrators create panels (rules, announcements, self-role selectors) and manage stickers. The Service interacts with Discord via OAuth2 and the Discord API.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">3. Eligibility</h2>
            <p className="mt-2">You must be at least 13 years old (or the minimum age required by your country) and have a valid Discord account to use the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">4. Your Responsibilities</h2>
            <ul className="mt-2 list-disc pl-6 space-y-1">
              <li>Use the Service in compliance with Discord's Terms of Service and Community Guidelines.</li>
              <li>Do not use the Service to distribute illegal, harmful, or abusive content.</li>
              <li>You are responsible for all content you create or publish through nio.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">5. Availability</h2>
            <p className="mt-2">The Service is provided "as is" without warranty. We may modify, suspend, or discontinue the Service at any time without prior notice.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">6. Limitation of Liability</h2>
            <p className="mt-2">To the fullest extent permitted by law, nio and its operators are not liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">7. Changes</h2>
            <p className="mt-2">We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the updated Terms.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">8. Contact</h2>
            <p className="mt-2">Questions about these Terms? Reach out via the nio Discord support server.</p>
          </section>
        </div>

        <div className="mt-12">
          <a href="/" className="btn px-5 py-3 text-sm">← Back to Home</a>
        </div>
      </div>
    </main>
  );
}
