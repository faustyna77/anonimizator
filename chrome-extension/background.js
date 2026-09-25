/**
 * Background service worker (Manifest V3) — komunikacja z backendem.
 * Endpoint docelowy: https://anonimizator.fly.dev
 */
const BACKEND = "https://anonimizator.fly.dev";
const ENDPOINTS = {
  health: "/health",
  anonymize: "/anonymize",
  upload: "/upload"
};

chrome.runtime.onInstalled.addListener(({reason}) => {
  if (reason === "install" || reason === "update") {
    chrome.storage.local.set({ backend: BACKEND, version: chrome.runtime.getManifest().version });
    chrome.action.setBadgeText({ text: "" });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  const res = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const files = Array.from(document.querySelectorAll("a[href$='.pdf'], a[href$='.docx'], a[href$='.doc']"));
      return files.map(a => ({ url: a.href, name: a.innerText || a.href, type: a.href.match(/\.(pdf|docx?|doc)/i)?.[0] || "pdf" }));
    }
  }).catch(() => ({ result: [] }));
  const detected = res?.[0]?.result || [];
  chrome.storage.local.set({ detectedFiles: detected, tabId: tab.id });
  chrome.action.setBadgeText({ text: String(detected.length) || "" });
});

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg.action === "anonymous") {
    fetch(`${BACKEND}${msg.path || ENDPOINTS.anonymize}`, {
      method: msg.method || "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: msg.body ? JSON.stringify(msg.body) : undefined
    })
    .then(r => r.json().catch(() => ({})))
    .then(data => send({ ok: true, data }))
    .catch(err => send({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === "uploadFile") {
    const form = new FormData();
    // msg.fileBlob jako ArrayBuffer / base64 — uproszczone
    fetch(`${BACKEND}${msg.path || ENDPOINTS.upload}`, { method: "POST", body: form })
      .then(r => r.json().catch(() => ({})))
      .then(data => send({ ok: true, data }))
      .catch(err => send({ ok: false, error: err.message }));
    return true;
  }
});
