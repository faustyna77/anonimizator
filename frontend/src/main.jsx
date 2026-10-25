import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PrivacyPolicy from './PrivacyPolicy.jsx'

const KitchenSink = import.meta.env.DEV
  ? lazy(() => import('./PanelKancelariiKitchenSink.jsx'))
  : null
const isKitchenSink = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('view') === 'kitchen-sink'
const isPrivacyPolicy = window.location.pathname.replace(/\/+$/, '') === '/privacy-policy'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isPrivacyPolicy ? <PrivacyPolicy /> : isKitchenSink ? (
      <Suspense fallback={<main className="panel"><p>Ładowanie kitchen sinku…</p></main>}>
        <KitchenSink />
      </Suspense>
    ) : <App />}
  </StrictMode>,
)
