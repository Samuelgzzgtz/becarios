import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Camera, CheckCircle2, CircleAlert, ScanFace, SwitchCamera } from 'lucide-react'
import { mensajeAmigable } from '../lib/errores'
import { cn } from '@/lib/utils'
import { Boton } from './componentes'

export type EstadoGuia = 'buscando' | 'verificando' | 'exito' | 'error'

/**
 * Abre la cámara (frontal = "user", trasera = "environment") en un <video>.
 * Funciona en Chrome/Android y en Safari/iOS (también instalada como app),
 * siempre que el sitio se sirva por HTTPS.
 */
export function useCamara(frontal: boolean): { video: RefObject<HTMLVideoElement | null>; lista: boolean; error: string | null; reintentar: () => void } {
  const video = useRef<HTMLVideoElement | null>(null)
  const [lista, setLista] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let flujo: MediaStream | null = null
    let cancelado = false
    setLista(false)
    setError(null)

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador no permite usar la cámara. Abre Pasalista en Chrome o Safari actualizados.')
      return
    }
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: frontal ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }
      })
      .then(async (f) => {
        if (cancelado) {
          f.getTracks().forEach((t) => t.stop())
          return
        }
        flujo = f
        const v = video.current
        if (!v) return
        v.srcObject = f
        await v.play().catch(() => undefined)
        if (!cancelado) setLista(true)
      })
      .catch((e) => {
        if (!cancelado) setError(mensajeAmigable(e, 'No se pudo abrir la cámara.'))
      })

    return () => {
      cancelado = true
      flujo?.getTracks().forEach((t) => t.stop())
      if (video.current) video.current.srcObject = null
    }
  }, [frontal, intento])

  return { video, lista, error, reintentar: () => setIntento((n) => n + 1) }
}

/**
 * Fondo negro, video, óvalo guía y chip de estado (como el escáner de la app Android).
 * [pantallaCompleta]: ocupa todo su contenedor, sin esquinas ni alto máximo (Registrar asistencia).
 */
export function MarcoCamara(props: {
  video: RefObject<HTMLVideoElement | null>
  espejo: boolean
  guia: EstadoGuia
  textoEstado: string
  pie?: string | null
  alCambiarCamara?: () => void
  frontal?: boolean
  pantallaCompleta?: boolean
}) {
  const IconoChip = props.guia === 'exito' ? CheckCircle2 : props.guia === 'error' ? CircleAlert : ScanFace
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-[var(--escaner)]',
        props.pantallaCompleta ? 'absolute inset-0' : 'min-h-[300px] max-h-[58dvh] flex-1 rounded-lg'
      )}
    >
      <video
        ref={props.video}
        className={cn('absolute inset-0 block size-full object-cover', props.espejo && '-scale-x-100')}
        playsInline
        muted
        autoPlay
        aria-label="Vista de la cámara"
      />
      <div className={cn('guia-rostro pointer-events-none absolute inset-0 grid place-items-center', props.guia)} aria-hidden>
        <div className="ovalo" />
      </div>
      <div
        className={cn(
          'absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap text-white',
          props.pantallaCompleta ? 'top-[calc(84px+var(--seguro-arriba))]' : 'top-4'
        )}
        role="status"
        aria-live="polite"
      >
        {props.guia === 'verificando' ? <span className="giro size-3.5" /> : <IconoChip className="size-4" />}
        {props.textoEstado}
      </div>
      {props.pie && <p className={cn('absolute inset-x-0 px-4 text-center text-[13px] text-white', props.pantallaCompleta ? 'bottom-8' : 'bottom-3.5')}>{props.pie}</p>}
      {props.alCambiarCamara && (
        <button
          type="button"
          className="absolute right-3 bottom-3 grid size-11 place-items-center rounded-full bg-black/55 text-white"
          onClick={props.alCambiarCamara}
          aria-label={props.frontal ? 'Usar cámara trasera' : 'Usar cámara frontal'}
        >
          <SwitchCamera className="size-5" />
        </button>
      )}
    </div>
  )
}

/** Cuando la cámara no abre (permiso negado, sin cámara, sin HTTPS). */
export function PanelErrorCamara(props: { mensaje: string; explicacion: string; onReintentar: () => void; onVolver: () => void; acciones?: ReactNode }) {
  return (
    <div className="columna items-center gap-3 px-2 py-6 text-center">
      <Camera className="size-7 text-texto-2" strokeWidth={1.75} aria-hidden />
      <p className="titulo-m">Se necesita la cámara</p>
      <p className="text-texto-2">{props.explicacion}</p>
      <p className="w-full rounded-lg bg-peligro-c px-4 py-3 text-left text-peligro" role="alert">
        {props.mensaje}
      </p>
      <Boton icono={Camera} onClick={props.onReintentar} ancho>
        Permitir cámara
      </Boton>
      <Boton variante="secundario" onClick={props.onVolver} ancho>
        Volver
      </Boton>
      {props.acciones}
    </div>
  )
}
