import assert from 'node:assert/strict';
import test from 'node:test';

import { createSupabaseAuth } from '../src/auth.mjs';

function createChromeMock() {
  const values = {};
  let accessLevel;

  return {
    storage: {
      local: {
        async setAccessLevel({ accessLevel: nextAccessLevel }) {
          accessLevel = nextAccessLevel;
        },
        async set(nextValues) {
          Object.assign(values, nextValues);
        },
        async get(keys) {
          return Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys])
              .filter((key) => Object.hasOwn(values, key))
              .map((key) => [key, values[key]]),
          );
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete values[key];
          }
        },
      },
    },
    state() {
      return { accessLevel, values: structuredClone(values) };
    },
  };
}

const config = {
  supabaseAnonKey: 'public-anon-key',
  supabaseUrl: 'https://example.supabase.co',
};

test('sign-in persists a session without the submitted password', async () => {
  const chromeApi = createChromeMock();
  const auth = createSupabaseAuth({
    chromeApi,
    config,
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://example.supabase.co/auth/v1/token?grant_type=password');
      assert.deepEqual(JSON.parse(options.body), {
        email: 'lawyer@example.test',
        password: 'not-persisted',
      });
      return Response.json({
        access_token: 'access-token',
        expires_at: 2_000_000_000,
        refresh_token: 'refresh-token',
        token_type: 'bearer',
        user: { email: 'lawyer@example.test' },
      });
    },
  });

  const summary = await auth.signIn({
    email: 'lawyer@example.test',
    password: 'not-persisted',
  });

  assert.deepEqual(summary, { email: 'lawyer@example.test' });
  assert.equal(chromeApi.state().accessLevel, 'TRUSTED_CONTEXTS');
  assert.deepEqual(chromeApi.state().values, {
    supabaseSession: {
      access_token: 'access-token',
      expires_at: 2_000_000_000,
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      user: { email: 'lawyer@example.test' },
    },
  });
  assert.equal(JSON.stringify(chromeApi.state().values).includes('not-persisted'), false);
});

test('getAccessToken refreshes an expired stored session before returning its token', async () => {
  const chromeApi = createChromeMock();
  let calls = 0;
  const auth = createSupabaseAuth({
    chromeApi,
    config,
    fetchImpl: async (_url, options) => {
      calls += 1;
      if (calls === 1) {
        assert.deepEqual(JSON.parse(options.body), {
          email: 'lawyer@example.test',
          password: 'not-persisted',
        });
        return Response.json({
          access_token: 'expired-token',
          expires_at: 1,
          refresh_token: 'refresh-token',
          user: { email: 'lawyer@example.test' },
        });
      }

      assert.deepEqual(JSON.parse(options.body), { refresh_token: 'refresh-token' });
      return Response.json({
        access_token: 'refreshed-token',
        expires_at: 2_000_000_000,
        refresh_token: 'next-refresh-token',
        user: { email: 'lawyer@example.test' },
      });
    },
  });

  await auth.signIn({ email: 'lawyer@example.test', password: 'not-persisted' });

  assert.equal(await auth.getAccessToken(), 'refreshed-token');
  assert.equal(calls, 2);
  assert.equal(chromeApi.state().values.supabaseSession.access_token, 'refreshed-token');
  assert.equal(JSON.stringify(chromeApi.state().values).includes('not-persisted'), false);
});

test('signOut removes the persisted session', async () => {
  const chromeApi = createChromeMock();
  const auth = createSupabaseAuth({
    chromeApi,
    config,
    fetchImpl: async (url) => {
      if (url.endsWith('grant_type=password')) {
        return Response.json({
          access_token: 'access-token',
          expires_at: 2_000_000_000,
          refresh_token: 'refresh-token',
          user: { email: 'lawyer@example.test' },
        });
      }
      assert.equal(url, 'https://example.supabase.co/auth/v1/logout');
      return new Response(null, { status: 204 });
    },
  });

  await auth.signIn({ email: 'lawyer@example.test', password: 'not-persisted' });
  await auth.signOut();

  assert.deepEqual(chromeApi.state().values, {});
});

test('invalidateSessionOnUnauthorized clears a persisted session after a 401 response', async () => {
  const chromeApi = createChromeMock();
  const auth = createSupabaseAuth({
    chromeApi,
    config,
    fetchImpl: async () => Response.json({
      access_token: 'access-token',
      expires_at: 2_000_000_000,
      refresh_token: 'refresh-token',
      user: { email: 'lawyer@example.test' },
    }),
  });

  await auth.signIn({ email: 'lawyer@example.test', password: 'not-persisted' });

  assert.equal(await auth.invalidateSessionOnUnauthorized({ status: 401 }), true);
  assert.deepEqual(chromeApi.state().values, {});
});

test('getSessionSummary exposes only the stored user email', async () => {
  const chromeApi = createChromeMock();
  const auth = createSupabaseAuth({
    chromeApi,
    config,
    fetchImpl: async () => Response.json({
      access_token: 'access-token',
      expires_at: 2_000_000_000,
      refresh_token: 'refresh-token',
      user: { email: 'lawyer@example.test' },
    }),
  });

  await auth.signIn({ email: 'lawyer@example.test', password: 'not-persisted' });

  assert.deepEqual(await auth.getSessionSummary(), { email: 'lawyer@example.test' });
});

test('failed sign-in leaves storage empty', async () => {
  const chromeApi = createChromeMock();
  const auth = createSupabaseAuth({
    chromeApi,
    config,
    fetchImpl: async () => Response.json({ error: 'invalid_grant' }, { status: 400 }),
  });

  await assert.rejects(
    auth.signIn({ email: 'lawyer@example.test', password: 'not-persisted' }),
    { code: 'INVALID_CREDENTIALS' },
  );
  assert.deepEqual(chromeApi.state().values, {});
});

test('failed refresh clears the expired session and requires sign-in again', async () => {
  const chromeApi = createChromeMock();
  let calls = 0;
  const auth = createSupabaseAuth({
    chromeApi,
    config,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return Response.json({
          access_token: 'expired-token',
          expires_at: 1,
          refresh_token: 'refresh-token',
          user: { email: 'lawyer@example.test' },
        });
      }
      return Response.json({ error: 'invalid_grant' }, { status: 401 });
    },
  });

  await auth.signIn({ email: 'lawyer@example.test', password: 'not-persisted' });

  assert.equal(await auth.getAccessToken(), null);
  assert.deepEqual(chromeApi.state().values, {});
});
