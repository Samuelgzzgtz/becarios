import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, CircleAlert, CloudUpload, FileText, LineChart, ScanFace } from 'lucide-react'
import * as asistencias from '../../datos/asistencias'
import { estadoVentana, modalidadDeHoy, progresoDe } from '../../datos/repositorios'
import { requerirUsuario, usuarioEnMemoria } from '../../datos/sesion'
import { prepararMotor } from '../../facial/rostro'
import { mensajeAmigable } from '../../lib/errores'
import { diaCompleto, diaMesLargo, fechaDeTexto, hoy } from '../../lib/fechas'
import { plural, primerNombre, ritmoMes, ritmoSemana } from '../../lib/formato'
import type { EstadoVentanaSiase, ModalidadTrabajo, ProgresoHoras, TipoAsistencia } from '../../lib/modelos'
import {
  AvisoBanner,
  Badge,
  Boton,
  EncabezadoSeccion,
  Esqueleto,
  EstadoError,
  FilaProgreso,
  IconoCircular,
  IconoSinConfigurar,
  Pantalla,
  Tarjeta,
  etiquetaModalidad,
  iconoModalidad
} from '../../ui/componentes'
import { useAlReanudar, useCarga } from '../../ui/hooks'

interface Hoy {
  modalidad: ModalidadTrabajo
  configurada: boolean
  proximo: TipoAsistencia
}

interface DatosInicio {
  pendientes: number
  rechazadas: number
  progreso: { ok: true; datos: ProgresoHoras } | { ok: false; mensaje: string }
  hoy: { ok: true; datos: Hoy } | { ok: false; mensaje: string }
  ventana: EstadoVentanaSiase | null
}

async function cargar(): Promise<DatosInicio> {
  const usuario = await requerirUsuario()
  // Primero se intenta subir lo que esté en cola, para que los números ya lo incluyan.
  if ((await asistencias.pendientesSinSubir(usuario.id)) > 0) await asistencias.sincronizarPendientes().catch(() => undefined)

  const [progreso, datosHoy, ventana] = await Promise.all([
    progresoDe(usuario.id).then(
      (datos) => ({ ok: true as const, datos }),
      (e) => ({ ok: false as const, mensaje: mensajeAmigable(e, 'No se pudo cargar tu progreso.') })
    ),
    Promise.all([modalidadDeHoy(usuario.id), asistencias.siguienteTipo(usuario.id)]).then(
      ([m, proximo]) => ({ ok: true as const, datos: { modalidad: m.modalidad, configurada: m.configurada, proximo } }),
      (e) => ({ ok: false as const, mensaje: mensajeAmigable(e, 'No se pudo cargar la información de hoy.') })
    ),
    estadoVentana().catch(() => null)
  ])
  return {
    pendientes: await asistencias.pendientesSinSubir(usuario.id),
    rechazadas: await asistencias.rechazadasSinSubir(usuario.id),
    progreso,
    hoy: datosHoy,
    ventana
  }
}

export default function InicioBecario() {
  const navegar = useNavigate()
  const { estado, datos, recargar, actualizar } = useCarga(cargar, [], 'No se pudo identificar la sesión.')
  useAlReanudar(recargar)
  const [nombre] = useState(() => usuarioEnMemoria()?.nombre ?? '')

  // Baja (y deja en caché) el reconocimiento facial mientras hay red, para poder registrar sin conexión después.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (navigator.onLine) void prepararMotor().catch(() => undefined)
    }, 2500)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <Pantalla titulo={nombre ? `Hola, ${primerNombre(nombre)}` : 'Hola'} subtitulo={diaCompleto(hoy())}>
      {estado.tipo === 'error' && <EstadoError mensaje={estado.mensaje} onReintentar={recargar} />}

      <TarjetaHoy datos={datos?.hoy} onRegistrar={() => navegar('/becario/registrar')} onReintentar={recargar} />

      {datos && datos.pendientes > 0 && (
        <AvisoBanner
          titulo={`Sin subir: ${plural(datos.pendientes, 'registro', 'registros')}`}
          texto="Están guardados en tu teléfono y se suben solos cuando haya conexión."
          tono="info"
          icono={CloudUpload}
        />
      )}

      {datos && datos.rechazadas > 0 && (
        <AvisoBanner
          titulo={`El servidor rechazó ${plural(datos.rechazadas, 'registro', 'registros')}`}
          texto="Se guardaron sin conexión y no se pudieron subir. Revísalos y avisa a tu ingeniero si hace falta corregirlos."
          tono="peligro"
          icono={CircleAlert}
          textoAccion="Ver registros"
          onAccion={() => navegar('/becario/registros')}
          textoAccionSecundaria="Descartar"
          onAccionSecundaria={async () => {
            const u = usuarioEnMemoria()
            if (u) await asistencias.descartarRechazadas(u.id)
            actualizar((d) => ({ ...d, rechazadas: 0 }))
          }}
        />
      )}

      <Tarjeta>
        <EncabezadoSeccion titulo="Progreso de horas" icono={LineChart} textoAccion="Detalle" onAccion={() => navegar('/becario/horas')} />
        {!datos ? (
          <div className="columna" style={{ gap: 10, marginTop: 8 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="columna" style={{ gap: 6 }}>
                <Esqueleto ancho="50%" />
                <Esqueleto alto={8} />
              </div>
            ))}
          </div>
        ) : datos.progreso.ok ? (
          <>
            <FilaProgreso etiqueta="Semana" horas={datos.progreso.datos.horas_semana} meta={datos.progreso.datos.meta_semanal} ritmoEsperado={ritmoSemana()} />
            <FilaProgreso etiqueta="Mes" horas={datos.progreso.datos.horas_mes} meta={datos.progreso.datos.meta_mensual} ritmoEsperado={ritmoMes()} />
            <FilaProgreso etiqueta="Semestre" horas={datos.progreso.datos.horas_semestre} meta={datos.progreso.datos.meta_semestral} />
            <p className="chico texto-2">La marca en la barra indica dónde deberías ir a estas alturas.</p>
          </>
        ) : (
          <EstadoError mensaje={datos.progreso.mensaje} onReintentar={recargar} />
        )}
      </Tarjeta>

      {datos?.ventana && <TarjetaSiase ventana={datos.ventana} onAbrir={() => navegar('/becario/siase')} />}
    </Pantalla>
  )
}

