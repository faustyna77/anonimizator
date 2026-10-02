import { useEffect, useState } from 'react';

import { ApiAccessError, createProductApi } from './api.js';
import {
  createSupabaseAuthClient,
  restoreSession,
  signInWithPassword,
  signOut,
  signUpWithPassword,
} from './auth.js';
import './App.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://anonimizator.fly.dev';

function App() {
  const [authClient, setAuthClient] = useState(null);
  const [session, setSession] = useState(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [mode, setMode] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [accessMessage, setAccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    let subscription;

    try {
      const client = createSupabaseAuthClient();
      setAuthClient(client);

      restoreSession(client)
        .then((restoredSession) => {
          if (active) {
            setSession(restoredSession);
          }
        })
        .catch(() => {
          if (active) {
            setAuthMessage('Nie udało się przywrócić sesji. Zaloguj się ponownie.');
          }
        })
        .finally(() => {
          if (active) {
            setIsRestoringSession(false);
          }
        });

      ({ data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
        if (active) {
          setSession(nextSession);
        }
      }));
    } catch (error) {
      if (active) {
        setAuthMessage(error.message);
        setIsRestoringSession(false);
      }
    }

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function handleAuthentication(event) {
    event.preventDefault();
    setAuthMessage('');
    setAccessMessage('');
    setIsSubmitting(true);

    try {
      const credentials = { email, password };
      const nextSession = mode === 'sign-up'
        ? await signUpWithPassword(authClient, credentials)
        : await signInWithPassword(authClient, credentials);

      if (nextSession) {
        setSession(nextSession);
        return;
      }

      setAuthMessage('Potwierdź adres e-mail, a następnie zaloguj się do panelu.');
      setMode('sign-in');
    } catch (error) {
      setAuthMessage(error.message || 'Nie udało się uwierzytelnić użytkownika.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOut() {
    setAuthMessage('');
    setAccessMessage('');

    try {
      await signOut(authClient);
      setSession(null);
      setMode('sign-in');
    } catch (error) {
      setAuthMessage(error.message || 'Nie udało się wylogować użytkownika.');
    }
  }

  async function handleAccessCheck() {
    setAccessMessage('');
    const api = createProductApi({
      baseUrl: API_BASE,
      getAccessToken: async () => session?.access_token ?? null,
    });

    try {
      await api.anonymize();
      setAccessMessage('Dostęp do chronionej powierzchni panelu został potwierdzony.');
    } catch (error) {
      if (error instanceof ApiAccessError && error.code === 'UNAUTHORIZED') {
        try {
          await signOut(authClient);
        } catch {
          // The expired token is never reused even if remote sign-out cannot complete.
        }
        setSession(null);
        setMode('sign-in');
      }

      setAccessMessage(error.message || 'Nie udało się potwierdzić dostępu do panelu.');
    }
  }

  if (isRestoringSession) {
    return <main className="panel"><p>Przywracanie sesji…</p></main>;
  }

  if (session) {
    return (
      <main className="panel">
        <header className="panel__header">
          <div>
            <h1>Panel Kancelarii</h1>
            <p>Zalogowano jako {session.user?.email || 'użytkownik kancelarii'}.</p>
          </div>
          <button type="button" onClick={handleSignOut}>Wyloguj</button>
        </header>

        <section className="panel__card" aria-labelledby="protected-surface-title">
          <h2 id="protected-surface-title">Chroniona powierzchnia produktu</h2>
          <p>Ta część panelu jest dostępna wyłącznie z aktywną sesją.</p>
          <button type="button" onClick={handleAccessCheck}>Sprawdź dostęp</button>
          {accessMessage && <p role="status">{accessMessage}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="panel">
      <section className="panel__card panel__card--auth" aria-labelledby="auth-title">
        <h1 id="auth-title">Panel Kancelarii</h1>
        <p>{mode === 'sign-up' ? 'Utwórz konto kancelarii.' : 'Zaloguj się, aby przejść do panelu.'}</p>

        <form onSubmit={handleAuthentication}>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="password">Hasło</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button type="submit" disabled={isSubmitting || !authClient}>
            {isSubmitting ? 'Proszę czekać…' : mode === 'sign-up' ? 'Zarejestruj się' : 'Zaloguj się'}
          </button>
        </form>

        <button
          className="panel__link"
          type="button"
          onClick={() => {
            setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up');
            setAuthMessage('');
          }}
        >
          {mode === 'sign-up' ? 'Mam już konto' : 'Utwórz konto'}
        </button>
        {authMessage && <p role="alert">{authMessage}</p>}
      </section>
    </main>
  );
}

export default App;
