'use client';

import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { api } from '@/lib/api';
import { featurePayload, sameFeatureSettings, validateFeature, type ChannelOption, type FeatureKey, type GuildSettings, type RoleOption } from '@/lib/feature-settings';

const Drafts = createContext<Map<string, GuildSettings> | null>(null);
export function FeatureDraftProvider({ children }: { children: ReactNode }) {
  const [drafts] = useState(() => new Map<string, GuildSettings>());
  return <Drafts.Provider value={drafts}>{children}</Drafts.Provider>;
}

type Props = {
  guildId: string;
  feature: FeatureKey;
  title: string;
  description: string;
  children: (state: { settings: GuildSettings; setSettings: Dispatch<SetStateAction<GuildSettings>>; channels: ChannelOption[]; roles: RoleOption[]; disabled: boolean }) => ReactNode;
};

export function FeatureSettingsForm(props: Props) {
  return <SettingsForm key={`${props.guildId}:${props.feature}`} {...props} />;
}

function SettingsForm({ guildId, feature, title, description, children }: Props) {
  const drafts = useContext(Drafts);
  const draftKey = `${guildId}:${feature}`;
  const [settings, setSettings] = useState<GuildSettings | null>(null);
  const [baseline, setBaseline] = useState<GuildSettings | null>(null);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const savePending = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const dirty = !!settings && !!baseline && !sameFeatureSettings(feature, settings, baseline);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    const request = ++generation.current;
    setLoading(true);
    setError('');
    setSettings(null);
    setBaseline(null);
    const needsChannels = ['voice-notifications', 'hall-of-fame', 'slowmode', 'logging'].includes(feature);
    void Promise.all([
      api<{ ok: boolean; settings: GuildSettings }>(`/guilds/${guildId}/settings`, { signal: controller.signal }),
      needsChannels ? api<{ channels: ChannelOption[] }>(`/guilds/${guildId}/channels`, { signal: controller.signal }) : Promise.resolve({ channels: [] }),
      feature === 'voice-xp' ? api<{ roles: RoleOption[] }>(`/guilds/${guildId}/roles`, { signal: controller.signal }) : Promise.resolve({ roles: [] }),
    ]).then(([response, channelResponse, roleResponse]) => {
      if (generation.current !== request || controller.signal.aborted) return;
      if (!response.ok || !response.settings || !Array.isArray(channelResponse.channels) || !Array.isArray(roleResponse.roles)) throw new Error('Settings data is unavailable.');
      setSettings(drafts?.get(draftKey) || response.settings);
      setBaseline(response.settings);
      setChannels(channelResponse.channels);
      setRoles(roleResponse.roles);
      setNotice(drafts?.has(draftKey) ? 'Your unsaved draft was restored.' : '');
    }).catch(reason => {
      if (generation.current === request && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Failed to load settings.');
    }).finally(() => {
      if (generation.current === request && !controller.signal.aborted) setLoading(false);
    });
    return () => { ++generation.current; controller.abort(); };
  }, [guildId, feature, retry, drafts, draftKey]);

  useEffect(() => {
    if (settings && baseline) {
      if (dirty) drafts?.set(draftKey, structuredClone(settings));
      else drafts?.delete(draftKey);
    }
  }, [settings, baseline, dirty, drafts, draftKey]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      const next = new URL(anchor.href, location.href);
      if (next.origin !== location.origin || (next.pathname === location.pathname && next.search === location.search)) return;
      if (!window.confirm('Leave this page with unsaved changes? Your draft will be kept until you close the dashboard.')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    // ponytail: native back/unload prompts vary by browser; in-memory drafts recover edits on return, without patching the router.
    const reconcile = () => { if (settings) drafts?.set(draftKey, structuredClone(settings)); };
    document.addEventListener('click', navigate, true);
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('popstate', reconcile);
    return () => {
      document.removeEventListener('click', navigate, true);
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('popstate', reconcile);
    };
  }, [dirty, settings, drafts, draftKey]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!settings || !baseline || loading || savePending.current || !dirty) return;
    const validation = validateFeature(feature, settings);
    if (validation) { setError(validation); return; }
    savePending.current = true;
    setSaving(true);
    setError('');
    setNotice('');
    const request = ++generation.current;
    try {
      const response = await api<{ ok: boolean; settings: GuildSettings }>(`/guilds/${guildId}/settings`, {
        method: 'PATCH', body: JSON.stringify(featurePayload(feature, settings)), signal: lifetime.current?.signal,
      });
      if (generation.current !== request || lifetime.current?.signal.aborted) return;
      if (!response.ok || !response.settings) throw new Error('Settings could not be saved.');
      setSettings(response.settings);
      setBaseline(response.settings);
      drafts?.delete(draftKey);
      setNotice('Changes saved.');
    } catch (reason) {
      if (generation.current === request && !lifetime.current?.signal.aborted) setError(reason instanceof Error ? reason.message : 'Failed to save settings.');
    } finally {
      if (generation.current === request && !lifetime.current?.signal.aborted) { savePending.current = false; setSaving(false); }
    }
  }

  return (
    <section className="dashboard-page">
      <h1>{title}</h1>
      <p className="dashboard-description">{description}</p>
      {loading && <p role="status" className="dashboard-notice">Loading settings…</p>}
      {error && <div role="alert" className="dashboard-notice">{error}{!settings && <div><button type="button" className="btn mt-3" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}</div>}
      {settings && !loading && <form onSubmit={save}>
        <fieldset disabled={saving} className="min-w-0">
          {children({ settings, setSettings: setSettings as Dispatch<SetStateAction<GuildSettings>>, channels, roles, disabled: saving })}
        </fieldset>
        <div className="dashboard-actions">
          <button type="submit" className="btn btn-primary" disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save changes'}</button>
          <span role="status" aria-live="polite">{notice || (dirty ? 'Unsaved changes' : 'No unsaved changes')}</span>
        </div>
      </form>}
    </section>
  );
}
