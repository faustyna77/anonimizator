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
      throw new ApiAccessError(
        'PROCESSING_FAILED',
        'Nie udało się przetworzyć dokumentu. Sprawdź plik i spróbuj ponownie.',
      );
    }

    if (response.status === 404) {
      throw new ApiAccessError('RESULT_UNAVAILABLE', 'Wynik anonimizacji nie jest dostępny.');
    }

    if (!response.ok) {
      throw new ApiAccessError('REQUEST_FAILED', 'Nie udało się wykonać żądania. Spróbuj ponownie.');
    }

    return response.json();
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
  };
}
