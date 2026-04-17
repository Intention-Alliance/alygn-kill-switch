// Session token management — opaque tokens, NOT raw backend credentials
// The browser only ever sees a random session ID, never the backend auth token

import { randomBytes } from 'crypto';

// In-memory session store (use Redis for production multi-instance)
const sessions = new Map<string, { token: string; expires: number }>();

export const SESSION_MAX_AGE = 3600; // 1 hour

export function createSessionToken(): string {
  const sessionId = randomBytes(32).toString('hex');
  const backendToken = process.env.KILL_SWITCH_AUTH_TOKEN || '';

  sessions.set(sessionId, {
    token: backendToken,
    expires: Date.now() + SESSION_MAX_AGE * 1000,
  });

  // Clean up expired sessions periodically
  if (sessions.size > 1000) {
    for (const [key, value] of sessions) {
      if (value.expires < Date.now()) sessions.delete(key);
    }
  }

  return sessionId;
}

export function getBackendToken(sessionId: string): string | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.expires < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return session.token;
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}