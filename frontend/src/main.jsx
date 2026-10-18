import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const KitchenSink = import.meta.env.DEV
  ? lazy(() => import('./PanelKancelariiKitchenSink.jsx'))
  : null
const isKitchenSink = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('view') === 'kitchen-sink'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isKitchenSink ? (
      <Suspense fallback={<main className="panel"><p>Ładowanie kitchen sinku…</p></main>}>
        <KitchenSink />
      </Suspense>
    ) : <App />}
  </StrictMode>,
)
