import { createClient } from '@supabase/supabase-js';

export function createSupabaseAuthClient({ supabaseUrl, supabaseAnonKey }) {
  return createClient(supabaseUrl, supabaseAnonKey);
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
