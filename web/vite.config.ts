import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const version = (paquete: string) => JSON.parse(readFileSync(`node_modules/${paquete}/package.json`, 'utf-8')).version as string
// Si se actualiza MediaPipe o LiteRT, cambia el nombre de la caché y no se mezclan WASM viejos con código nuevo.
const cacheIa = `docencheck-ia-mediapipe${version('@mediapipe/tasks-vision')}-litert${version('@litertjs/core')}-modelo1`

/*
 * La app se instala como PWA (icono en la pantalla de inicio en Android e iOS).
 * El service worker guarda la app y, al primer uso, los modelos de reconocimiento
 * facial y los WASM de MediaPipe/LiteRT, para que "Registrar asistencia" funcione
 * sin red (igual que la cola offline de la app Android, auditoría C-02).
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'DocenCheck · Control de becarios FIME',
        short_name: 'DocenCheck',
        description: 'Control de asistencia con reconocimiento facial para becarios FIME UANL.',
        lang: 'es-MX',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#154A2E',
        theme_color: '#154A2E',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Solo la app se precarga. Los WASM (≈ 22 MB) y modelos (≈ 5 MB) se guardan
        // la primera vez que se usan: cada navegador baja únicamente la variante que
        // necesita, y el admin (que no usa la cámara) no los descarga.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        globIgnores: ['vendor/**', 'models/**'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/models/'),
            handler: 'CacheFirst',
            options: { cacheName: cacheIa, cacheableResponse: { statuses: [200] } }
          }
        ]
      }
    })
  ]
})
