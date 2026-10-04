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

  it('sends one PDF multipart upload with a bearer token and no office selector', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ document_id: 'document-id', status: 'ready' }),
    });
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'session-token',
      fetchImpl,
    });
    const file = new File(['synthetic PDF'], 'umowa.pdf', { type: 'application/pdf' });

    await expect(api.uploadDocument(file)).resolves.toEqual({ document_id: 'document-id', status: 'ready' });

    const [, options] = fetchImpl.mock.calls[0];
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.example.test/anonymize');
    expect(options.headers).toEqual({ Authorization: 'Bearer session-token' });
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('file').name).toBe('umowa.pdf');
    expect([...options.body.keys()]).toEqual(['file']);
  });

  it.each([
    [{ name: 'umowa.txt', size: 12 }, 'FILE_TYPE_NOT_ALLOWED'],
    [{ name: 'umowa.pdf', size: 10 * 1024 * 1024 + 1 }, 'FILE_TOO_LARGE'],
  ])('blocks invalid uploads locally (%s)', async (file, expectedCode) => {
    const fetchImpl = vi.fn();
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'session-token',
      fetchImpl,
    });

    await expect(api.uploadDocument(file)).rejects.toMatchObject({ code: expectedCode });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps processing failures to a clear upload error', async () => {
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'session-token',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ detail: 'The document could not be processed.' }),
      }),
    });

    await expect(api.uploadDocument(new File(['synthetic PDF'], 'umowa.pdf'))).rejects.toMatchObject({
      code: 'PROCESSING_FAILED',
      message: 'Nie udało się przetworzyć dokumentu. Sprawdź plik i spróbuj ponownie.',
    });
  });
});
