// Copia los WASM de MediaPipe y LiteRT.js a public/vendor para que se sirvan
// desde el mismo dominio (y el service worker los guarde para uso sin red).
// Corre solo antes de `dev` y `build`; public/vendor no se versiona.
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const destino = join(raiz, 'public', 'vendor')

rmSync(destino, { recursive: true, force: true })
mkdirSync(destino, { recursive: true })

cpSync(join(raiz, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'), join(destino, 'mediapipe'), { recursive: true })
cpSync(join(raiz, 'node_modules', '@litertjs', 'core', 'wasm'), join(destino, 'litert'), { recursive: true })

console.log('WASM de MediaPipe y LiteRT copiados a public/vendor')
