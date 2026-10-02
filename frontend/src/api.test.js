import { describe, expect, it, vi } from 'vitest';

import { ApiAccessError, createProductApi } from './api.js';
import { restoreSession } from './auth.js';

describe('panel access contracts', () => {
  it('does not make a product request without a session token', async () => {
    const fetchImpl = vi.fn();
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => null,
      fetchImpl,
    });

    await expect(api.anonymize()).rejects.toMatchObject({ code: 'SESSION_REQUIRED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('restores a persisted Supabase session', async () => {
    const session = { access_token: 'restored-token', user: { email: 'lawyer@example.test' } };
    const authClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      },
    };

    await expect(restoreSession(authClient)).resolves.toBe(session);
  });

  it('maps a 401 product response to re-authentication', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'session-token',
      fetchImpl,
    });

    await expect(api.anonymize()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.test/anonymize', {
      headers: { Authorization: 'Bearer session-token' },
      method: 'POST',
    });
  });

  it('maps a 403 product response to a generic access-denied message', async () => {
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'session-token',
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    });

    await expect(api.anonymize()).rejects.toEqual(
      new ApiAccessError('FORBIDDEN', 'Nie masz dostępu do zasobów tej kancelarii.'),
    );
  });
});
