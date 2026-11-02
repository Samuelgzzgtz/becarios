import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config'

// PostgreSQL/PostgREST local con JWT reales de la instancia de desarrollo de Clerk.
export default defineConfig(mergeConfig(base, {
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/rest/v1': { target: 'http://127.0.0.1:55433', rewrite: (ruta: string) => ruta.replace(/^\/rest\/v1/, '') } }
  }
}))
