import { createClient } from '@supabase/supabase-js';

function getPublicAuthConfig(environment) {
  const url = environment.VITE_SUPABASE_URL;
  const anonKey = environment.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Brakuje publicznej konfiguracji Supabase panelu.');
  }

  return { anonKey, url };
}

export function createSupabaseAuthClient(environment = import.meta.env) {
  const { anonKey, url } = getPublicAuthConfig(environment);
  return createClient(url, anonKey);
}

export async function restoreSession(authClient) {
  const { data, error } = await authClient.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

export async function signInWithPassword(authClient, { email, password }) {
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });

  if (error) {
    throw error;
  }

  return data.session;
}

export async function signUpWithPassword(authClient, { email, password }) {
  const { data, error } = await authClient.auth.signUp({ email, password });

  if (error) {
    throw error;
  }

  return data.session;
}

export async function signOut(authClient) {
  const { error } = await authClient.auth.signOut();

  if (error) {
    throw error;
  }
}
