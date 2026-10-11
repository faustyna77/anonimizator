export class ApiAccessError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'ApiAccessError';
  }
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx']);

export function validateDocumentUpload(file) {
  const extension = file?.name?.split('.').pop()?.toLowerCase();
  if (!file || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new ApiAccessError('FILE_TYPE_NOT_ALLOWED', 'Wybierz plik PDF lub DOCX.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiAccessError('FILE_TOO_LARGE', 'Plik nie może przekraczać 10 MB.');
  }
}

export function createProductApi({ baseUrl, getAccessToken, fetchImpl = fetch }) {
  async function request(path, options = {}) {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      throw new ApiAccessError('SESSION_REQUIRED', 'Zaloguj się ponownie, aby uzyskać dostęp do panelu.');
    }

    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      throw new ApiAccessError('UNAUTHORIZED', 'Sesja wygasła. Zaloguj się ponownie.');
    }

    if (response.status === 403) {
      throw new ApiAccessError('FORBIDDEN', 'Nie masz dostępu do zasobów tej kancelarii.');
    }

    if (response.status === 409) {
      throw new ApiAccessError('PROCESSING', 'Dokument jest jeszcze przetwarzany. Spróbuj ponownie za chwilę.');
    }

    if (response.status === 422) {
      if (path.startsWith('/office-rules')) {
        throw new ApiAccessError(
          'RULE_SAVE_FAILED',
          'Nie udało się zapisać reguły. Sprawdź dane i spróbuj ponownie.',
        );
      }
      throw new ApiAccessError(
        'PROCESSING_FAILED',
        'Nie udało się przetworzyć dokumentu. Sprawdź plik i spróbuj ponownie.',
      );
    }

    if (response.status === 404) {
      if (path.startsWith('/office-rules')) {
        throw new ApiAccessError('RULE_NOT_FOUND', 'Reguła nie jest dostępna.');
      }
      throw new ApiAccessError('RESULT_UNAVAILABLE', 'Wynik anonimizacji nie jest dostępny.');
    }

    if (!response.ok) {
      throw new ApiAccessError('REQUEST_FAILED', 'Nie udało się wykonać żądania. Spróbuj ponownie.');
    }

    if (response.status === 204) {
      return undefined;
    }

    return response.json();
  }

  function rulePayload(rule) {
    return {
      kind: rule.kind,
      pattern: rule.pattern,
      marker_label: rule.marker_label,
      enabled: rule.enabled,
    };
  }

  return {
    anonymize() {
      return request('/anonymize', { method: 'POST' });
    },
    async uploadDocument(file) {
      validateDocumentUpload(file);
      const formData = new FormData();
      formData.append('file', file, file.name);
      return request('/anonymize', { method: 'POST', body: formData });
    },
    listDocuments() {
      return request('/documents', { method: 'GET' });
    },
    getAnonymizedDownload(documentId) {
      return request(`/documents/${encodeURIComponent(documentId)}/anonymized-download`, {
        method: 'GET',
      });
    },
    listOfficeRules() {
      return request('/office-rules', { method: 'GET' });
    },
    createOfficeRule(rule) {
      return request('/office-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rulePayload(rule)),
      });
    },
    updateOfficeRule(ruleId, rule) {
      return request(`/office-rules/${encodeURIComponent(ruleId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rulePayload(rule)),
      });
    },
    deleteOfficeRule(ruleId) {
      return request(`/office-rules/${encodeURIComponent(ruleId)}`, { method: 'DELETE' });
    },
  };
}
