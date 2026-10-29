export class PublicConfigError extends Error {
  constructor() {
    super('Konfiguracja panelu jest nieprawidłowa.');
    this.name = 'PublicConfigError';
    this.code = 'PUBLIC_CONFIG_INVALID';
  }
}

const REQUIRED_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_API_BASE',
];
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function requiredValue(environment, key) {
  const value = environment?.[key];

  if (typeof value !== 'string' || !value.trim()) {
    throw new PublicConfigError();
  }

  return value.trim();
}

function validPublicUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new PublicConfigError();
  }

  if (url.protocol === 'https:') {
    return;
  }

  if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) {
    return;
  }

  throw new PublicConfigError();
}

export function resolvePublicConfig(environment) {
  const values = Object.fromEntries(
    REQUIRED_KEYS.map((key) => [key, requiredValue(environment, key)]),
  );

  validPublicUrl(values.VITE_SUPABASE_URL);
  validPublicUrl(values.VITE_API_BASE);

  return {
    supabaseUrl: values.VITE_SUPABASE_URL,
    supabaseAnonKey: values.VITE_SUPABASE_ANON_KEY,
    apiBase: values.VITE_API_BASE.replace(/\/+$/, ''),
  };
}
