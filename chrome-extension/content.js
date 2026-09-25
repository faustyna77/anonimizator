/**
 * Content script — wykrywa linki PDF/DOCX i umożliwia szybkie wysłanie.
 */
console.log("[Anonimizator] content script załadowany — backend:", "https://anonimizator.fly.dev");

const found = Array.from(document.querySelectorAll('a[href*=".pdf"], a[href*=".docx"], a[href*=".doc"]'))
  .map(a => ({ url: a.href, text: a.innerText || a.href, ext: a.href.match(/\.(pdf|docx?|doc)/i)?.[0] || "pdf" }));

if (found.length) {
  console.log("[Anonimizator] wykryto pliki do anonimizacji:", found);
  window.dispatchEvent(new CustomEvent("anonimizator:filesDetected", { detail: found }));
}
