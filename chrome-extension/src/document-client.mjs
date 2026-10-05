export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx']);

const SAFE_MESSAGES = {
  FILE_TYPE_NOT_ALLOWED: 'Wybierz plik PDF lub DOCX.',
  FILE_TOO_LARGE: 'Plik nie może przekraczać 10 MB.',
  SESSION_REQUIRED: 'Zaloguj się ponownie, aby wysłać dokument.',
  UNAUTHORIZED: 'Sesja wygasła. Zaloguj się ponownie.',
  FORBIDDEN: 'Nie masz dostępu do anonimizacji dla tej kancelarii.',
  PROCESSING_FAILED: 'Nie udało się przetworzyć dokumentu. Sprawdź plik, a dla PDF warstwę tekstową.',
  PROCESSING: 'Dokument jest jeszcze przetwarzany. Spróbuj ponownie za chwilę.',
  RESULT_UNAVAILABLE: 'Wynik anonimizacji nie jest dostępny.',
  NETWORK_ERROR: 'Nie można połączyć się z usługą anonimizacji. Spróbuj ponownie.',
  RESULT_INVALID: 'Usługa nie zwróciła prawidłowego wyniku. Spróbuj ponownie.',
  REQUEST_FAILED: 'Nie udało się wykonać żądania. Spróbuj ponownie.',
};

export class DocumentClientError extends Error {
  constructor(code) {
    super(SAFE_MESSAGES[code] ?? SAFE_MESSAGES.REQUEST_FAILED);
    this.code = code;
    this.name = 'DocumentClientError';
  }
}

function fileExtension(file) {
  const fileName = typeof file?.name === 'string' ? file.name : '';
  return fileName.split('.').pop()?.toLowerCase();
}

export function validateDocumentUpload(file) {
  if (!file || !ALLOWED_EXTENSIONS.has(fileExtension(file))) {
    throw new DocumentClientError('FILE_TYPE_NOT_ALLOWED');
  }
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new DocumentClientError('FILE_TOO_LARGE');
  }
}

export function createDocumentApi({ baseUrl, getAccessToken, onUnauthorized, fetchImpl = fetch }) {
  async function request(path, options = {}) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new DocumentClientError('SESSION_REQUIRED');
    }

    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...options.headers,
        },
      });
    } catch {
      throw new DocumentClientError('NETWORK_ERROR');
    }

    if (response.status === 401) {
      await onUnauthorized?.(response);
      throw new DocumentClientError('UNAUTHORIZED');
    }
    if (response.status === 403) {
      throw new DocumentClientError('FORBIDDEN');
    }
    if (response.status === 409) {
      throw new DocumentClientError('PROCESSING');
    }
    if (response.status === 422) {
      throw new DocumentClientError('PROCESSING_FAILED');
    }
    if (response.status === 404) {
      throw new DocumentClientError('RESULT_UNAVAILABLE');
    }
    if (!response.ok) {
      throw new DocumentClientError('REQUEST_FAILED');
    }

    try {
      return await response.json();
    } catch {
      throw new DocumentClientError('RESULT_INVALID');
    }
  }

  return {
    async uploadDocument(file) {
      validateDocumentUpload(file);
      const formData = new FormData();
      formData.append('file', file, file.name);
      const result = await request('/anonymize', { method: 'POST', body: formData });
      if (typeof result?.document_id !== 'string' || result.document_id.length === 0) {
        throw new DocumentClientError('RESULT_INVALID');
      }
      return result;
    },

    async getAnonymizedDownload(documentId) {
      const result = await request(
        `/documents/${encodeURIComponent(documentId)}/anonymized-download`,
        { method: 'GET' },
      );
      if (typeof result?.download_url !== 'string' || result.download_url.length === 0) {
        throw new DocumentClientError('RESULT_INVALID');
      }
      return result;
    },
  };
}
