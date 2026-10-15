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

  it('sends one deanonymization request with only response_text and a bearer token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ response_text: 'Odpowiedź dla Jan Kowalski.' }),
    });
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'session-token',
      fetchImpl,
    });

    await expect(api.deanonymizeResponse('document/id', 'Odpowiedź dla [KLIENT_1].')).resolves.toEqual({
      response_text: 'Odpowiedź dla Jan Kowalski.',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/documents/document%2Fid/deanonymize-response',
      {
        body: JSON.stringify({ response_text: 'Odpowiedź dla [KLIENT_1].' }),
        headers: {
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    );
  });

  it('rejects an overlong deanonymization response before making a request', async () => {
    const fetchImpl = vi.fn();
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'session-token',
      fetchImpl,
    });

    await expect(api.deanonymizeResponse('document-id', 'x'.repeat(50_001))).rejects.toEqual(
      new ApiAccessError('RESPONSE_TEXT_TOO_LONG', 'Tekst odpowiedzi nie może przekraczać 50 000 znaków.'),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps deanonymization validation failures to safe text guidance', async () => {
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'session-token',
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 422 }),
    });

    await expect(api.deanonymizeResponse('document-id', 'Odpowiedź.')).rejects.toEqual(
      new ApiAccessError('RESPONSE_TEXT_INVALID', 'Tekst odpowiedzi jest nieprawidłowy. Spróbuj ponownie.'),
    );
  });

  it('maps deanonymization unavailable, network, and malformed-response failures to safe errors', async () => {
    const cases = [
      {
        fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 404 }),
        expected: new ApiAccessError('RESULT_UNAVAILABLE', 'Wynik anonimizacji nie jest dostępny.'),
      },
      {
        fetchImpl: vi.fn().mockRejectedValue(new Error('network details must not reach the UI')),
        expected: new ApiAccessError('REQUEST_FAILED', 'Nie udało się wykonać żądania. Spróbuj ponownie.'),
      },
      {
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => { throw new SyntaxError('unexpected response body'); },
        }),
        expected: new ApiAccessError('REQUEST_FAILED', 'Nie udało się wykonać żądania. Spróbuj ponownie.'),
      },
    ];

    for (const { fetchImpl, expected } of cases) {
      const api = createProductApi({
        baseUrl: 'https://api.example.test',
        getAccessToken: async () => 'session-token',
        fetchImpl,
      });

      await expect(api.deanonymizeResponse('document-id', 'Odpowiedź.')).rejects.toEqual(expected);
    }
  });

  it('uses bearer-authenticated CRUD requests for office rules without office_id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'session-token',
      fetchImpl,
    });
    const rule = {
      kind: 'phrase',
      pattern: 'Jan Kowalski',
      marker_label: 'KLIENT',
      enabled: true,
      office_id: 'must-not-be-sent',
    };

    await api.listOfficeRules();
    await api.createOfficeRule(rule);
    await api.updateOfficeRule('rule/id', rule);
    await api.deleteOfficeRule('rule/id');

    expect(fetchImpl.mock.calls).toEqual([
      ['https://api.example.test/office-rules', {
        headers: { Authorization: 'Bearer session-token' },
        method: 'GET',
      }],
      ['https://api.example.test/office-rules', {
        body: JSON.stringify({
          kind: 'phrase',
          pattern: 'Jan Kowalski',
          marker_label: 'KLIENT',
          enabled: true,
        }),
        headers: {
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }],
      ['https://api.example.test/office-rules/rule%2Fid', {
        body: JSON.stringify({
          kind: 'phrase',
          pattern: 'Jan Kowalski',
          marker_label: 'KLIENT',
          enabled: true,
        }),
        headers: {
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      }],
      ['https://api.example.test/office-rules/rule%2Fid', {
        headers: { Authorization: 'Bearer session-token' },
        method: 'DELETE',
      }],
    ]);
  });

  it('accepts an empty successful response when deleting a rule', async () => {
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'session-token',
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, status: 204 }),
    });

    await expect(api.deleteOfficeRule('rule-id')).resolves.toBeUndefined();
  });

  it('maps a rule validation failure to a clear save error without the raw pattern', async () => {
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'session-token',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ detail: 'Invalid pattern: (secret-regex)' }),
      }),
    });

    await expect(api.createOfficeRule({
      kind: 'regex',
      pattern: '(secret-regex)',
      marker_label: 'KLIENT',
      enabled: true,
    })).rejects.toEqual(new ApiAccessError(
      'RULE_SAVE_FAILED',
      'Nie udało się zapisać reguły. Sprawdź dane i spróbuj ponownie.',
    ));
  });

  it('maps an unavailable rule to a safe not-found error', async () => {
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'session-token',
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    });

    await expect(api.deleteOfficeRule('missing-rule')).rejects.toEqual(new ApiAccessError(
      'RULE_NOT_FOUND',
      'Reguła nie jest dostępna.',
    ));
  });

  it('maps a list-rules server failure to a generic safe error', async () => {
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'session-token',
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    });

    await expect(api.listOfficeRules()).rejects.toEqual(new ApiAccessError(
      'REQUEST_FAILED',
      'Nie udało się wykonać żądania. Spróbuj ponownie.',
    ));
  });

  it('maps an update-rules validation failure to a safe rule-save error', async () => {
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'session-token',
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 422 }),
    });

    await expect(api.updateOfficeRule('rule-id', {
      kind: 'regex',
      pattern: 'niepoprawny regex',
      marker_label: 'KLIENT',
      enabled: true,
    })).rejects.toEqual(new ApiAccessError(
      'RULE_SAVE_FAILED',
      'Nie udało się zapisać reguły. Sprawdź dane i spróbuj ponownie.',
    ));
  });

  it('maps a rejected rule request to a generic safe error', async () => {
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'session-token',
      fetchImpl: vi.fn().mockRejectedValue(new Error('network details must not reach the UI')),
    });

    await expect(api.listOfficeRules()).rejects.toEqual(new ApiAccessError(
      'REQUEST_FAILED',
      'Nie udało się wykonać żądania. Spróbuj ponownie.',
    ));
  });

  it('maps malformed successful JSON from a rule request to a generic safe error', async () => {
    const api = createProductApi({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'session-token',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('unexpected response body'); },
      }),
    });

    await expect(api.listOfficeRules()).rejects.toEqual(new ApiAccessError(
      'REQUEST_FAILED',
      'Nie udało się wykonać żądania. Spróbuj ponownie.',
    ));
  });
});
