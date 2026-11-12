import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'
import { Tensor, loadAndCompile, loadLiteRt, supportsFeature, type CompiledModel } from '@litertjs/core'

/*
 * Versión web del pipeline facial de Android (FaceEmbeddingExtractor + FaceEmbeddingModel):
 *  1. Detecta el rostro en la foto (MediaPipe Face Detector, en lugar de ML Kit).
 *  2. Lo recorta y lo reduce a 112×112.
 *  3. Calcula el embedding con el MISMO mobilefacenet.tflite (LiteRT.js, antes TFLite).
 * No decide si es la persona correcta: eso lo hace comparar.ts contra el
 * embedding guardado en enrolamientos_faciales. Todo corre en el teléfono; la
 * foto nunca sale de él.
 */

/** Se guarda en enrolamientos_faciales.modelo para distinguir enrolamientos hechos desde la web. */
export const NOMBRE_MODELO = 'mobilefacenet-web'
/** Lo que guardaba la app Android. */
export const NOMBRE_MODELO_ANDROID = 'mobilefacenet.tflite'

const ENTRADA = 112
const ESCALA_RECORTE = 1.3
const DESPLAZAMIENTO_VERTICAL = -0.2
const DIMENSION_SALIDA = 192

export type ResultadoDeteccion =
  | { tipo: 'rostro'; embedding: Float32Array }
  | { tipo: 'sin_rostro' }
  | { tipo: 'varios_rostros' }
  | { tipo: 'demasiado_pequeno' }

interface Motor {
  detector: FaceDetector
  modelo: CompiledModel
  /** Cuántas imágenes espera el modelo por corrida (algunas variantes de MobileFaceNet piden 2). */
  lote: number
}

let motor: Promise<Motor> | null = null

const MEDIAPIPE = '/vendor/mediapipe'
const LITERT = '/vendor/litert/'
const MODELO_DETECTOR = '/models/blaze_face_short_range.tflite'
const MODELO_ROSTRO = '/models/mobilefacenet.tflite'

/**
 * Baja los archivos del motor sin compilarlo, para que el service worker los
 * guarde y "Registrar asistencia" funcione sin red. Pide la misma variante de
 * WASM que elegirán MediaPipe y LiteRT (loadLiteRt usa la de SIMD relajado si
 * el navegador lo soporta y si no la compatible).
 */
export async function precargarArchivos(): Promise<void> {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE)
  const litert = `${LITERT}${(await supportsFeature('relaxedSimd')) ? 'litert_wasm_internal' : 'litert_wasm_compat_internal'}`
  for (const url of [vision.wasmLoaderPath, vision.wasmBinaryPath, `${litert}.js`, `${litert}.wasm`, MODELO_DETECTOR, MODELO_ROSTRO]) {
    await fetch(url).then((r) => r.arrayBuffer())
  }
}

/** Carga detector y modelo una sola vez (varios MB; quedan en caché del service worker). */
export function prepararMotor(): Promise<Motor> {
  motor ??= crearMotor().catch((e) => {
    motor = null
    throw e
  })
  return motor
}

async function crearMotor(): Promise<Motor> {
  // En secuencia, no en paralelo: inicializar los dos módulos WASM a la vez deja la página colgada.
  const archivos = await FilesetResolver.forVisionTasks(MEDIAPIPE)
  const detector = await FaceDetector.createFromOptions(archivos, {
    baseOptions: { modelAssetPath: MODELO_DETECTOR, delegate: 'CPU' },
    runningMode: 'IMAGE',
    minDetectionConfidence: 0.6
  })
  await loadLiteRt(LITERT)
  const modelo = await loadAndCompile(MODELO_ROSTRO, { accelerator: 'wasm' })
  const forma = modelo.getInputDetails()[0]?.shape
  const lote = forma && forma.length === 4 ? Math.max(1, forma[0]) : 1
  return { detector, modelo, lote }
}

/** Toma el cuadro actual del video como imagen (sin espejo: igual que la foto de CameraX). */
export function capturarCuadro(video: HTMLVideoElement): HTMLCanvasElement {
  const ancho = video.videoWidth
  const alto = video.videoHeight
  if (!ancho || !alto) throw new Error('La cámara no está lista')
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  lienzo.getContext('2d')!.drawImage(video, 0, 0, ancho, alto)
  return lienzo
}

