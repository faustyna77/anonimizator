import { PublicConfigError, resolvePublicConfig } from '../src/public-config.js';

try {
  resolvePublicConfig({
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
    VITE_API_BASE: process.env.VITE_API_BASE,
  });
  console.log('Publiczna konfiguracja panelu jest prawidłowa.');
} catch (error) {
  if (error instanceof PublicConfigError) {
    console.error('Publiczna konfiguracja panelu jest nieprawidłowa.');
  } else {
    console.error('Nie udało się zweryfikować publicznej konfiguracji panelu.');
  }
  process.exitCode = 1;
}