function TarjetaHoy(props: { datos: DatosInicio['hoy'] | undefined; onRegistrar: () => void; onReintentar: () => void }) {
  const hoyOk = props.datos?.ok ? props.datos.datos : null
  return (
    <Tarjeta>
      <EncabezadoSeccion titulo="Hoy" />
      {hoyOk ? (
        <>
          <div className="fila" style={{ marginTop: 8 }}>
            <IconoCircular
              icono={hoyOk.configurada ? iconoModalidad(hoyOk.modalidad) : IconoSinConfigurar}
              tono={hoyOk.configurada ? 'exito' : 'neutro'}
              tamano={48}
            />
            <div className="crece">
              <p className="titulo-m">{hoyOk.configurada ? etiquetaModalidad(hoyOk.modalidad) : 'Modalidad sin configurar'}</p>
              <p className="texto-2">{hoyOk.proximo === 'entrada' ? 'Aún no registras tu entrada' : 'Entrada registrada · falta tu salida'}</p>
            </div>
            <Badge texto={hoyOk.proximo === 'entrada' ? 'Toca entrada' : 'Toca salida'} tono={hoyOk.proximo === 'entrada' ? 'exito' : 'alerta'} />
          </div>
          {!hoyOk.configurada && (
            <p className="chico texto-2" style={{ marginTop: 8 }}>
              Tu ingeniero no ha definido este día; se registrará como presencial.
            </p>
          )}
        </>
      ) : props.datos && !props.datos.ok ? (
        <EstadoError mensaje={props.datos.mensaje} onReintentar={props.onReintentar} />
      ) : (
        <div className="columna" style={{ marginTop: 8 }}>
          <Esqueleto ancho="60%" alto={20} />
          <Esqueleto ancho="40%" />
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <Boton icono={ScanFace} ancho onClick={props.onRegistrar}>
          {hoyOk?.proximo === 'salida' ? 'Registrar salida' : hoyOk?.proximo === 'entrada' ? 'Registrar entrada' : 'Registrar asistencia'}
        </Boton>
      </div>
    </Tarjeta>
  )
}

function TarjetaSiase({ ventana, onAbrir }: { ventana: EstadoVentanaSiase; onAbrir: () => void }) {
  const apertura = fechaDeTexto(ventana.fecha_apertura)
  const cierre = fechaDeTexto(ventana.fecha_cierre)
  return (
    <Tarjeta onClick={onAbrir} etiqueta="Reporte mensual SIASE">
      <div className="fila">
        <IconoCircular icono={FileText} tono={ventana.abierta ? 'alerta' : 'neutro'} />
        <div className="crece">
          <p className="titulo-m">Reporte mensual SIASE</p>
          {apertura && cierre && (
            <p className="chico texto-2">
              Del {diaMesLargo(apertura)} al {diaMesLargo(cierre)}
            </p>
          )}
        </div>
        <ChevronRight color="var(--texto-2)" aria-hidden />
      </div>
      <div style={{ marginTop: 12 }}>
        <Badge
          texto={
            ventana.abierta
              ? `Ventana abierta · ${ventana.dias_restantes <= 0 ? 'último día' : `quedan ${plural(ventana.dias_restantes, 'día', 'días')}`}`
              : 'Ventana cerrada'
          }
          tono={ventana.abierta ? 'alerta' : 'neutro'}
        />
      </div>
    </Tarjeta>
  )
}
