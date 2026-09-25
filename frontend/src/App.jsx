import { useState, useEffect } from 'react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://anonimizator.fly.dev';

function App() {
  const [status, setStatus] = useState('Łączenie...');
  const [docs, setDocs] = useState([]);
  const [file, setFile] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/docs`) // zakładany endpoint; backend ma tylko / obecnie
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setStatus('Backend OK — ' + (data?.length ?? 0) + ' dokumentów'))
      .catch(() => setStatus('Backend offline (anonimizator.fly.dev) — brak tras'));
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: '0 24px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Panel Kancelarii — Anonimizator</h1>
      <p style={{ color: '#555' }}>Minimalny frontend pod panel kancelarii prawnej. Back-end: <code>anonimizator.fly.dev</code>.</p>

      <section style={{ padding: 20, border: '1px solid #ddd', borderRadius: 10, marginTop: 20, background: '#fafafa' }}>
        <h2>Połączenie z backendem</h2>
        <p><strong>Status:</strong> {status}</p>
        <p style={{ fontSize: 13, color: '#777' }}>Frontend: React + Vite (Cloudflare Pages) • Backend: FastAPI (Fly.io)</p>
      </section>

      <section style={{ padding: 20, border: '1px solid #ddd', borderRadius: 10, marginTop: 20 }}>
        <h2>Prześlij dokument do anonimizacji</h2>
        <input type="file" accept=".pdf,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button style={{ marginLeft: 8 }} onClick={() => alert('Wdróż endpoint POST /anonymize w backend/app/main.py')}>Wyślij (demo)</button>
      </section>

      <section style={{ padding: 20, border: '1px solid #ddd', borderRadius: 10, marginTop: 20 }}>
        <h2>Dokumenty</h2>
        {docs.length === 0 ? <p>Brak dokumentów (backend nie ma jeszcze trasy /docs).</p> : <ul>{docs.map((d, i) => <li key={i}>{d.name || d.id}</li>)}</ul>}
      </section>

      <footer style={{ marginTop: 40, fontSize: 12, color: '#999', borderTop: '1px solid #eee', paddingTop: 12 }}>
        Scaffold Cloudflare Pages • wrangler.toml • build: npm run build → dist
      </footer>
    </main>
  );
}

export default App;
