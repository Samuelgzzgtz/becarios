import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Camera, CheckCircle2, CircleAlert, CloudUpload, RefreshCw, TriangleAlert } from 'lucide-react'
import { enrolar, tieneEnrolamiento, usuario as obtenerUsuario } from '../../datos/repositorios'
import { NOMBRE_MODELO, capturarCuadro, prepararMotor, procesar, promediar } from '../../facial/rostro'
import { mensajeAmigable } from '../../lib/errores'
import { AvisoBanner, Boton, Dialogo, IconoCircular, Pantalla, useVolver, type Icono, type Tono } from '../../ui/componentes'
import { MarcoCamara, PanelErrorCamara, useCamara, type EstadoGuia } from '../../ui/camara'

export const CAPTURAS_REQUERIDAS = 5

type EstadoEnrolamiento =
  | { tipo: 'capturando' }
  | { tipo: 'procesando' }
  /** Ya hay 5 fotos y el becario tenía biometría: falta confirmar el reemplazo. */
  | { tipo: 'confirmar_reemplazo' }
  | { tipo: 'guardando' }
  | { tipo: 'guardado'; reemplazo: boolean }
  /** puedeReintentarGuardado: las 5 fotos ya están; solo falló el guardado (p. ej. sin red). */
  | { tipo: 'error'; mensaje: string; puedeReintentarGuardado?: boolean }

