(() => {
  const loginForm = document.getElementById('loginForm');
  const loginFields = document.getElementById('loginFields');
  const loginButton = document.getElementById('loginButton');
  const logoutButton = document.getElementById('logoutButton');
  const passwordInput = document.getElementById('password');
  const sessionState = document.getElementById('sessionState');
  const documentForm = document.getElementById('documentForm');
  const documentFields = document.getElementById('documentFields');
  const documentFile = document.getElementById('documentFile');
  const anonymizeButton = document.getElementById('anonymizeButton');
  const status = document.getElementById('status');

  let auth = null;
  let documentTools = null;

  function setStatus(message) {
    status.textContent = message;
  }

  function renderSession(summary) {
    const signedIn = Boolean(summary?.email);
    loginForm.hidden = signedIn;
    documentForm.hidden = !signedIn;
    logoutButton.hidden = !signedIn;
    sessionState.hidden = !signedIn;
    sessionState.textContent = signedIn ? `Zalogowano jako ${summary.email}.` : '';
    if (!signedIn) {
      documentFile.value = '';
    }
  }

  async function getActiveTabUrl() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return activeTab?.url;
  }

  async function initialize() {
    try {
      const [
        { isAllowedAiUrl },
        { createSupabaseAuth },
        { validateDocumentUpload },
        { serializeDocumentForWorker },
        { statusMessageForDocumentResult },
      ] = await Promise.all([
        import('./src/context.mjs'),
        import('./src/auth.mjs'),
        import('./src/document-client.mjs'),
        import('./src/document-transfer.mjs'),
        import('./src/document-status.mjs'),
        import('./config.js'),
      ]);
      if (!isAllowedAiUrl(await getActiveTabUrl())) {
        loginFields.disabled = true;
        documentFields.disabled = true;
        setStatus('Rozszerzenie działa wyłącznie na http://127.0.0.1:5173/.');
        return;
      }

      auth = createSupabaseAuth({
        chromeApi: chrome,
        config: globalThis.extensionConfig,
      });
      documentTools = { serializeDocumentForWorker, statusMessageForDocumentResult, validateDocumentUpload };
      renderSession(await auth.getSessionSummary());
    } catch {
      loginFields.disabled = true;
      documentFields.disabled = true;
      setStatus('Nie można przygotować bezpiecznej sesji. Sprawdź lokalną konfigurację.');
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!auth || loginFields.disabled) {
      return;
    }

    const email = document.getElementById('email').value;
    const password = passwordInput.value;
    loginButton.disabled = true;
    setStatus('Logowanie…');

    try {
      renderSession(await auth.signIn({ email, password }));
      setStatus('Sesja została bezpiecznie zapisana.');
    } catch {
      setStatus('Nie udało się zalogować. Sprawdź dane i spróbuj ponownie.');
    } finally {
      passwordInput.value = '';
      loginButton.disabled = false;
    }
  });

  documentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!auth || !documentTools || documentFields.disabled) {
      return;
    }

    const [file] = documentFile.files;
    try {
      documentTools.validateDocumentUpload(file);
    } catch (error) {
      setStatus(documentTools.statusMessageForDocumentResult({ ok: false, code: error?.code }));
      return;
    }

    documentFields.disabled = true;
    setStatus('Wysyłanie i pobieranie zanonimizowanego wyniku…');
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'ANONYMIZE_DOCUMENT',
        file: await documentTools.serializeDocumentForWorker(file),
      });
      setStatus(documentTools.statusMessageForDocumentResult(result));
      if (result?.ok) {
        documentFile.value = '';
      }
      if (result?.code === 'UNAUTHORIZED') {
        renderSession(await auth.getSessionSummary());
      }
    } catch {
      setStatus(documentTools.statusMessageForDocumentResult({ ok: false, code: 'NETWORK_ERROR' }));
    } finally {
      documentFields.disabled = false;
    }
  });

  logoutButton.addEventListener('click', async () => {
    if (!auth) {
      return;
    }

    logoutButton.disabled = true;
    try {
      await auth.signOut();
      renderSession(null);
      setStatus('Wylogowano.');
    } catch {
      renderSession(null);
      setStatus('Lokalna sesja została usunięta.');
    } finally {
      logoutButton.disabled = false;
    }
  });

  void initialize();
})();
