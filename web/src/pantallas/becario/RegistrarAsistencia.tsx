import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, CircleAlert, CloudOff, MapPin, RefreshCw, ScanFace, TriangleAlert } from 'lucide-react'
import * as asistencias from '../../datos/asistencias'
import { enrolamientoPropio, modalidadDeHoy } from '../../datos/repositorios'
import { requerirUsuario } from '../../datos/sesion'
import { MARGEN_CASI, UMBRAL_COINCIDENCIA, verificar } from '../../facial/comparar'
import { NOMBRE_MODELO_ANDROID, capturarCuadro, prepararMotor, variantesConGiros } from '../../facial/rostro'
import { ErrorDeNegocio, MENSAJE_SIN_CONEXION, esErrorDeRed, mensajeAmigable } from '../../lib/errores'
import { fechaCorta, hoy, hora } from '../../lib/fechas'
import { ubicacionOpcional } from '../../lib/ubicacion'
import type { ModalidadTrabajo, TipoAsistencia } from '../../lib/modelos'
import {
  Boton,
  IconoSinConfigurar,
  Pantalla,
  etiquetaModalidad,
  etiquetaTipo,
  iconoModalidad,
  useAhora,
  useVolver,
  type Icono
} from '../../ui/componentes'
import { MarcoCamara, PanelErrorCamara, useCamara, type EstadoGuia } from '../../ui/camara'
import { useEnLinea } from '../../ui/hooks'

type EstadoRegistro =
  | { tipo: 'listo' }
  | { tipo: 'procesando' }
  /** enCola = sin red: quedó guardado en el teléfono y se sube solo después (C-01). ubicada: se mandó la ubicación. */
  | { tipo: 'exito'; registro: TipoAsistencia; enCola: boolean; hora: string; ubicada: boolean }
  | { tipo: 'error'; mensaje: string }

interface InfoHoy {
  modalidad: ModalidadTrabajo
  configurada: boolean
  proximo: TipoAsistencia
}

