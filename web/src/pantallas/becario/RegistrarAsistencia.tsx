import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, CloudCheck, Lock, LogIn, LogOut, RefreshCw, ScanFace } from 'lucide-react'
import * as asistencias from '../../datos/asistencias'
import { enrolamientoPropio, modalidadDeHoy } from '../../datos/repositorios'
import { requerirUsuario } from '../../datos/sesion'
import { coincide, dimensionesCompatibles } from '../../facial/comparar'
import { NOMBRE_MODELO_ANDROID, capturarCuadro, prepararMotor, procesar } from '../../facial/rostro'
import { ErrorDeNegocio, MENSAJE_SIN_CONEXION, esErrorDeRed, mensajeAmigable } from '../../lib/errores'
import { fechaCorta, hoy, hora } from '../../lib/fechas'
import type { ModalidadTrabajo, TipoAsistencia } from '../../lib/modelos'
import {
  Boton,
  IconoCircular,
  IconoSinConfigurar,
  Pantalla,
  Segmentado,
  etiquetaModalidad,
  etiquetaTipo,
  iconoModalidad,
  useVolver,
  type Icono,
  type Tono
} from '../../ui/componentes'
import { MarcoCamara, PanelErrorCamara, useCamara, type EstadoGuia } from '../../ui/camara'

type EstadoRegistro =
  | { tipo: 'listo' }
  | { tipo: 'procesando' }
  /** enCola = sin red: quedó guardado en el teléfono y se sube solo después (C-01). */
  | { tipo: 'exito'; registro: TipoAsistencia; enCola: boolean; hora: string }
  | { tipo: 'error'; mensaje: string }

interface InfoHoy {
  modalidad: ModalidadTrabajo
  configurada: boolean
  proximo: TipoAsistencia
}

export default function RegistrarAsistencia() {
  const volver = useVolver('/becario')
  const camara = useCamara(true)
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
      const nuevo = await registrar(capturarCuadro(video))
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
    exito: 'Identidad verificada',
    error: 'No se pudo verificar'
  }[estado.tipo]

  return (
    <Pantalla titulo="Registrar asistencia" subtitulo={fechaCorta(hoy())} onVolver={volver}>
      {camara.error ? (
        <PanelErrorCamara
          mensaje={camara.error}
          explicacion="DocenCheck usa la cámara frontal para confirmar que eres tú quien registra la asistencia."
          onReintentar={camara.reintentar}
          onVolver={volver}
        />
      ) : (
        <>
          <Segmentado
            opciones={['Entrada', 'Salida']}
            seleccionado={info ? (info.proximo === 'entrada' ? 0 : 1) : -1}
            iconos={[LogIn, LogOut]}
            etiqueta="Registro que toca"
          />
          <p className="chico texto-2">La app elige Entrada o Salida según tus registros de hoy.</p>

          <MarcoCamara
            video={camara.video}
            espejo
            guia={guia}
            textoEstado={camara.lista || estado.tipo !== 'listo' ? textoGuia : 'Abriendo la cámara…'}
            pie={guia === 'buscando' ? 'Buena luz, sin lentes oscuros ni cubrebocas' : null}
          />

          <div aria-live="polite" className="columna" style={{ gap: 12, paddingBottom: 8 }}>
            {estado.tipo === 'exito' ? (
              <Resultado
                icono={estado.enCola ? CloudCheck : CheckCircle2}
                tono={estado.enCola ? 'info' : 'exito'}
                titulo={estado.enCola ? `${etiquetaTipo(estado.registro)} guardada en el teléfono` : `${etiquetaTipo(estado.registro)} registrada a las ${estado.hora}`}
                mensaje={estado.enCola ? 'No hay conexión. Se subirá sola en cuanto vuelva la red.' : 'Listo, ya quedó en tu historial.'}
              >
                <Boton ancho onClick={volver}>
                  Listo
                </Boton>
              </Resultado>
            ) : estado.tipo === 'error' ? (
              <Resultado icono={CircleAlert} tono="peligro" titulo="No se registró la asistencia" mensaje={estado.mensaje}>
                <Boton ancho icono={RefreshCw} onClick={() => setEstado({ tipo: 'listo' })}>
                  Intentar de nuevo
                </Boton>
                <Boton ancho variante="secundario" onClick={volver}>
                  Volver
                </Boton>
              </Resultado>
            ) : (
              <>
                {info && (
                  <p className="fila texto-2" style={{ gap: 8 }}>
                    {(() => {
                      const I = info.configurada ? iconoModalidad(info.modalidad) : IconoSinConfigurar
                      return <I size={20} aria-hidden />
                    })()}
                    {/* M-13: no se valida ubicación; no insinuarlo. */}
                    {info.configurada ? `Modalidad de hoy: ${etiquetaModalidad(info.modalidad)}` : 'Modalidad sin configurar: se registra como presencial'}
                  </p>
                )}
                <Boton ancho icono={ScanFace} cargando={estado.tipo === 'procesando'} deshabilitado={!camara.lista} onClick={capturarYRegistrar}>
                  {estado.tipo === 'procesando'
                    ? 'Verificando…'
                    : info?.proximo === 'salida'
                      ? 'Registrar salida'
                      : info?.proximo === 'entrada'
                        ? 'Registrar entrada'
                        : 'Verificar y registrar'}
                </Boton>
                <p className="chico texto-2 fila" style={{ justifyContent: 'center', gap: 6 }}>
                  <Lock size={14} aria-hidden /> Se compara con tu biometría en el teléfono; la foto no se guarda.
                </p>
              </>
            )}
          </div>
        </>
      )}
    </Pantalla>
  )
}

async function registrar(foto: HTMLCanvasElement): Promise<EstadoRegistro> {
  const usuario = await requerirUsuario()
  const enrolamiento = await enrolamientoPropio(usuario.id)
  if (!enrolamiento) {
    return { tipo: 'error', mensaje: 'Todavía no tienes biometría facial registrada. Pide a tu ingeniero que te enrole.' }
  }

  const resultado = await procesar(foto)
  switch (resultado.tipo) {
    case 'sin_rostro':
      return { tipo: 'error', mensaje: 'No se detectó tu rostro. Intenta de nuevo con buena luz.' }
    case 'varios_rostros':
      return { tipo: 'error', mensaje: 'Se detectó más de un rostro en la foto.' }
    case 'demasiado_pequeno':
      return { tipo: 'error', mensaje: 'Acércate más a la cámara.' }
  }

  if (!dimensionesCompatibles(resultado.embedding, enrolamiento.embedding_vector)) {
    return { tipo: 'error', mensaje: 'Tu biometría se registró con otra versión de la app. Pide a tu ingeniero que te vuelva a enrolar.' }
  }
  if (!coincide(resultado.embedding, enrolamiento.embedding_vector)) {
    return {
      tipo: 'error',
      mensaje:
        enrolamiento.modelo === NOMBRE_MODELO_ANDROID
          ? 'El rostro no coincide con tu registro biométrico. Tu biometría se tomó con la app Android anterior; si sigue fallando, pide a tu ingeniero que te vuelva a enrolar desde la web.'
          : 'El rostro no coincide con tu registro biométrico.'
    }
  }

  const tipo = await asistencias.siguienteTipo(usuario.id)
  const { modalidad } = await modalidadDeHoy(usuario.id)
  const subida = await asistencias.registrar(usuario.id, tipo, modalidad)
  return { tipo: 'exito', registro: tipo, enCola: subida === 'en_cola', hora: hora(new Date()) }
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
