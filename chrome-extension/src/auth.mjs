const SESSION_STORAGE_KEY = 'supabaseSession';

export class AuthError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = 'AuthError';
  }
}

function sessionSummary(session) {
  return { email: session?.user?.email ?? null };
}

function persistedSession(session) {
  return {
    access_token: session.access_token,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    token_type: session.token_type,
    user: { email: session.user?.email },
  };
}

export function createSupabaseAuth({ chromeApi, config, fetchImpl = fetch }) {
  const storage = chromeApi.storage.local;

  async function saveSession(session) {
    await storage.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    await storage.set({ [SESSION_STORAGE_KEY]: persistedSession(session) });
  }

  return {
    async signIn({ email, password }) {
      const response = await fetchImpl(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: config.supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        throw new AuthError('INVALID_CREDENTIALS');
      }
      const session = await response.json();

      await saveSession(session);
      return sessionSummary(session);
    },

    async getAccessToken() {
      const stored = await storage.get(SESSION_STORAGE_KEY);
      const session = stored[SESSION_STORAGE_KEY];
      if (!session) {
        return null;
      }
      if (session.expires_at * 1000 > Date.now() + 30_000) {
        return session.access_token;
      }

      const response = await fetchImpl(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          apikey: config.supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (!response.ok) {
        await storage.remove(SESSION_STORAGE_KEY);
        return null;
      }
      const refreshedSession = await response.json();
      await saveSession(refreshedSession);
      return refreshedSession.access_token;
    },

    async getSessionSummary() {
      const stored = await storage.get(SESSION_STORAGE_KEY);
      return sessionSummary(stored[SESSION_STORAGE_KEY]);
    },

    async signOut() {
      const stored = await storage.get(SESSION_STORAGE_KEY);
      const session = stored[SESSION_STORAGE_KEY];
      try {
        if (session?.access_token) {
          await fetchImpl(`${config.supabaseUrl}/auth/v1/logout`, {
            method: 'POST',
            headers: {
              apikey: config.supabaseAnonKey,
              Authorization: `Bearer ${session.access_token}`,
            },
          });
        }
      } finally {
        await storage.remove(SESSION_STORAGE_KEY);
      }
    },

    async invalidateSessionOnUnauthorized(response) {
      if (response?.status !== 401) {
        return false;
      }
      await storage.remove(SESSION_STORAGE_KEY);
      return true;
    },
  };
}
