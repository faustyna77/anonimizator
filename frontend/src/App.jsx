import { useEffect, useState } from 'react';

import { ApiAccessError, createProductApi, validateDocumentUpload } from './api.js';
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
  const [selectedFile, setSelectedFile] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentMessage, setDocumentMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState(null);
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
    setDocumentMessage('');
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
    setDocumentMessage('');

    try {
      await signOut(authClient);
      setSession(null);
      setMode('sign-in');
      setDocuments([]);
      setSelectedFile(null);
    } catch (error) {
      setAuthMessage(error.message || 'Nie udało się wylogować użytkownika.');
    }
  }

  function productApi() {
    return createProductApi({
      baseUrl: API_BASE,
      getAccessToken: async () => session?.access_token ?? null,
    });
  }

  async function handleProductError(error, fallbackMessage) {
    if (error instanceof ApiAccessError && error.code === 'UNAUTHORIZED') {
      try {
        await signOut(authClient);
      } catch {
        // The expired token is never reused even if remote sign-out cannot complete.
      }
      setSession(null);
      setMode('sign-in');
      setDocuments([]);
    }
    return error.message || fallbackMessage;
  }

  async function loadDocuments() {
    try {
      setDocuments(await productApi().listDocuments());
    } catch (error) {
      setDocumentMessage(await handleProductError(error, 'Nie udało się pobrać historii dokumentów.'));
    }
  }

  useEffect(() => {
    if (!session) {
      setDocuments([]);
      return undefined;
    }
    void loadDocuments();
    return undefined;
  }, [session]);

  function handleFileSelection(event) {
    const file = event.target.files?.[0] || null;
    setDocumentMessage('');
    if (!file) {
      setSelectedFile(null);
      return;
    }
    try {
      validateDocumentUpload(file);
      setSelectedFile(file);
    } catch (error) {
      setSelectedFile(null);
      setDocumentMessage(error.message || 'Wybierz prawidłowy plik.');
      event.target.value = '';
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    setDocumentMessage('');
    if (!selectedFile) {
      setDocumentMessage('Wybierz jeden plik PDF lub DOCX.');
      return;
    }
    setIsUploading(true);
    try {
      await productApi().uploadDocument(selectedFile);
      setSelectedFile(null);
      setDocumentMessage('Dokument został zanonimizowany i jest gotowy do pobrania.');
      await loadDocuments();
    } catch (error) {
      setDocumentMessage(await handleProductError(error, 'Nie udało się przesłać dokumentu.'));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDownload(documentId) {
    setDocumentMessage('');
    setDownloadingDocumentId(documentId);
    try {
      const { download_url: downloadUrl } = await productApi().getAnonymizedDownload(documentId);
      window.location.assign(downloadUrl);
    } catch (error) {
      setDocumentMessage(await handleProductError(error, 'Nie udało się pobrać wyniku anonimizacji.'));
    } finally {
      setDownloadingDocumentId(null);
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

        <section className="panel__card" aria-labelledby="document-upload-title">
          <h2 id="document-upload-title">Anonimizacja dokumentu</h2>
          <p>Prześlij jeden plik PDF lub DOCX o rozmiarze do 10 MB.</p>
          <form onSubmit={handleUpload} className="panel__upload-form">
            <label htmlFor="document-file">Plik do anonimizacji</label>
            <input
              id="document-file"
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileSelection}
            />
            {selectedFile && <p>Wybrano: {selectedFile.name}</p>}
            <button type="submit" disabled={isUploading}>
              {isUploading ? 'Przesyłanie…' : 'Anonimizuj dokument'}
            </button>
          </form>
          {documentMessage && <p role="status">{documentMessage}</p>}
        </section>

        <section className="panel__card" aria-labelledby="document-history-title">
          <h2 id="document-history-title">Historia dokumentów</h2>
          {documents.length === 0 ? (
            <p>Nie przesłano jeszcze dokumentów.</p>
          ) : (
            <ul className="panel__document-list">
              {documents.map((document) => (
                <li key={document.document_id}>
                  <div>
                    <strong>{document.original_filename || 'Dokument bez nazwy'}</strong>
                    <p>{document.document_format.toUpperCase()} · {document.status}</p>
                  </div>
                  <button
                    type="button"
                    disabled={document.status !== 'ready' || downloadingDocumentId === document.document_id}
                    onClick={() => handleDownload(document.document_id)}
                  >
                    {downloadingDocumentId === document.document_id ? 'Przygotowywanie…' : 'Pobierz wynik'}
                  </button>
                </li>
              ))}
            </ul>
          )}
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
