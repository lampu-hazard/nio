import type { SessionOptions } from 'express-session';
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import { PrismaClient } from '@prisma/client';

export function createSessionOptions(nodeEnv = process.env.NODE_ENV, secret = process.env.SESSION_SECRET || 'change-this-secret'): SessionOptions {
  const isProd = nodeEnv === 'production';

  return {
    secret,
    resave: false,
    saveUninitialized: true,
    proxy: isProd,
    store: new PrismaSessionStore(
      new PrismaClient(),
      {
        checkPeriod: 2 * 60 * 1000,  // Check expired sessions every 2 minutes
        dbRecordIdFunction: undefined,
        dbRecordIdIsSessionId: true,
      }
    ),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000, // Cookie lasts for 7 days
    },
  };
}