export default function Enrolamiento() {
  const { id = '' } = useParams()
  const volver = useVolver('/ingeniero/becarios')
  // B-10: se puede elegir la cámara; la trasera es cómoda para el ingeniero.
  const [frontal, setFrontal] = useState(false)
  const camara = useCamara(frontal)
  const [estado, setEstado] = useState<EstadoEnrolamiento>({ tipo: 'capturando' })
  const [nombre, setNombre] = useState<string | null>(null)
  const [tieneBiometria, setTieneBiometria] = useState<boolean | null>(null)
  const embeddings = useRef<Float32Array[]>([])
  const [fotos, setFotos] = useState(0)
  const enCurso = useRef(false)

  useEffect(() => {
    obtenerUsuario(id).then((u) => setNombre(u?.nombre ?? null), () => undefined)
    tieneEnrolamiento(id).then(setTieneBiometria, () => undefined)
    void prepararMotor().catch(() => undefined)
  }, [id])

  async function guardar() {
    setEstado({ tipo: 'guardando' })
    try {
      const promedio = promediar(embeddings.current)
      const reemplazo = await enrolar(id, promedio, NOMBRE_MODELO, promedio.length)
      setTieneBiometria(true)
      setEstado({ tipo: 'guardado', reemplazo })
    } catch (e) {
      setEstado({ tipo: 'error', mensaje: mensajeAmigable(e, 'No se pudo guardar el enrolamiento.'), puedeReintentarGuardado: true })
    }
  }

  /** Toma y procesa una foto; los toques mientras hay una en curso se ignoran (M-08). */
  async function capturar() {
    if (embeddings.current.length >= CAPTURAS_REQUERIDAS || enCurso.current) return
    enCurso.current = true
    setEstado({ tipo: 'procesando' })
    try {
      const video = camara.video.current
      if (!video) throw new Error('La cámara no está lista')
      const r = await procesar(capturarCuadro(video))
      if (r.tipo === 'sin_rostro') setEstado({ tipo: 'error', mensaje: 'No se detectó un rostro. Intenta de nuevo.' })
      else if (r.tipo === 'varios_rostros') setEstado({ tipo: 'error', mensaje: 'Se detectó más de un rostro; solo debe estar el becario.' })
      else if (r.tipo === 'demasiado_pequeno') setEstado({ tipo: 'error', mensaje: 'Acércate más a la cámara.' })
      else {
        embeddings.current.push(r.embedding)
        setFotos(embeddings.current.length)
        if (embeddings.current.length < CAPTURAS_REQUERIDAS) setEstado({ tipo: 'capturando' })
        else if (tieneBiometria) setEstado({ tipo: 'confirmar_reemplazo' })
        else await guardar()
      }
    } catch (e) {
      setEstado({ tipo: 'error', mensaje: mensajeAmigable(e, 'No se pudo tomar la foto. Intenta de nuevo.') })
    } finally {
      enCurso.current = false
    }
  }

  async function reintentarGuardado() {
    if (embeddings.current.length < CAPTURAS_REQUERIDAS || enCurso.current) return
    enCurso.current = true
    try {
      await guardar()
    } finally {
      enCurso.current = false
    }
  }

  const guia: EstadoGuia =
    estado.tipo === 'capturando' ? 'buscando' : estado.tipo === 'procesando' || estado.tipo === 'guardando' ? 'verificando' : estado.tipo === 'error' ? 'error' : 'exito'
  const textoChip = !camara.lista && estado.tipo === 'capturando'
    ? 'Abriendo la cámara…'
    : { procesando: 'Analizando la foto…', guardando: 'Guardando biometría…', guardado: 'Biometría guardada', error: 'Revisa el mensaje' }[
        estado.tipo as 'procesando'
      ] ?? 'Centra el rostro en el óvalo'

  return (
    <Pantalla titulo="Enrolamiento facial" subtitulo={nombre ? `Becario: ${nombre}` : null} onVolver={volver}>
      {estado.tipo === 'confirmar_reemplazo' && (
        <Dialogo
          titulo="Reemplazar biometría"
          mensaje={`${nombre ?? 'Este becario'} ya tiene biometría registrada. Si continúas, la anterior dejará de usarse y se usará la nueva.`}
          textoConfirmar="Reemplazar"
          destructivo
          onConfirmar={reintentarGuardado}
          onCancelar={() => {
            embeddings.current = []
            setFotos(0)
            setEstado({ tipo: 'capturando' })
          }}
        />
      )}

      {camara.error ? (
        <PanelErrorCamara
          mensaje={camara.error}
          explicacion="Para enrolar al becario hay que tomarle 5 fotos del rostro. Con ellas se calcula su biometría."
          onReintentar={camara.reintentar}
          onVolver={volver}
        />
      ) : (
        <>
          {tieneBiometria && estado.tipo === 'capturando' && (
            <AvisoBanner texto="Este becario ya tiene biometría; al terminar se reemplazará." tono="alerta" icono={TriangleAlert} />
          )}
          <MarcoCamara
            video={camara.video}
            espejo={frontal}
            guia={guia}
            textoEstado={textoChip}
            frontal={frontal}
            alCambiarCamara={() => setFrontal((f) => !f)}
          />

          <div className="puntos" role="img" aria-label={`${fotos} de ${CAPTURAS_REQUERIDAS} fotos tomadas`}>
            {Array.from({ length: CAPTURAS_REQUERIDAS }, (_, i) => (
              <span key={i} className={`${i < fotos ? 'lleno' : ''}${i === fotos ? ' actual' : ''}`} />
            ))}
          </div>

          <div aria-live="polite" className="columna" style={{ gap: 12, paddingBottom: 8 }}>
            {estado.tipo === 'guardado' ? (
              <Resultado
                icono={CheckCircle2}
                tono="exito"
                titulo={estado.reemplazo ? 'Biometría reemplazada' : 'Biometría guardada'}
                mensaje={`${nombre ?? 'El becario'} ya puede registrar su asistencia con el rostro.`}
              >
                <Boton ancho onClick={volver}>
                  Listo
                </Boton>
              </Resultado>
            ) : estado.tipo === 'error' ? (
              <Resultado icono={CircleAlert} tono="peligro" titulo={estado.puedeReintentarGuardado ? 'No se pudo guardar' : 'Foto no válida'} mensaje={estado.mensaje}>
                {estado.puedeReintentarGuardado ? (
                  <Boton ancho icono={CloudUpload} onClick={reintentarGuardado}>
                    Reintentar guardado
                  </Boton>
                ) : (
                  <Boton ancho icono={RefreshCw} onClick={() => setEstado({ tipo: 'capturando' })}>
                    Tomar la foto de nuevo
                  </Boton>
                )}
              </Resultado>
            ) : (
              <>
                <p className="texto-2">
                  {estado.tipo === 'guardando'
                    ? `Guardando las ${CAPTURAS_REQUERIDAS} fotos…`
                    : `Foto ${Math.min(fotos + 1, CAPTURAS_REQUERIDAS)} de ${CAPTURAS_REQUERIDAS}. Pide al becario que mire a la cámara; varía un poco el ángulo entre fotos.`}
                </p>
                <Boton
                  ancho
                  icono={Camera}
                  cargando={estado.tipo === 'procesando' || estado.tipo === 'guardando'}
                  deshabilitado={estado.tipo !== 'capturando' || !camara.lista}
                  onClick={capturar}
                >
                  {estado.tipo === 'procesando' ? 'Analizando…' : estado.tipo === 'guardando' ? 'Guardando…' : 'Capturar foto'}
                </Boton>
              </>
            )}
          </div>
        </>
      )}
    </Pantalla>
  )
}

function Resultado(props: { icono: Icono; tono: Tono; titulo: string; mensaje: string; children: React.ReactNode }) {
  return (
    <>
      <div className="fila">
        <IconoCircular icono={props.icono} tono={props.tono} tamano={48} />
        <div className="crece">
          <p className="titulo-m">{props.titulo}</p>
          <p className="texto-2">{props.mensaje}</p>
        </div>
      </div>
      {props.children}
    </>
  )
}
