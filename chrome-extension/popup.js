/**
 * Popup — komunikacja z backendem https://anonimizator.fly.dev
 */
const BACKEND = "https://anonimizator.fly.dev";

const filePicker = document.getElementById("filePicker");
const fileName = document.getElementById("fileName");
const status = document.getElementById("status");
let currentFile = null;

filePicker.addEventListener("change", (e) => {
  currentFile = e.target.files[0] || null;
  fileName.textContent = currentFile ? currentFile.name + " (" + Math.round(currentFile.size/1024) + " KB)" : "Brak pliku";
});

document.getElementById("btnSend").addEventListener("click", async () => {
  status.textContent = "Wysyłanie do " + BACKEND + " ...";
  chrome.runtime.sendMessage({
    action: "anonymous",
    path: "/anonymize",
    method: "POST",
    body: currentFile ? { fileName: currentFile.name, size: currentFile.size, source: "chrome-extension" } : { source: "chrome-extension", test: true }
  }, (res) => {
    if (!res) { status.textContent = "Brak odpowiedzi (sprawdź backend / CORS)."; return; }
    status.textContent = res.ok ? "Odpowiedź: " + JSON.stringify(res.data) : "Błąd: " + (res.error || "—");
  });
});

document.getElementById("btnCheck").addEventListener("click", async () => {
  status.textContent = "Sprawdzam /health ...";
  chrome.runtime.sendMessage({
    action: "anonymous",
    path: "/health",
    method: "GET"
  }, (res) => {
    status.textContent = res && res.ok ? "OK — backend dostępny. " + JSON.stringify(res.data) : "Błąd / brak odpowiedzi (backend down / CORS).";
  });
});

chrome.storage.local.get(["backend"], (r) => {
  if (r.backend) document.getElementById("backend").textContent = "Backend: " + r.backend;
});
