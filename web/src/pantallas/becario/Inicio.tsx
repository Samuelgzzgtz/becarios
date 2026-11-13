import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleAlert, CloudUpload, ScanFace, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import * as asistencias from '../../datos/asistencias'
import { enrolamientoPropio, estadoVentana, horasPorAprobar, jornadaMaximaHoras, modalidadDeHoy, progresoDe } from '../../datos/repositorios'
import { requerirUsuario, usuarioEnMemoria } from '../../datos/sesion'
import { mensajeAmigable } from '../../lib/errores'
import { diaCompleto, diaMesLargo, fechaDeTexto, hoy, lunesDe, mesActual, mesLargo, nombreDia, sumarDias, type Fecha } from '../../lib/fechas'
import { horas, numeroHoras, plural, primerNombre, ritmoSemana } from '../../lib/formato'
import { horasPorDia, type Anomalia, type EstadoVentanaSiase, type ModalidadTrabajo, type ProgresoHoras, type TipoAsistencia } from '../../lib/modelos'
import { AvisoBanner, Boton, Esqueleto, EstadoError, HorasDeMeta, Pantalla, etiquetaModalidad } from '../../ui/componentes'
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
  /** Entradas sin salida (anomalias_asistencia con el propio id); vacío si no se pudo consultar. */
  turnosAbiertos: Anomalia[]
  /** Horas del semestre que sumarán cuando se aprueben; 0 si no se pudo consultar. */
  porAprobar: number
  /** Horas por día de lunes a viernes de esta semana (igual que Mi reporte de horas); null si no se pudo consultar. */
  semana: Map<Fecha, number> | null
}

async function cargar(): Promise<DatosInicio> {
  const usuario = await requerirUsuario()
  if (navigator.onLine) await enrolamientoPropio(usuario.id).catch(() => undefined)
  // Primero se intenta subir lo que esté en cola, para que los números ya lo incluyan.
  if ((await asistencias.pendientesSinSubir(usuario.id)) > 0) await asistencias.sincronizarPendientes().catch(() => undefined)

  const lunes = lunesDe()
  const [progreso, datosHoy, ventana, turnosAbiertos, porAprobar, semana] = await Promise.all([
    progresoDe(usuario.id).then(
      (datos) => ({ ok: true as const, datos }),
      (e) => ({ ok: false as const, mensaje: mensajeAmigable(e, 'No se pudo cargar tu progreso.') })
    ),
    Promise.all([modalidadDeHoy(usuario.id), asistencias.siguienteTipo(usuario.id)]).then(
      ([m, proximo]) => ({ ok: true as const, datos: { modalidad: m.modalidad, configurada: m.configurada, proximo } }),
      (e) => ({ ok: false as const, mensaje: mensajeAmigable(e, 'No se pudo cargar la información de hoy.') })
    ),
    estadoVentana().catch(() => null),
    asistencias.anomalias(usuario.id, sumarDias(hoy(), -30)).then(
      (lista) => lista.filter((a) => a.tipo === 'turno_abierto'),
      () => [] as Anomalia[]
    ),
    horasPorAprobar(usuario.id).then((h) => h.horas_semestre, () => 0),
    Promise.all([asistencias.historialEntreFechas(usuario.id, lunes, sumarDias(lunes, 4)), jornadaMaximaHoras()]).then(
      ([h, tope]) => horasPorDia(h, tope),
      () => null
    )
  ])
  return {
    pendientes: await asistencias.pendientesSinSubir(usuario.id),
    rechazadas: await asistencias.rechazadasSinSubir(usuario.id),
    progreso,
    hoy: datosHoy,
    ventana,
    turnosAbiertos,
    porAprobar,
    semana
  }
}

