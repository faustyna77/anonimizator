const ALLOWED_AI_URL_PREFIX = 'http://127.0.0.1:5173/';

export function isAllowedAiUrl(url) {
  return typeof url === 'string' && url.startsWith(ALLOWED_AI_URL_PREFIX);
}