export default function RegistrarAsistencia() {
  const volver = useVolver('/becario')
  const camara = useCamara(true)
  const enLinea = useEnLinea()
  const ahora = useAhora(10_000)
  const [estado, setEstado] = useState<EstadoRegistro>({ tipo: 'listo' })
  const [info, setInfo] = useState<InfoHoy | null>(null)
  const enCurso = useRef(false)

  /** También precarga (y guarda en el teléfono) biometría y patrón semanal, para registrar aunque se caiga la red (C-02). */
  const cargarInfo = useCallback(async () => {
    try {
      const u = await requerirUsuario()
      const [m, proximo] = await Promise.all([modalidadDeHoy(u.id), asistencias.siguienteTipo(u.id)])
      setInfo({ modalidad: m.modalidad, configurada: m.configurada, proximo })
      await enrolamientoPropio(u.id).catch(() => undefined)
    } catch {
      // La pantalla sigue usable; el error real se muestra al intentar registrar.
    }
  }, [])

  useEffect(() => {
    document.title = 'Registrar asistencia · Pasalista'
    void cargarInfo()
    void prepararMotor().catch(() => undefined) // descarga los modelos mientras el becario se acomoda
  }, [cargarInfo])

  /** El estado pasa a "procesando" ANTES de capturar y los toques en curso se ignoran (C-03). */
  async function capturarYRegistrar() {
    if (enCurso.current) return
    enCurso.current = true
    setEstado({ tipo: 'procesando' })
    try {
      const video = camara.video.current
      if (!video) throw new ErrorDeNegocio('La cámara no está lista. Espera un segundo e intenta de nuevo.')
      // Cada cuadro es un canvas a resolución completa: se libera al tomar el siguiente y al terminar (iOS).
      let cuadro: HTMLCanvasElement | null = null
      const liberar = () => {
        if (cuadro) cuadro.width = cuadro.height = 0
      }
      const nuevo = await registrar(() => {
        liberar()
        cuadro = capturarCuadro(video)
        return variantesConGiros(cuadro)
      }).finally(liberar)
      setEstado(nuevo)
      if (nuevo.tipo === 'exito') void cargarInfo()
    } catch (e) {
      setEstado({ tipo: 'error', mensaje: mensajeDeFallo(e) })
    } finally {
      enCurso.current = false
    }
  }

  const guia: EstadoGuia = { listo: 'buscando', procesando: 'verificando', exito: 'exito', error: 'error' }[estado.tipo] as EstadoGuia
  const textoGuia = {
    listo: 'Centra tu rostro en el óvalo',
    procesando: 'Verificando tu rostro…',
    exito: 'Coincidencia facial',
    error: 'No se pudo verificar'
  }[estado.tipo]
  // Tras registrar, el título dice lo que se registró (info ya apunta al siguiente).
  const tipo = estado.tipo === 'exito' ? estado.registro : info?.proximo

  if (camara.error) {
    return (
      <Pantalla titulo="Registrar asistencia" subtitulo={fechaCorta(hoy())} onVolver={volver}>
        <PanelErrorCamara
          mensaje={camara.error}
          explicacion="Pasalista compara tu rostro con el enrolamiento. El registro requiere aprobación humana."
          onReintentar={camara.reintentar}
          onVolver={volver}
        />
      </Pantalla>
    )
  }

  /*
   * La cámara ocupa toda la pantalla; abajo, una hoja blanca con lo que se verifica
   * (rostro, ubicación, modalidad) y el botón. La ubicación no se valida en el teléfono
   * (M-13): solo se dice si se adjuntó.
   */
  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-[var(--escaner)]">
      <div className="relative min-h-0 flex-1">
        <MarcoCamara
          video={camara.video}
          espejo
          pantallaCompleta
          guia={guia}
          textoEstado={camara.lista || estado.tipo !== 'listo' ? textoGuia : 'Abriendo la cámara…'}
          pie={guia === 'buscando' ? 'Buena luz, sin lentes oscuros ni cubrebocas' : null}
        />
        <div className="absolute inset-x-4 top-[calc(16px+var(--seguro-arriba))] flex items-center gap-3 text-white">
          <button type="button" className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15" onClick={volver} aria-label="Volver">
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="font-medium">{tipo ? etiquetaTipo(tipo) : 'Registrar asistencia'}</h1>
        </div>
      </div>

      <section className="relative z-10 -mt-4 rounded-t-2xl bg-superficie px-4 pt-3 pb-[calc(20px+var(--seguro-abajo))]" aria-live="polite">
        <div className="mb-3">
          <FilaCheque
            icono={ScanFace}
            titulo={{ listo: 'Tu rostro', procesando: 'Verificando tu rostro…', exito: 'Es tu rostro', error: 'No se pudo verificar' }[estado.tipo]}
            detalle={estado.tipo === 'exito' ? 'Coincide con tu enrolamiento' : 'Se compara en tu teléfono; la foto no se guarda'}
            resultado={estado.tipo === 'exito' ? 'ok' : estado.tipo === 'error' ? 'fallo' : null}
          />
          <FilaCheque
            icono={MapPin}
            titulo={estado.tipo !== 'exito' ? 'Ubicación' : estado.ubicada ? 'Ubicación adjunta' : 'Sin ubicación'}
            detalle={
              estado.tipo !== 'exito'
                ? 'Se envía con el registro si el teléfono la da'
                : estado.ubicada
                  ? 'Tu ingeniero ve dónde registraste'
                  : 'Tu ingeniero revisará este registro'
            }
            resultado={estado.tipo === 'exito' ? (estado.ubicada ? 'ok' : 'aviso') : null}
          />
          {info && (
            <FilaCheque
              icono={info.configurada ? iconoModalidad(info.modalidad) : IconoSinConfigurar}
              titulo={info.configurada ? etiquetaModalidad(info.modalidad) : 'Modalidad sin configurar'}
              detalle={info.configurada ? 'Modalidad de hoy' : 'Se registra como presencial'}
              resultado={null}
            />
          )}
          {!enLinea && estado.tipo !== 'exito' && (
            <FilaCheque icono={CloudOff} titulo="Sin conexión" detalle="Se guarda en el teléfono y se sube al volver la red" resultado={null} />
          )}
        </div>

        {estado.tipo === 'exito' ? (
          <Resultado
            titulo={estado.enCola ? `${etiquetaTipo(estado.registro)} guardada en el teléfono` : `${etiquetaTipo(estado.registro)} registrada a las ${estado.hora}`}
            mensaje={estado.enCola ? 'Se subirá cuando vuelva la red y requerirá aprobación humana.' : 'Pendiente de aprobación por tu ingeniero. Aún no suma horas.'}
          >
            <Boton ancho onClick={volver}>
              Listo
            </Boton>
          </Resultado>
        ) : estado.tipo === 'error' ? (
          <Resultado titulo="No se registró la asistencia" mensaje={estado.mensaje} error>
            <Boton ancho icono={RefreshCw} onClick={() => setEstado({ tipo: 'listo' })}>
              Intentar de nuevo
            </Boton>
            <Boton ancho variante="secundario" onClick={volver}>
              Volver
            </Boton>
          </Resultado>
        ) : (
          <Boton ancho icono={ScanFace} cargando={estado.tipo === 'procesando'} deshabilitado={!camara.lista} onClick={capturarYRegistrar}>
            {estado.tipo === 'procesando'
              ? 'Verificando…'
              : tipo
                ? `Registrar ${etiquetaTipo(tipo).toLowerCase()} a las ${hora(ahora)}`
                : 'Verificar y registrar'}
          </Boton>
        )}
      </section>
    </div>
  )
}