export async function procesar(foto: HTMLCanvasElement): Promise<ResultadoDeteccion> {
  const { detector, modelo, lote } = await prepararMotor()

  const rostros = detector.detect(foto).detections
  if (rostros.length === 0) return { tipo: 'sin_rostro' }
  if (rostros.length > 1) return { tipo: 'varios_rostros' }

  const caja = rostros[0].boundingBox
  if (!caja) return { tipo: 'sin_rostro' }
  if (caja.width < foto.width * 0.15) return { tipo: 'demasiado_pequeno' }

  const entrada = prepararEntrada(foto, caja, lote)
  const tensor = new Tensor(entrada, [lote, ENTRADA, ENTRADA, 3])
  try {
    const [salida] = await modelo.run([tensor])
    try {
      const datos = salida.toTypedArray() as Float32Array
      return { tipo: 'rostro', embedding: normalizar(Float32Array.from(datos.subarray(0, DIMENSION_SALIDA))) }
    } finally {
      salida.delete()
    }
  } finally {
    tensor.delete()
  }
}

/**
 * Giros con los que se prueba cada cuadro al registrar. Con la cabeza ladeada el
 * embedding cambia mucho; los puntos de los ojos de MediaPipe tienen hasta 10° de
 * error, así que en vez de enderezar se prueban tres giros y se toma el mejor.
 * Con retratos públicos (web/README.md): ladeada 10–18° dejó de fallar y la
 * similitud máxima entre personas distintas pasó de 0.41 a 0.43 (umbral 0.55).
 */
const GIROS = [0, -12, 12]

/**
 * Variantes del cuadro (ver GIROS) sin procesar: verificar() solo procesa la
 * siguiente si la anterior no coincidió. El enrolamiento usa solo el derecho.
 */
export function variantesConGiros(foto: HTMLCanvasElement): (() => Promise<ResultadoDeteccion>)[] {
  return GIROS.map((grados) => async () => {
    if (!grados) return procesar(foto)
    const girada = girar(foto, grados)
    try {
      return await procesar(girada)
    } finally {
      // iOS limita la memoria total de los canvas: se libera sin esperar al recolector.
      girada.width = girada.height = 0
    }
  })
}

function girar(foto: HTMLCanvasElement, grados: number): HTMLCanvasElement {
  const lienzo = document.createElement('canvas')
  lienzo.width = foto.width
  lienzo.height = foto.height
  const ctx = lienzo.getContext('2d')!
  ctx.translate(foto.width / 2, foto.height / 2)
  ctx.rotate((grados * Math.PI) / 180)
  ctx.drawImage(foto, -foto.width / 2, -foto.height / 2)
  return lienzo
}

/** Recorta el rostro, lo escala a 112×112 y normaliza a [-1, 1] (convención de MobileFaceNet). */
function prepararEntrada(
  foto: HTMLCanvasElement,
  caja: { originX: number; originY: number; width: number; height: number },
  lote: number
): Float32Array {
  // La caja de MediaPipe es más chica y más baja que la de ML Kit: se agranda y se
  // sube para incluir frente y barbilla. Calibrado con retratos reales (ver
  // web/README.md, "Reconocimiento facial"): ×1.3 y 20 % hacia arriba.
  const lado = Math.max(caja.width, caja.height) * ESCALA_RECORTE
  const cx = caja.originX + caja.width / 2
  const cy = caja.originY + caja.height / 2 + DESPLAZAMIENTO_VERTICAL * caja.height
  const x0 = cx - lado / 2
  const y0 = cy - lado / 2

  const recorte = document.createElement('canvas')
  recorte.width = ENTRADA
  recorte.height = ENTRADA
  const ctx = recorte.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, ENTRADA, ENTRADA)
  // Solo la parte que cae dentro de la foto (Safari no dibuja nada si el origen se sale de la imagen).
  const sx = Math.max(0, x0)
  const sy = Math.max(0, y0)
  const sw = Math.min(foto.width, x0 + lado) - sx
  const sh = Math.min(foto.height, y0 + lado) - sy
  const k = ENTRADA / lado
  if (sw > 0 && sh > 0) ctx.drawImage(foto, sx, sy, sw, sh, (sx - x0) * k, (sy - y0) * k, sw * k, sh * k)
  const pixeles = ctx.getImageData(0, 0, ENTRADA, ENTRADA).data

  const porImagen = ENTRADA * ENTRADA * 3
  const salida = new Float32Array(porImagen * lote)
  for (let i = 0, j = 0; i < pixeles.length; i += 4, j += 3) {
    salida[j] = (pixeles[i] - 127.5) / 127.5
    salida[j + 1] = (pixeles[i + 1] - 127.5) / 127.5
    salida[j + 2] = (pixeles[i + 2] - 127.5) / 127.5
  }
  for (let b = 1; b < lote; b++) salida.copyWithin(b * porImagen, 0, porImagen)
  return salida
}

/** Vector de norma 1: así cada foto pesa igual al promediar. La similitud coseno no cambia. */
function normalizar(v: Float32Array): Float32Array {
  const norma = Math.hypot(...v)
  return norma > 0 ? v.map((x) => x / norma) : v
}
