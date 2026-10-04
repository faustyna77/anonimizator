(() => {
  const loginForm = document.getElementById('loginForm');
  const loginFields = document.getElementById('loginFields');
  const loginButton = document.getElementById('loginButton');
  const logoutButton = document.getElementById('logoutButton');
  const passwordInput = document.getElementById('password');
  const sessionState = document.getElementById('sessionState');
  const status = document.getElementById('status');

  let auth = null;

  function setStatus(message) {
    status.textContent = message;
  }

  function renderSession(summary) {
    const signedIn = Boolean(summary?.email);
    loginForm.hidden = signedIn;
    logoutButton.hidden = !signedIn;
    sessionState.hidden = !signedIn;
    sessionState.textContent = signedIn ? `Zalogowano jako ${summary.email}.` : '';
  }

  async function getActiveTabUrl() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return activeTab?.url;
  }

  async function initialize() {
    let isAllowedContext = false;
    try {
      const [{ isAllowedAiUrl }, { createSupabaseAuth }] = await Promise.all([
        import('./src/context.mjs'),
        import('./src/auth.mjs'),
        import('./config.js'),
      ]);
      isAllowedContext = isAllowedAiUrl(await getActiveTabUrl());
      if (!isAllowedContext) {
        loginFields.disabled = true;
        setStatus('Rozszerzenie działa wyłącznie na http://127.0.0.1:5173/.');
        return;
      }

      auth = createSupabaseAuth({
        chromeApi: chrome,
        config: globalThis.extensionConfig,
      });
      renderSession(await auth.getSessionSummary());
    } catch {
      loginFields.disabled = true;
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