export default function InicioBecario() {
  const navegar = useNavigate()
  const { estado, datos, recargar, actualizar } = useCarga(cargar, [], 'No se pudo identificar la sesión.')
  useAlReanudar(recargar)
  const [nombre] = useState(() => usuarioEnMemoria()?.nombre ?? '')

  // Deja en caché los archivos del reconocimiento facial mientras hay red, para poder registrar sin
  // conexión después. Solo los descarga: el motor se compila al abrir "Registrar asistencia".
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (navigator.onLine) void import('../../facial/rostro').then((m) => m.precargarArchivos()).catch(() => undefined)
    }, 2500)
    return () => window.clearTimeout(t)
  }, [])

  const hoyOk = datos?.hoy.ok ? datos.hoy.datos : null
  const lunes = lunesDe()
  // Los turnos sin salida de esta semana se marcan en la tira de días; los anteriores, con un aviso.
  const abiertosSemana = new Set((datos?.turnosAbiertos ?? []).filter((t) => t.fecha >= lunes).map((t) => t.fecha))
  const abiertosAntes = (datos?.turnosAbiertos ?? []).filter((t) => t.fecha < lunes)

  return (
    <Pantalla
      titulo={nombre ? `Hola, ${primerNombre(nombre)}` : 'Hola'}
      saludo
      subtitulo={diaCompleto(hoy()) + (hoyOk?.configurada ? ` · ${etiquetaModalidad(hoyOk.modalidad).toLowerCase()}` : '')}
    >
      {estado.tipo === 'error' && <EstadoError mensaje={estado.mensaje} onReintentar={recargar} />}

      <div className="columna gap-2">
        <Boton icono={ScanFace} ancho onClick={() => navegar('/becario/registrar')}>
          {hoyOk?.proximo === 'salida' ? 'Registrar salida' : hoyOk?.proximo === 'entrada' ? 'Registrar entrada' : 'Registrar asistencia'}
        </Boton>
        {hoyOk && !hoyOk.configurada && <p className="chico texto-2">Tu ingeniero no ha definido este día; se registrará como presencial.</p>}
      </div>

      {datos && !datos.hoy.ok && <AvisoBanner texto={datos.hoy.mensaje} tono="peligro" icono={CircleAlert} textoAccion="Reintentar" onAccion={recargar} />}

      {abiertosAntes.map((t) => (
        <AvisoBanner
          key={t.asistencia_id}
          titulo="Turno sin salida"
          texto={`Tu entrada del ${diaMesLargo(t.fecha)} no tiene salida. Pide a tu ingeniero que la agregue.`}
          tono="alerta"
          icono={TriangleAlert}
        />
      ))}

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

      {!datos ? (
        <section className="tarjeta columna gap-3" aria-label="Cargando tu semana">
          <Esqueleto ancho="55%" alto={30} />
          <Esqueleto ancho="45%" />
          <Esqueleto alto={84} />
        </section>
      ) : datos.progreso.ok ? (
        <>
          <PanelSemana progreso={datos.progreso.datos} porDia={datos.semana} abiertos={abiertosSemana} />
          <section className="rounded-lg bg-superficie px-4" aria-label="Avance del mes y del semestre">
            <FilaDato etiqueta={mesLargo(mesActual()).split(' ')[0]}>
              <HorasDeMeta horas={datos.progreso.datos.horas_mes} meta={datos.progreso.datos.meta_mensual} />
            </FilaDato>
            <FilaDato etiqueta="Semestre" detalle={datos.porAprobar >= 0.05 ? `${horas(datos.porAprobar)} por aprobar` : null}>
              <HorasDeMeta horas={datos.progreso.datos.horas_semestre} meta={datos.progreso.datos.meta_semestral} />
            </FilaDato>
            {datos.ventana && <FilaSiase ventana={datos.ventana} onAbrir={() => navegar('/becario/siase')} />}
          </section>
        </>
      ) : (
        <section className="tarjeta">
          <EstadoError mensaje={datos.progreso.mensaje} onReintentar={recargar} />
        </section>
      )}
    </Pantalla>
  )
}

/** Una fila del panel de avance: etiqueta (con una línea gris opcional) y su valor o acción a la derecha. */
function FilaDato(props: { etiqueta: string; detalle?: string | null; detalleAlerta?: boolean; children: React.ReactNode }) {
  return (
    <div className="fila min-h-12 border-regla py-2.5 [&+&]:border-t">
      <span className="crece">
        <span className="block">{props.etiqueta}</span>
        {props.detalle && <span className={cn('block text-[13px]', props.detalleAlerta ? 'text-alerta' : 'text-texto-2')}>{props.detalle}</span>}
      </span>
      {props.children}
    </div>
  )
}

