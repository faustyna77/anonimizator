export class ApiAccessError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'ApiAccessError';
  }
}

export function createProductApi({ baseUrl, getAccessToken, fetchImpl = fetch }) {
  async function request(path, options) {
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

    if (!response.ok) {
      throw new ApiAccessError('REQUEST_FAILED', 'Nie udało się potwierdzić dostępu do panelu.');
    }

    return response.json();
  }

  return {
    anonymize() {
      return request('/anonymize', { method: 'POST' });
    },
  };
}
