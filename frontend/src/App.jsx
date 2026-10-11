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
const RULE_KINDS = ['phrase', 'regex'];

function createRuleDraft(kind) {
  return {
    kind,
    pattern: '',
    marker_label: '',
    enabled: true,
  };
}

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
  const [officeRules, setOfficeRules] = useState([]);
  const [ruleDrafts, setRuleDrafts] = useState({
    phrase: createRuleDraft('phrase'),
    regex: createRuleDraft('regex'),
  });
  const [editingRule, setEditingRule] = useState(null);
  const [ruleMessage, setRuleMessage] = useState(null);
  const [savingRuleKind, setSavingRuleKind] = useState(null);
  const [deletingRuleId, setDeletingRuleId] = useState(null);
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
    setRuleMessage(null);
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
    setRuleMessage(null);

    try {
      await signOut(authClient);
      setSession(null);
      setMode('sign-in');
      setDocuments([]);
      setOfficeRules([]);
      setEditingRule(null);
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
      setOfficeRules([]);
      setEditingRule(null);
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

  async function loadOfficeRules() {
    try {
      setOfficeRules(await productApi().listOfficeRules());
    } catch (error) {
      setRuleMessage({
        text: await handleProductError(error, 'Nie udało się pobrać reguł kancelarii.'),
        role: 'alert',
      });
    }
  }

  function updateRuleDraft(kind, field, value) {
    setRuleDrafts((currentDrafts) => ({
      ...currentDrafts,
      [kind]: {
        ...currentDrafts[kind],
        [field]: value,
      },
    }));
  }

  function resetRuleDraft(kind) {
    setRuleDrafts((currentDrafts) => ({
      ...currentDrafts,
      [kind]: createRuleDraft(kind),
    }));
    if (editingRule?.kind === kind) {
      setEditingRule(null);
    }
  }

  function handleEditRule(rule) {
    setRuleDrafts((currentDrafts) => ({
      ...currentDrafts,
      [rule.kind]: {
        kind: rule.kind,
        pattern: rule.pattern,
        marker_label: rule.marker_label,
        enabled: rule.enabled,
      },
    }));
    setEditingRule({ id: rule.rule_id, kind: rule.kind });
    setRuleMessage(null);
  }

  async function handleRuleSave(event, kind) {
    event.preventDefault();
    const draft = ruleDrafts[kind];
    const editingRuleId = editingRule?.kind === kind ? editingRule.id : null;
    setRuleMessage(null);
    setSavingRuleKind(kind);

    try {
      if (editingRuleId) {
        await productApi().updateOfficeRule(editingRuleId, draft);
      } else {
        await productApi().createOfficeRule(draft);
      }
      resetRuleDraft(kind);
      setRuleMessage({
        text: editingRuleId ? 'Reguła została zaktualizowana.' : 'Reguła została dodana.',
        role: 'status',
      });
      await loadOfficeRules();
    } catch (error) {
      setRuleMessage({
        text: await handleProductError(error, 'Nie udało się zapisać reguły.'),
        role: 'alert',
      });
    } finally {
      setSavingRuleKind(null);
    }
  }

  async function handleRuleDelete(rule) {
    if (!window.confirm(`Czy na pewno usunąć regułę „${rule.pattern}”?`)) {
      return;
    }

    setRuleMessage(null);
    setDeletingRuleId(rule.rule_id);
    try {
      await productApi().deleteOfficeRule(rule.rule_id);
      if (editingRule?.id === rule.rule_id) {
        resetRuleDraft(rule.kind);
      }
      setRuleMessage({ text: 'Reguła została usunięta.', role: 'status' });
      await loadOfficeRules();
    } catch (error) {
      setRuleMessage({
        text: await handleProductError(error, 'Nie udało się usunąć reguły.'),
        role: 'alert',
      });
    } finally {
      setDeletingRuleId(null);
    }
  }

  useEffect(() => {
    if (!session) {
      setDocuments([]);
      setOfficeRules([]);
      return undefined;
    }
    void loadDocuments();
    void loadOfficeRules();
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

        <section className="panel__card" aria-labelledby="office-rules-title">
          <h2 id="office-rules-title">Reguły anonimizacji</h2>
          <p>Dodawaj osobno dosłowne frazy i wyrażenia regularne dla kolejnych dokumentów.</p>
          {ruleMessage && <p role={ruleMessage.role}>{ruleMessage.text}</p>}

          <div className="panel__rule-sections">
            {RULE_KINDS.map((kind) => {
              const isPhrase = kind === 'phrase';
              const isEditing = editingRule?.kind === kind;
              const rules = officeRules.filter((rule) => rule.kind === kind);
              const draft = ruleDrafts[kind];
              const isSaving = savingRuleKind === kind;

              return (
                <section className="panel__rule-section" key={kind} aria-labelledby={`${kind}-rules-title`}>
                  <h3 id={`${kind}-rules-title`}>{isPhrase ? 'Frazy' : 'Regexy'}</h3>
                  <p>{isPhrase
                    ? 'Fraza zostanie wyszukana niezależnie od wielkości liter.'
                    : 'Regex powinien opisywać wartość, którą chcesz ukryć.'}
                  </p>
                  <form className="panel__rule-form" onSubmit={(event) => handleRuleSave(event, kind)}>
                    <label htmlFor={`${kind}-pattern`}>{isPhrase ? 'Fraza' : 'Wyrażenie regularne'}</label>
                    <input
                      id={`${kind}-pattern`}
                      type="text"
                      value={draft.pattern}
                      onChange={(event) => updateRuleDraft(kind, 'pattern', event.target.value)}
                      maxLength={isPhrase ? 255 : 512}
                      required
                    />

                    <label htmlFor={`${kind}-marker-label`}>Etykieta markera</label>
                    <input
                      id={`${kind}-marker-label`}
                      type="text"
                      value={draft.marker_label}
                      onChange={(event) => updateRuleDraft(kind, 'marker_label', event.target.value)}
                      maxLength="32"
                      pattern="[A-Z][A-Z0-9_]*"
                      title="Użyj wielkich liter, cyfr i podkreślników; etykieta musi zaczynać się od litery."
                      required
                    />

                    <label className="panel__checkbox" htmlFor={`${kind}-enabled`}>
                      <input
                        id={`${kind}-enabled`}
                        type="checkbox"
                        checked={draft.enabled}
                        onChange={(event) => updateRuleDraft(kind, 'enabled', event.target.checked)}
                      />
                      Reguła aktywna
                    </label>

                    <div className="panel__rule-actions">
                      <button type="submit" disabled={isSaving}>
                        {isSaving ? 'Zapisywanie…' : isEditing ? 'Zapisz zmiany' : 'Dodaj regułę'}
                      </button>
                      {isEditing && (
                        <button type="button" onClick={() => resetRuleDraft(kind)} disabled={isSaving}>
                          Anuluj edycję
                        </button>
                      )}
                    </div>
                  </form>

                  {rules.length === 0 ? (
                    <p>Nie dodano jeszcze reguł tego typu.</p>
                  ) : (
                    <ul className="panel__rule-list">
                      {rules.map((rule) => (
                        <li key={rule.rule_id}>
                          <div>
                            <strong>{rule.pattern}</strong>
                            <p>Marker: {rule.marker_label} · {rule.enabled ? 'Aktywna' : 'Wyłączona'}</p>
                          </div>
                          <div className="panel__rule-actions">
                            <button type="button" onClick={() => handleEditRule(rule)}>
                              Edytuj
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRuleDelete(rule)}
                              disabled={deletingRuleId === rule.rule_id}
                            >
                              {deletingRuleId === rule.rule_id ? 'Usuwanie…' : 'Usuń'}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
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
