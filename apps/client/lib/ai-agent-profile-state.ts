import { AgentProfile, AiSettings, KeyDraft, assertAgentProfile } from './ai-agent';

export type ProfileDraft = {
  settings: AiSettings | null;
  baseline: AiSettings | null;
  keys: KeyDraft;
  dirty: boolean;
};

export type ProfileDrafts = Record<AgentProfile, ProfileDraft>;

export type ProfileDraftState = {
  drafts: ProfileDrafts;
  generations: Record<AgentProfile, number>;
};

export function emptyKeyDraft(): KeyDraft {
  return { apiKey: '', clearApiKey: false, imageApiKey: '', clearImageApiKey: false };
}

export function isProfileDirty(settings: AiSettings | null, baseline: AiSettings | null, keys: KeyDraft): boolean {
  if (!settings) return false;
  return (
    JSON.stringify(settings) !== JSON.stringify(baseline)
    || Boolean(keys.apiKey)
    || keys.clearApiKey
    || Boolean(keys.imageApiKey)
    || keys.clearImageApiKey
  );
}

export function createProfileDrafts(): ProfileDraftState {
  return {
    drafts: {
      PUBLIC: { settings: null, baseline: null, keys: emptyKeyDraft(), dirty: false },
      ADMIN: { settings: null, baseline: null, keys: emptyKeyDraft(), dirty: false },
    },
    generations: {
      PUBLIC: 0,
      ADMIN: 0,
    },
  };
}

export function beginProfileRequest(
  state: ProfileDraftState,
  profile: AgentProfile,
): { state: ProfileDraftState; requestId: number } {
  const validProfile = assertAgentProfile(profile);
  const requestId = state.generations[validProfile] + 1;
  return {
    requestId,
    state: {
      ...state,
      generations: {
        ...state.generations,
        [validProfile]: requestId,
      },
    },
  };
}

export function applyProfileLoadResponse(
  state: ProfileDraftState,
  profile: AgentProfile,
  requestId: number,
  settings: AiSettings,
): ProfileDraftState {
  const validProfile = assertAgentProfile(profile);
  if (requestId !== state.generations[validProfile]) return state;
  const normalized: AiSettings = {
    ...settings,
    profile: validProfile,
    tokenQuotaMode: validProfile === 'ADMIN' ? 'UNLIMITED' : 'LIMITED',
  };
  const keys = emptyKeyDraft();
  return {
    ...state,
    drafts: {
      ...state.drafts,
      [validProfile]: {
        settings: normalized,
        baseline: normalized,
        keys,
        dirty: false,
      },
    },
  };
}

export function updateProfileSettings(
  state: ProfileDraftState,
  profile: AgentProfile,
  settings: AiSettings,
): ProfileDraftState {
  const validProfile = assertAgentProfile(profile);
  const current = state.drafts[validProfile];
  const nextSettings: AiSettings = {
    ...settings,
    profile: validProfile,
    tokenQuotaMode: validProfile === 'ADMIN' ? 'UNLIMITED' : 'LIMITED',
  };
  return {
    ...state,
    generations: {
      ...state.generations,
      [validProfile]: state.generations[validProfile] + 1,
    },
    drafts: {
      ...state.drafts,
      [validProfile]: {
        ...current,
        settings: nextSettings,
        dirty: isProfileDirty(nextSettings, current.baseline, current.keys),
      },
    },
  };
}

export function updateProfileKeys(
  state: ProfileDraftState,
  profile: AgentProfile,
  patch: Partial<KeyDraft>,
): ProfileDraftState {
  const validProfile = assertAgentProfile(profile);
  const current = state.drafts[validProfile];
  const nextKeys: KeyDraft = { ...current.keys, ...patch };
  return {
    ...state,
    generations: {
      ...state.generations,
      [validProfile]: state.generations[validProfile] + 1,
    },
    drafts: {
      ...state.drafts,
      [validProfile]: {
        ...current,
        keys: nextKeys,
        dirty: isProfileDirty(current.settings, current.baseline, nextKeys),
      },
    },
  };
}

export function applyProfileSaveSuccess(
  state: ProfileDraftState,
  profile: AgentProfile,
  requestId: number,
  savedSettings: AiSettings,
): ProfileDraftState {
  const validProfile = assertAgentProfile(profile);
  if (requestId !== state.generations[validProfile]) return state;
  const normalized: AiSettings = {
    ...savedSettings,
    profile: validProfile,
    tokenQuotaMode: validProfile === 'ADMIN' ? 'UNLIMITED' : 'LIMITED',
  };
  const keys = emptyKeyDraft();
  return {
    ...state,
    drafts: {
      ...state.drafts,
      [validProfile]: {
        settings: normalized,
        baseline: normalized,
        keys,
        dirty: false,
      },
    },
  };
}

export function applyProfileSaveFailure(
  state: ProfileDraftState,
  profile: AgentProfile,
  requestId: number,
): ProfileDraftState {
  const validProfile = assertAgentProfile(profile);
  if (requestId !== state.generations[validProfile]) return state;
  const current = state.drafts[validProfile];
  return {
    ...state,
    drafts: {
      ...state.drafts,
      [validProfile]: {
        ...current,
        dirty: isProfileDirty(current.settings, current.baseline, current.keys),
      },
    },
  };
}
