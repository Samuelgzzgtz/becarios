import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Camera, CheckCircle2, CircleAlert, ScanFace, SwitchCamera } from 'lucide-react'
import { mensajeAmigable } from '../lib/errores'
import { Boton, IconoCircular } from './componentes'

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
      setError('Este navegador no permite usar la cámara. Abre DocenCheck en Chrome o Safari actualizados.')
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

/** Fondo negro, video, óvalo guía y chip de estado (como el escáner de la app Android). */
export function MarcoCamara(props: {
  video: RefObject<HTMLVideoElement | null>
  espejo: boolean
  guia: EstadoGuia
  textoEstado: string
  pie?: string | null
  alCambiarCamara?: () => void
  frontal?: boolean
}) {
  const IconoChip = props.guia === 'exito' ? CheckCircle2 : props.guia === 'error' ? CircleAlert : ScanFace
  return (
    <div className="marco-camara">
      <video ref={props.video} className={props.espejo ? 'espejo' : undefined} playsInline muted autoPlay aria-label="Vista de la cámara" />
      <div className={`guia-rostro ${props.guia}`} aria-hidden>
        <div className="ovalo" />
      </div>
      <div className="chip-camara" role="status" aria-live="polite">
        {props.guia === 'verificando' ? <span className="giro" style={{ width: 14, height: 14 }} /> : <IconoChip size={16} />}
        {props.textoEstado}
      </div>
      {props.pie && <p className="pie-camara">{props.pie}</p>}
      {props.alCambiarCamara && (
        <button className="boton-icono boton-camara" onClick={props.alCambiarCamara} aria-label={props.frontal ? 'Usar cámara trasera' : 'Usar cámara frontal'}>
          <SwitchCamera size={22} />
        </button>
      )}
    </div>
  )
}

/** Cuando la cámara no abre (permiso negado, sin cámara, sin HTTPS). */
export function PanelErrorCamara(props: { mensaje: string; explicacion: string; onReintentar: () => void; onVolver: () => void; acciones?: ReactNode }) {
  return (
    <div className="columna" style={{ alignItems: 'center', textAlign: 'center', padding: '24px 8px', gap: 12 }}>
      <IconoCircular icono={Camera} tono="neutro" tamano={64} />
      <p className="titulo-m">Se necesita la cámara</p>
      <p className="texto-2">{props.explicacion}</p>
      <p className="banner tono-peligro" role="alert">{props.mensaje}</p>
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
