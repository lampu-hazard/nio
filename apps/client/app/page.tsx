import { loginUrl } from '@/lib/api';

const CAPABILITIES = [
  { name: 'Panels', detail: 'Rules, roles, and announcements', mark: '01' },
  { name: 'Automation', detail: 'Moderation and server workflows', mark: '02' },
  { name: 'Signals', detail: 'Audit trails and community insights', mark: '03' },
];

type HomePageProps = {
  searchParams?: Promise<{ authError?: string }> | { authError?: string };
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const hasAuthError = params?.authError === '1';

  return (
    <main className="home-page">
      <header className="home-nav">
        <a className="home-wordmark" href="/" aria-label="nio home">nio<span>.</span></a>
        <span className="home-nav-note">Discord, in good order.</span>
        <a className="home-nav-login" href={loginUrl()}>Sign in <span aria-hidden="true">↗</span></a>
      </header>

      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-copy">
          <p className="home-intro">A calmer way to run your server</p>
          <h1 id="home-title">Make room for the community.</h1>
          <p className="home-description">nio brings the everyday work of a Discord server into one clear workspace—from the first welcome to the quiet routines that keep things running.</p>
          {hasAuthError && <div className="notice notice-error home-error" role="alert">Discord sign-in did not complete. Start again when you’re ready.</div>}
          <a href={loginUrl()} className="home-cta">Continue with Discord <span aria-hidden="true">↗</span></a>
          <p className="home-permission">Your Discord permissions determine which servers you can manage.</p>
        </div>

        <div className="home-preview-wrap" aria-label="Example Discord rules panel">
          <div className="home-preview-caption"><span>In your server</span><span className="home-live"><i /> Published panel</span></div>
          <article className="discord-preview">
            <div className="discord-channel"><span className="channel-hash">#</span> start-here <span className="channel-chevron">⌄</span></div>
            <div className="discord-message">
              <div className="discord-avatar" aria-hidden="true">n</div>
              <div className="discord-message-body">
                <div className="discord-author">nio <span className="discord-app-tag">APP</span> <time>Today at 14:35</time></div>
                <div className="discord-embed">
                  <span className="embed-rule" />
                  <p className="embed-kicker">A NOTE FOR EVERYONE</p>
                  <h2>Good to have you here.</h2>
                  <p>Find your way around, meet the people here, and help us keep this a good place to be.</p>
                  <div className="embed-divider" />
                  <p className="embed-rules"><b>Be kind.</b> Treat people with respect.<br /><b>Stay on topic.</b> Use the right channels.<br /><b>Ask for help.</b> The moderators are here.</p>
                  <div className="embed-tags"><span>Community guide</span><span>Updated today</span></div>
                </div>
                <div className="discord-reaction">✦ <span>12</span></div>
              </div>
            </div>
            <div className="discord-footer"><span>Message from nio</span><span>Designed in your dashboard</span></div>
          </article>
          <div className="preview-index"><span>01</span><span>One panel, ready to publish</span></div>
        </div>
      </section>

      <section className="home-capabilities" aria-label="What nio helps you do">
        <div className="capabilities-heading"><p>Less busywork, more belonging.</p><span>Tools for the everyday life of a server.</span></div>
        <div className="capability-list">{CAPABILITIES.map((item) => <article className="capability" key={item.name}><span className="capability-mark">{item.mark}</span><div><h2>{item.name}</h2><p>{item.detail}</p></div><span className="capability-spark" aria-hidden="true">✳</span></article>)}</div>
      </section>
      <footer className="home-footer"><span>nio · made for your corner of Discord</span><a href="/privacy">Privacy</a></footer>
    </main>
  );
}
