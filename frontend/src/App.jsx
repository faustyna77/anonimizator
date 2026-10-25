import { useEffect, useRef, useState } from 'react';

import { ApiAccessError, createProductApi, validateDocumentUpload } from './api.js';
import { createRequestGeneration } from './request-generation.js';
import { createRuleDraft, createRuleDrafts, resetRuleDrafts } from './rule-drafts.js';
import {
  createLoadingResource,
  createReadyResource,
  createResourceError,
  isEmptyResource,
} from './panel-resource-state.js';
import {
  createSupabaseAuthClient,
  restoreSession,
  signInWithPassword,
  signOut,
  signUpWithPassword,
} from './auth.js';
import { Button, Card, Field } from './components/ui/index.js';
import './App.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://anonimizator.fly.dev';
const RULE_KINDS = ['phrase', 'regex'];

function App() {
  const [authClient, setAuthClient] = useState(null);
  const [session, setSession] = useState(null);
  const sessionTokenRef = useRef(null);
  const sessionIdentityRef = useRef(null);
  const requestGenerationRef = useRef(createRequestGeneration());
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [mode, setMode] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentsResource, setDocumentsResource] = useState(createLoadingResource);
  const [officeRulesResource, setOfficeRulesResource] = useState(createLoadingResource);
  const [ruleDrafts, setRuleDrafts] = useState(createRuleDrafts);
  const [editingRule, setEditingRule] = useState(null);
  const [ruleMessage, setRuleMessage] = useState(null);
  const [savingRuleKind, setSavingRuleKind] = useState(null);
  const [deletingRuleId, setDeletingRuleId] = useState(null);
  const [documentMessage, setDocumentMessage] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState(null);
  const [selectedDeanonymizationDocumentId, setSelectedDeanonymizationDocumentId] = useState('');
  const [responseText, setResponseText] = useState('');
  const [deanonymizedResponse, setDeanonymizedResponse] = useState(null);
  const [deanonymizationMessage, setDeanonymizationMessage] = useState(null);
  const [isDeanonymizing, setIsDeanonymizing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const documents = documentsResource.data;
  const officeRules = officeRulesResource.data;

  function invalidateRequests() {
    requestGenerationRef.current.advance();
  }

  function isCurrentRequest(generation) {
    return requestGenerationRef.current.isCurrent(generation);
  }

  function clearDeanonymizationState() {
    setSelectedDeanonymizationDocumentId('');
    setResponseText('');
    setDeanonymizedResponse(null);
    setDeanonymizationMessage(null);
    setIsDeanonymizing(false);
  }

  function clearOfficeScopedUiState() {
    setDocumentsResource(createLoadingResource());
    setOfficeRulesResource(createLoadingResource());
    setRuleDrafts(resetRuleDrafts());
    setEditingRule(null);
    setRuleMessage(null);
    setDocumentMessage(null);
    setSelectedFile(null);
    setSavingRuleKind(null);
    setDeletingRuleId(null);
    setIsUploading(false);
    setDownloadingDocumentId(null);
    clearDeanonymizationState();
  }

  function setActiveSession(nextSession) {
    const nextToken = nextSession?.access_token ?? null;
    if (sessionTokenRef.current !== nextToken) {
      sessionTokenRef.current = nextToken;
      invalidateRequests();
      clearDeanonymizationState();
    }
    const nextIdentity = nextSession?.user?.id ?? null;
    if (sessionIdentityRef.current !== nextIdentity) {
      sessionIdentityRef.current = nextIdentity;
      clearOfficeScopedUiState();
    }
    setSession(nextSession);
  }

  useEffect(() => {
    let active = true;
    let subscription;

    try {
      const client = createSupabaseAuthClient();
      setAuthClient(client);

      restoreSession(client)
        .then((restoredSession) => {
          if (active) {
            setActiveSession(restoredSession);
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
          setActiveSession(nextSession);
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
    setDocumentMessage(null);
    setRuleMessage(null);
    setIsSubmitting(true);

    try {
      const credentials = { email, password };
      const nextSession = mode === 'sign-up'
        ? await signUpWithPassword(authClient, credentials)
        : await signInWithPassword(authClient, credentials);

      if (nextSession) {
        setActiveSession(nextSession);
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
    invalidateRequests();
    setActiveSession(null);
    setMode('sign-in');

    try {
      await signOut(authClient);
    } catch (error) {
      setAuthMessage(error.message || 'Nie udało się wylogować na serwerze. Dane zostały usunięte z tego urządzenia.');
    }
  }

  function productApi() {
    return createProductApi({
      baseUrl: API_BASE,
      getAccessToken: async () => session?.access_token ?? null,
    });
  }

  async function handleProductError(error, fallbackMessage, generation) {
    if (!isCurrentRequest(generation)) {
      return null;
    }
    if (error instanceof ApiAccessError && error.code === 'UNAUTHORIZED') {
      invalidateRequests();
      try {
        await signOut(authClient);
      } catch {
        // The expired token is never reused even if remote sign-out cannot complete.
      }
      setActiveSession(null);
      setMode('sign-in');
    }
    return error.message || fallbackMessage;
  }

  async function loadDocuments(generation = requestGenerationRef.current.capture()) {
    if (!isCurrentRequest(generation)) {
      return;
    }
    setDocumentsResource(createLoadingResource());
    try {
      const nextDocuments = await productApi().listDocuments();
      if (isCurrentRequest(generation)) {
        setDocumentsResource(createReadyResource(nextDocuments));
      }
    } catch (error) {
      if (!isCurrentRequest(generation)) {
        return;
      }
      const message = await handleProductError(error, 'Nie udało się pobrać historii dokumentów.', generation);
      if (message && isCurrentRequest(generation)) {
        setDocumentsResource(createResourceError(message));
      }
    }
  }

  async function loadOfficeRules(generation = requestGenerationRef.current.capture()) {
    if (!isCurrentRequest(generation)) {
      return;
    }
    setOfficeRulesResource(createLoadingResource());
    try {
      const nextOfficeRules = await productApi().listOfficeRules();
      if (isCurrentRequest(generation)) {
        setOfficeRulesResource(createReadyResource(nextOfficeRules));
      }
    } catch (error) {
      if (!isCurrentRequest(generation)) {
        return;
      }
      const message = await handleProductError(error, 'Nie udało się pobrać reguł kancelarii.', generation);
      if (message && isCurrentRequest(generation)) {
        setOfficeRulesResource(createResourceError(message));
      }
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
    const generation = requestGenerationRef.current.capture();
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
      if (!isCurrentRequest(generation)) {
        return;
      }
      resetRuleDraft(kind);
      setRuleMessage({
        text: editingRuleId ? 'Reguła została zaktualizowana.' : 'Reguła została dodana.',
        role: 'status',
      });
      await loadOfficeRules(generation);
    } catch (error) {
      if (!isCurrentRequest(generation)) {
        return;
      }
      const message = await handleProductError(error, 'Nie udało się zapisać reguły.', generation);
      if (message && isCurrentRequest(generation)) {
        setRuleMessage({ text: message, role: 'alert' });
      }
    } finally {
      if (isCurrentRequest(generation)) {
        setSavingRuleKind(null);
      }
    }
  }

  async function handleRuleDelete(rule) {
    if (!window.confirm(`Czy na pewno usunąć regułę „${rule.pattern}”?`)) {
      return;
    }

    const generation = requestGenerationRef.current.capture();
    setRuleMessage(null);
    setDeletingRuleId(rule.rule_id);
    try {
      await productApi().deleteOfficeRule(rule.rule_id);
      if (!isCurrentRequest(generation)) {
        return;
      }
      if (editingRule?.id === rule.rule_id) {
        resetRuleDraft(rule.kind);
      }
      setRuleMessage({ text: 'Reguła została usunięta.', role: 'status' });
      await loadOfficeRules(generation);
    } catch (error) {
      if (!isCurrentRequest(generation)) {
        return;
      }
      const message = await handleProductError(error, 'Nie udało się usunąć reguły.', generation);
      if (message && isCurrentRequest(generation)) {
        setRuleMessage({ text: message, role: 'alert' });
      }
    } finally {
      if (isCurrentRequest(generation)) {
        setDeletingRuleId(null);
      }
    }
  }

  useEffect(() => {
    const generation = requestGenerationRef.current.capture();
    if (!session) {
      setDocumentsResource(createLoadingResource());
      setOfficeRulesResource(createLoadingResource());
      return undefined;
    }
    void loadDocuments(generation);
    void loadOfficeRules(generation);
    return undefined;
  }, [session]);

  function handleFileSelection(event) {
    const file = event.target.files?.[0] || null;
    setDocumentMessage(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    try {
      validateDocumentUpload(file);
      setSelectedFile(file);
    } catch (error) {
      setSelectedFile(null);
      setDocumentMessage({ text: error.message || 'Wybierz prawidłowy plik.', role: 'alert' });
      event.target.value = '';
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    const generation = requestGenerationRef.current.capture();
    setDocumentMessage(null);
    if (!selectedFile) {
      setDocumentMessage({ text: 'Wybierz jeden plik PDF lub DOCX.', role: 'alert' });
      return;
    }
    setIsUploading(true);
    try {
      await productApi().uploadDocument(selectedFile);
      if (!isCurrentRequest(generation)) {
        return;
      }
      setSelectedFile(null);
      setDocumentMessage({ text: 'Dokument został zanonimizowany i jest gotowy do pobrania.', role: 'status' });
      await loadDocuments(generation);
    } catch (error) {
      if (!isCurrentRequest(generation)) {
        return;
      }
      const message = await handleProductError(error, 'Nie udało się przesłać dokumentu.', generation);
      if (message && isCurrentRequest(generation)) {
        setDocumentMessage({ text: message, role: 'alert' });
      }
    } finally {
      if (isCurrentRequest(generation)) {
        setIsUploading(false);
      }
    }
  }

  async function handleDownload(documentId) {
    const generation = requestGenerationRef.current.capture();
    setDocumentMessage(null);
    setDownloadingDocumentId(documentId);
    try {
      const { download_url: downloadUrl } = await productApi().getAnonymizedDownload(documentId);
      if (isCurrentRequest(generation)) {
        window.location.assign(downloadUrl);
      }
    } catch (error) {
      if (!isCurrentRequest(generation)) {
        return;
      }
      const message = await handleProductError(error, 'Nie udało się pobrać wyniku anonimizacji.', generation);
      if (message && isCurrentRequest(generation)) {
        setDocumentMessage({ text: message, role: 'alert' });
      }
    } finally {
      if (isCurrentRequest(generation)) {
        setDownloadingDocumentId(null);
      }
    }
  }

  function handleDeanonymizationDocumentChange(event) {
    setSelectedDeanonymizationDocumentId(event.target.value);
    setDeanonymizedResponse(null);
    setDeanonymizationMessage(null);
  }

  async function handleDeanonymization(event) {
    event.preventDefault();
    const generation = requestGenerationRef.current.capture();
    setDeanonymizationMessage(null);
    setDeanonymizedResponse(null);
    if (!selectedDeanonymizationDocumentId) {
      setDeanonymizationMessage({ text: 'Wybierz gotowy dokument z historii.', role: 'alert' });
      return;
    }

    setIsDeanonymizing(true);
    try {
      const result = await productApi().deanonymizeResponse(
        selectedDeanonymizationDocumentId,
        responseText,
      );
      if (isCurrentRequest(generation)) {
        setDeanonymizedResponse(result.response_text);
      }
    } catch (error) {
      if (!isCurrentRequest(generation)) {
        return;
      }
      const message = await handleProductError(
        error,
        'Wynik deanonymizacji nie jest dostępny. Spróbuj ponownie.',
        generation,
      );
      if (message && isCurrentRequest(generation)) {
        setDeanonymizationMessage({ text: message, role: 'alert' });
      }
    } finally {
      if (isCurrentRequest(generation)) {
        setIsDeanonymizing(false);
      }
    }
  }

  const readyDocuments = documents.filter((document) => document.status === 'ready');

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
          <Button variant="secondary" onClick={handleSignOut}>Wyloguj</Button>
        </header>

        <div className="panel__workspace">
          <Card
            className="panel__upload-card"
            description="Prześlij jeden plik PDF lub DOCX o rozmiarze do 10 MB."
            title="Anonimizacja dokumentu"
            titleId="document-upload-title"
            variant="primary"
          >
            <form onSubmit={handleUpload} className="panel__upload-form">
              <Field id="document-file" label="Plik do anonimizacji">
                <input
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileSelection}
                />
              </Field>
              {selectedFile && <p>Wybrano: {selectedFile.name}</p>}
              <Button type="submit" disabled={isUploading}>
                {isUploading ? 'Przesyłanie…' : 'Anonimizuj dokument'}
              </Button>
            </form>
            {documentMessage && <p role={documentMessage.role}>{documentMessage.text}</p>}
          </Card>

          <Card
            description="Dodawaj osobno dosłowne frazy i wyrażenia regularne dla kolejnych dokumentów."
            title="Reguły anonimizacji"
            titleId="office-rules-title"
          >
          {ruleMessage && <p role={ruleMessage.role}>{ruleMessage.text}</p>}
          {officeRulesResource.status === 'loading' && <p role="status">Ładowanie reguł kancelarii…</p>}
          {officeRulesResource.status === 'error' && (
            <>
              <p role="alert">{officeRulesResource.error}</p>
              <Button variant="secondary" onClick={() => { void loadOfficeRules(); }}>
                Spróbuj ponownie
              </Button>
            </>
          )}

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
                    <Field id={`${kind}-pattern`} label={isPhrase ? 'Fraza' : 'Wyrażenie regularne'}>
                      <input
                        type="text"
                        value={draft.pattern}
                        onChange={(event) => updateRuleDraft(kind, 'pattern', event.target.value)}
                        maxLength={isPhrase ? 255 : 512}
                        required
                      />
                    </Field>

                    <Field id={`${kind}-marker-label`} label="Etykieta markera">
                      <input
                        type="text"
                        value={draft.marker_label}
                        onChange={(event) => updateRuleDraft(kind, 'marker_label', event.target.value)}
                        maxLength="32"
                        pattern="[A-Z][A-Z0-9_]*"
                        title="Użyj wielkich liter, cyfr i podkreślników; etykieta musi zaczynać się od litery."
                        required
                      />
                    </Field>

                    <Field className="ui-field--checkbox" id={`${kind}-enabled`} label="Reguła aktywna">
                      <input
                        type="checkbox"
                        checked={draft.enabled}
                        onChange={(event) => updateRuleDraft(kind, 'enabled', event.target.checked)}
                      />
                    </Field>

                    <div className="panel__rule-actions">
                      <Button type="submit" disabled={isSaving}>
                        {isSaving ? 'Zapisywanie…' : isEditing ? 'Zapisz zmiany' : 'Dodaj regułę'}
                      </Button>
                      {isEditing && (
                        <Button variant="secondary" onClick={() => resetRuleDraft(kind)} disabled={isSaving}>
                          Anuluj edycję
                        </Button>
                      )}
                    </div>
                  </form>

                  {officeRulesResource.status === 'ready' && (
                    rules.length === 0 ? (
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
                              <Button variant="secondary" onClick={() => handleEditRule(rule)}>
                                Edytuj
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={() => handleRuleDelete(rule)}
                                disabled={deletingRuleId === rule.rule_id}
                              >
                                {deletingRuleId === rule.rule_id ? 'Usuwanie…' : 'Usuń'}
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                </section>
              );
            })}
          </div>
          </Card>

          <div className="panel__support-grid">
            <Card title="Historia dokumentów" titleId="document-history-title">
              {documentsResource.status === 'loading' && <p role="status">Ładowanie historii dokumentów…</p>}
              {documentsResource.status === 'error' && (
                <>
                  <p role="alert">{documentsResource.error}</p>
                  <Button variant="secondary" onClick={() => { void loadDocuments(); }}>
                    Spróbuj ponownie
                  </Button>
                </>
              )}
              {isEmptyResource(documentsResource) && <p>Nie przesłano jeszcze dokumentów.</p>}
              {documentsResource.status === 'ready' && !isEmptyResource(documentsResource) && (
                <ul className="panel__document-list">
                  {documents.map((document) => (
                    <li key={document.document_id}>
                      <div>
                        <strong>{document.original_filename || 'Dokument bez nazwy'}</strong>
                        <p>{document.document_format.toUpperCase()} · {document.status}</p>
                      </div>
                      <Button
                        variant="secondary"
                        disabled={document.status !== 'ready' || downloadingDocumentId === document.document_id}
                        onClick={() => handleDownload(document.document_id)}
                      >
                        {downloadingDocumentId === document.document_id ? 'Przygotowywanie…' : 'Pobierz wynik'}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              description="Wybierz zanonimizowany dokument z historii i wklej odpowiedź AI. Tekst nie zostanie zapisany."
              title="Przywróć dane w odpowiedzi AI"
              titleId="response-deanonymization-title"
            >
              {documentsResource.status === 'loading' && <p role="status">Ładowanie dokumentów do wyboru…</p>}
              {documentsResource.status === 'error' && <p role="alert">Nie można wybrać dokumentu, dopóki historia nie zostanie pobrana.</p>}
              {documentsResource.status === 'ready' && readyDocuments.length === 0 && (
                <p>Nie masz jeszcze gotowego dokumentu do wyboru.</p>
              )}
              {documentsResource.status === 'ready' && readyDocuments.length > 0 && (
                <form className="panel__deanonymization-form" onSubmit={handleDeanonymization}>
                  <Field id="deanonymization-document" label="Dokument źródłowy">
                    <select
                      value={selectedDeanonymizationDocumentId}
                      onChange={handleDeanonymizationDocumentChange}
                    >
                      <option value="">Wybierz dokument</option>
                      {readyDocuments.map((document) => (
                        <option key={document.document_id} value={document.document_id}>
                          {document.original_filename || 'Dokument bez nazwy'}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field id="response-text" label="Odpowiedź AI">
                    <textarea
                      value={responseText}
                      onChange={(event) => setResponseText(event.target.value)}
                      maxLength={50_000}
                      rows="8"
                      required
                    />
                  </Field>
                  <p className="counter">{responseText.length} / 50 000 znaków</p>

                  <Button type="submit" disabled={!selectedDeanonymizationDocumentId || isDeanonymizing}>
                    {isDeanonymizing ? 'Przywracanie…' : 'Przywróć dane'}
                  </Button>
                </form>
              )}
              {deanonymizationMessage && <p role={deanonymizationMessage.role}>{deanonymizationMessage.text}</p>}
              {deanonymizedResponse !== null && (
                <div className="panel__deanonymization-result">
                  <Field id="deanonymized-response" label="Wynik deanonymizacji">
                    <textarea value={deanonymizedResponse} readOnly rows="8" />
                  </Field>
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="panel">
      <Card
        className="panel__card--auth"
        description={mode === 'sign-up' ? 'Utwórz konto kancelarii.' : 'Zaloguj się, aby przejść do panelu.'}
        headingLevel="h1"
        title="Panel Kancelarii"
        titleId="auth-title"
      >

        <form onSubmit={handleAuthentication}>
          <Field id="email" label="E-mail">
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>

          <Field id="password" label="Hasło">
            <input
              type="password"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>

          <Button type="submit" disabled={isSubmitting || !authClient}>
            {isSubmitting ? 'Proszę czekać…' : mode === 'sign-up' ? 'Zarejestruj się' : 'Zaloguj się'}
          </Button>
        </form>

        <Button
          className="panel__link"
          variant="secondary"
          type="button"
          onClick={() => {
            setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up');
            setAuthMessage('');
          }}
        >
          {mode === 'sign-up' ? 'Mam już konto' : 'Utwórz konto'}
        </Button>
        {authMessage && <p role="alert">{authMessage}</p>}
      </Card>
    </main>
  );
}

export default App;
