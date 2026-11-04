import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './ui/estilos.css'

// Safari en iPhone ignora user-scalable=no; este evento corta el zoom de pellizco.
document.addEventListener('gesturestart', (e) => e.preventDefault())

// Al actualizar MediaPipe o LiteRT el service worker usa otra caché (vite.config.ts); las anteriores
// (unos 25 MB cada una) ya no se leen y se borran.
if ('caches' in window) {
  const actual = import.meta.env.VITE_CACHE_IA as string
  void caches
    .keys()
    .then((claves) => Promise.all(claves.filter((c) => c.startsWith('docencheck-ia-') && c !== actual).map((c) => caches.delete(c))))
    .catch(() => undefined)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