function FilaSiase({ ventana, onAbrir }: { ventana: EstadoVentanaSiase; onAbrir: () => void }) {
  const apertura = fechaDeTexto(ventana.fecha_apertura)
  const cierre = fechaDeTexto(ventana.fecha_cierre)
  const detalle = ventana.abierta
    ? cierre && `Cierra el ${diaMesLargo(cierre)}${ventana.dias_restantes <= 0 ? ', hoy es el último día' : ''}`
    : apertura && apertura > hoy()
      ? `Abre el ${diaMesLargo(apertura)}`
      : 'Ventana cerrada'
  return (
    <FilaDato etiqueta="Reporte SIASE" detalle={detalle} detalleAlerta={ventana.abierta}>
      <Button variant="link" onClick={onAbrir}>
        {ventana.abierta ? 'Subir' : 'Ver'}
      </Button>
    </FilaDato>
  )
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']

/**
 * La semana del becario: el total como cifra grande, lo que ya debería llevar (días
 * laborales terminados, ritmoSemana) y una columna por día de lunes a viernes contra la
 * marca punteada de las horas diarias esperadas. Hoy va con contorno punteado y un día
 * con entrada sin salida, rayado en ámbar con la explicación debajo.
 */
function PanelSemana(props: { progreso: ProgresoHoras; porDia: Map<Fecha, number> | null; abiertos: Set<Fecha> }) {
  const { horas_semana: hechas, meta_semanal: meta } = props.progreso
  const diasTerminados = Math.round(ritmoSemana() * 5)
  const diaria = meta != null && meta > 0 ? meta / 5 : null
  const lunes = lunesDe()
  const h = hoy()
  const dias = DIAS.map((nombre, i) => {
    const fecha = sumarDias(lunes, i)
    return { nombre, fecha, horas: props.porDia?.get(fecha) ?? 0, esHoy: fecha === h, futuro: fecha > h, abierto: props.abiertos.has(fecha) }
  })
  const escala = Math.max(diaria ?? 0, ...dias.map((d) => d.horas), 1) * 1.25
  const abiertos = dias.filter((d) => d.abierto)
  const nombresAbiertos = abiertos.map((d) => `el ${nombreDia(DIAS.indexOf(d.nombre) + 1).toLowerCase()}`)

  return (
    <section className="tarjeta" aria-label="Tu semana">
      <p className="text-[32px] leading-none font-semibold tracking-[-0.02em]">
        {numeroHoras(hechas)} h
        <span className="text-base font-normal tracking-normal text-texto-2">{meta != null && meta > 0 ? ` de ${numeroHoras(meta)} esta semana` : ' esta semana'}</span>
      </p>
      {meta != null && meta > 0 && diasTerminados > 0 && (
        <p className="mt-1.5 text-texto-2">
          Al {nombreDia(diasTerminados).toLowerCase()} deberías llevar {horas((meta * diasTerminados) / 5)}
        </p>
      )}

      {props.porDia && (
        <div className="mt-[18px] grid grid-cols-5 gap-2">
          {dias.map((d) => (
            <div
              key={d.fecha}
              className="flex flex-col items-center gap-1.5"
              role="img"
              aria-label={`${nombreDia(DIAS.indexOf(d.nombre) + 1)}: ${d.futuro ? 'por venir' : d.abierto ? 'entrada sin salida' : horas(d.horas)}${d.esHoy ? ', hoy' : ''}`}
            >
              <span className={cn('h-[18px] text-xs font-medium', d.abierto && 'text-alerta', d.futuro && 'invisible')}>
                {d.abierto && d.horas === 0 ? '?' : d.esHoy && d.horas === 0 ? '–' : numeroHoras(d.horas)}
              </span>
              <div
                className={cn(
                  'relative h-16 w-full rounded-[4px]',
                  d.abierto ? 'rayado' : d.esHoy ? 'outline-[1.5px] -outline-offset-[1.5px] outline-control outline-dashed' : 'bg-regla'
                )}
              >
                {d.horas > 0 && <i className="absolute inset-x-0 bottom-0 rounded-[4px] bg-dato" style={{ height: `${(d.horas / escala) * 100}%` }} />}
                {diaria != null && (
                  <b className="absolute -inset-x-1 border-t-[1.5px] border-dashed border-marca-ritmo" style={{ bottom: `${(diaria / escala) * 100}%` }} />
                )}
              </div>
              <span className="text-xs text-texto-2">{d.nombre}</span>
            </div>
          ))}
        </div>
      )}

      {abiertos.length > 0 && (
        <p className="mt-3.5 flex gap-2 text-[13px] text-alerta">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {capitalizar(unir(nombresAbiertos))} {abiertos.length === 1 ? 'no tiene salida' : 'no tienen salida'}. Pide a tu ingeniero que{' '}
            {abiertos.length === 1 ? 'la agregue' : 'las agregue'} para que sumen esas horas.
          </span>
        </p>
      )}
    </section>
  )
}

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** "el lunes", "el lunes y el miércoles", "el lunes, el martes y el jueves". */
const unir = (partes: string[]) => (partes.length < 2 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`)
