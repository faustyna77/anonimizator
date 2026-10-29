import { describe, expect, it } from 'vitest';

import { PublicConfigError, resolvePublicConfig } from './public-config.js';

const validEnvironment = {
  VITE_SUPABASE_URL: 'https://auth.example.test',
  VITE_SUPABASE_ANON_KEY: 'public-test-key',
  VITE_API_BASE: 'https://api.example.test',
};

function resolveFailure(environment) {
  try {
    resolvePublicConfig(environment);
  } catch (error) {
    return error;
  }

  throw new Error('Expected public configuration to be rejected.');
}

describe('resolvePublicConfig', () => {
  it('accepts complete HTTPS configuration and normalizes the API base', () => {
    expect(resolvePublicConfig({
      ...validEnvironment,
      VITE_SUPABASE_URL: ' https://auth.example.test ',
      VITE_SUPABASE_ANON_KEY: ' public-test-key ',
      VITE_API_BASE: ' https://api.example.test/ ',
    })).toEqual({
      supabaseUrl: 'https://auth.example.test',
      supabaseAnonKey: 'public-test-key',
      apiBase: 'https://api.example.test',
    });
  });

  it.each([
    'http://localhost:54321',
    'http://127.0.0.1:54321',
    'http://[::1]:54321',
  ])('accepts complete HTTP loopback configuration for %s', (baseUrl) => {
    expect(resolvePublicConfig({
      ...validEnvironment,
      VITE_SUPABASE_URL: `${baseUrl}/auth/v1`,
      VITE_API_BASE: `${baseUrl}/api/`,
    })).toEqual({
      supabaseUrl: `${baseUrl}/auth/v1`,
      supabaseAnonKey: 'public-test-key',
      apiBase: `${baseUrl}/api`,
    });
  });

  it.each([
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_API_BASE',
  ])('rejects a missing %s without exposing configuration values', (key) => {
    const failure = resolveFailure({ ...validEnvironment, [key]: '   ' });

    expect(failure).toBeInstanceOf(PublicConfigError);
    expect(failure).toMatchObject({ code: 'PUBLIC_CONFIG_INVALID' });
    expect(failure.message).not.toContain('auth.example.test');
    expect(failure.message).not.toContain('api.example.test');
    expect(failure.message).not.toContain('public-test-key');
  });

  it.each(['VITE_SUPABASE_URL', 'VITE_API_BASE'])('rejects malformed %s without exposing configuration values', (key) => {
    const failure = resolveFailure({
      ...validEnvironment,
      [key]: 'not a URL',
    });

    expect(failure).toBeInstanceOf(PublicConfigError);
    expect(failure).toMatchObject({ code: 'PUBLIC_CONFIG_INVALID' });
    expect(failure.message).not.toContain('not a URL');
  });

  it.each(['VITE_SUPABASE_URL', 'VITE_API_BASE'])('rejects remote HTTP %s without exposing configuration values', (key) => {
    const failure = resolveFailure({
      ...validEnvironment,
      [key]: 'http://api.example.test',
    });

    expect(failure).toBeInstanceOf(PublicConfigError);
    expect(failure).toMatchObject({ code: 'PUBLIC_CONFIG_INVALID' });
    expect(failure.message).not.toContain('http://api.example.test');
  });
});
