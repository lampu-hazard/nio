import 'express-session';

declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
    oauthClient?: 'client' | 'owner';
    user?: {
      id: string;
      username: string;
      globalName?: string | null;
      avatar?: string | null;
      avatarUrl?: string;
    };
    guilds?: any[];
  }
}