/** Una verificación de la hoja: ícono gris, qué es y su estado; a la derecha, la marca del resultado. */
function FilaCheque(props: { icono: Icono; titulo: string; detalle: string; resultado: 'ok' | 'aviso' | 'fallo' | null }) {
  const I = props.icono
  return (
    <div className="fila border-regla py-2.5 [&+&]:border-t">
      <I className="size-[18px] shrink-0 text-texto-2" strokeWidth={1.75} aria-hidden />
      <span className="crece">
        <span className="block">{props.titulo}</span>
        <span className="block text-[13px] text-texto-2">{props.detalle}</span>
      </span>
      {props.resultado === 'ok' && <Check className="size-[18px] text-dato" aria-label="Listo" />}
      {props.resultado === 'aviso' && <TriangleAlert className="size-[18px] text-alerta" aria-label="Atención" />}
      {props.resultado === 'fallo' && <CircleAlert className="size-[18px] text-peligro" aria-label="Falló" />}
    </div>
  )
}

function Resultado(props: { titulo: string; mensaje: string; error?: boolean; children: React.ReactNode }) {
  return (
    <div className="columna gap-2">
      <div className="mb-1">
        <p className={props.error ? 'titulo-m text-peligro' : 'titulo-m'}>{props.titulo}</p>
        <p className="text-texto-2">{props.mensaje}</p>
      </div>
      {props.children}
    </div>
  )
}

/** [cuadro] toma un cuadro nuevo de la cámara cada vez que se llama (ver verificar). */
async function registrar(cuadro: () => ReturnType<typeof variantesConGiros>): Promise<EstadoRegistro> {
  const usuario = await requerirUsuario()
  const enrolamiento = await enrolamientoPropio(usuario.id)
  if (!enrolamiento) {
    return { tipo: 'error', mensaje: 'Todavía no tienes biometría facial registrada. Pide a tu ingeniero que te enrole.' }
  }

  // La ubicación es opcional: se pide en paralelo al reconocimiento y nunca frena ni rompe el registro.
  const ubicacion = ubicacionOpcional()
  const resultado = await verificar(cuadro, enrolamiento.embedding_vector)
  switch (resultado.tipo) {
    case 'sin_rostro':
      return { tipo: 'error', mensaje: 'No se detectó tu rostro. Intenta de nuevo con buena luz.' }
    case 'varios_rostros':
      return { tipo: 'error', mensaje: 'Se detectó más de un rostro en la foto.' }
    case 'demasiado_pequeno':
      return { tipo: 'error', mensaje: 'Acércate más a la cámara.' }
    case 'incompatible':
      return { tipo: 'error', mensaje: 'Tu biometría se registró con otra versión de la app. Pide a tu ingeniero que te vuelva a enrolar.' }
    case 'no_coincide':
      return {
        tipo: 'error',
        mensaje:
          enrolamiento.modelo === NOMBRE_MODELO_ANDROID
            ? 'El rostro no coincide con tu registro biométrico. Tu biometría se tomó con la app Android anterior; pide a tu ingeniero que te vuelva a enrolar desde la web.'
            : resultado.similitud >= UMBRAL_COINCIDENCIA - MARGEN_CASI
              ? 'Casi. Mira de frente a la cámara, con buena luz y sin lentes ni gorra, e intenta de nuevo.'
              : 'El rostro no coincide con tu registro biométrico. Si te pasa seguido, pide a tu ingeniero que te vuelva a enrolar.'
      }
  }
  const similitud = resultado.similitud

  const tipo = await asistencias.siguienteTipo(usuario.id)
  const { modalidad } = await modalidadDeHoy(usuario.id)
  const lugar = await ubicacion
  const subida = await asistencias.registrar(usuario.id, tipo, modalidad, lugar?.latitud ?? null, lugar?.longitud ?? null, similitud)
  return { tipo: 'exito', registro: tipo, enCola: subida === 'en_cola', hora: hora(new Date()), ubicada: lugar != null }
}

function mensajeDeFallo(e: unknown): string {
  if (e instanceof ErrorDeNegocio) return e.message
  // Sin red y sin copia local de la biometría/patrón: no hay con qué verificar.
  if (esErrorDeRed(e)) return `${MENSAJE_SIN_CONEXION} Todavía no hay datos guardados en este teléfono para registrar sin red.`
  if (e instanceof Error && /wasm|tflite|litert|mediapipe|model/i.test(e.message)) {
    return 'No se pudo cargar el reconocimiento facial en este dispositivo. Actualiza el navegador e intenta de nuevo.'
  }
  return mensajeAmigable(e, 'No se pudo registrar tu asistencia. Intenta de nuevo.')
}

