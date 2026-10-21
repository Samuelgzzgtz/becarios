import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Iconos de la PWA a partir de public/logo.svg (npx pwa-assets-generator).
// Fondo verde en los iconos "maskable" y de iOS para que no salgan con borde blanco.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#154A2E' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#154A2E' } }
  },
  images: ['public/logo.svg']
})
