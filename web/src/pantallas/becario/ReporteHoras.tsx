import { useState } from 'react'
import { TrendingDown, TrendingUp, Trophy } from 'lucide-react'
import { historialEntreFechas } from '../../datos/asistencias'
import { progresoDe, semanaConRespaldo } from '../../datos/repositorios'
import { requerirUsuario } from '../../datos/sesion'
import { diaSemana, hoy, inicialDia, lunesDe, mesActual, mesLargo, nombreDia, numeroDia, sumarDias, type Fecha } from '../../lib/fechas'
import { faltan, horas, numeroHoras, ritmoMes, ritmoSemana, vaAlRitmo } from '../../lib/formato'
import { horasPorDia, type ModalidadTrabajo } from '../../lib/modelos'
import {
  BarraProgreso,
  EncabezadoSeccion,
  IconoCircular,
  Pantalla,
  Segmentado,
  SegunEstado,
  Tarjeta,
  etiquetaModalidad,
  iconoModalidad
} from '../../ui/componentes'
import { useAlReanudar, useCarga } from '../../ui/hooks'

/** Un día de la cuadrícula L–D de la semana LOCAL en curso (A-15). modalidad null = no aplica / sin configurar. */
interface DiaReporte {
  fecha: Fecha
  horas: number
  modalidad: ModalidadTrabajo | null
  esHoy: boolean
  esFuturo: boolean
}

async function cargar() {
  const usuario = await requerirUsuario()
  const progreso = await progresoDe(usuario.id)
  const lunes = lunesDe()
  const [porDia, modalidades] = await Promise.all([
    historialEntreFechas(usuario.id, lunes, sumarDias(lunes, 6)).then(horasPorDia, () => new Map<Fecha, number>()),
    semanaConRespaldo(usuario.id).then(
      (dias) => new Map(dias.map((d) => [d.dia_semana, d.modalidad])),
      () => new Map<number, ModalidadTrabajo>()
    )
  ])
  const h = hoy()
  const semana: DiaReporte[] = Array.from({ length: 7 }, (_, i) => {
    const fecha = sumarDias(lunes, i)
    return {
      fecha,
      horas: porDia.get(fecha) ?? 0,
      modalidad: modalidades.get(diaSemana(fecha)) ?? null,
      esHoy: fecha === h,
      esFuturo: fecha > h
    }
  })
  return { progreso, semana }
}

export default function ReporteHoras() {
  const { estado, recargar } = useCarga(cargar, [], 'No se pudo cargar tu progreso.')
  useAlReanudar(recargar)
  const [periodo, setPeriodo] = useState(0)

  return (
    <Pantalla titulo="Mi reporte de horas" subtitulo="Tu avance contra las metas">
      <SegunEstado estado={estado} onReintentar={recargar}>
        {({ progreso: p, semana }) => (
          <>
            <Segmentado opciones={['Semana', 'Mes', 'Semestre']} seleccionado={periodo} onSeleccionar={setPeriodo} etiqueta="Periodo" />
            {periodo === 0 && (
              <>
                <CuadriculaSemana dias={semana} />
                <TarjetaTotal titulo="Total de la semana" horasHechas={p.horas_semana} meta={p.meta_semanal} ritmo={ritmoSemana()} />
                <TarjetaMeta titulo="Meta semanal" horasHechas={p.horas_semana} meta={p.meta_semanal} />
              </>
            )}
            {periodo === 1 && (
              <>
                <TarjetaTotal titulo={`Total de ${mesLargo(mesActual())}`} horasHechas={p.horas_mes} meta={p.meta_mensual} ritmo={ritmoMes()} />
                <TarjetaMeta titulo="Meta mensual" horasHechas={p.horas_mes} meta={p.meta_mensual} />
              </>
            )}
            {periodo === 2 && (
              <>
                <TarjetaTotal titulo="Total del semestre" horasHechas={p.horas_semestre} meta={p.meta_semestral} ritmo={null} />
                <TarjetaMeta titulo="Meta semestral" horasHechas={p.horas_semestre} meta={p.meta_semestral} />
              </>
            )}
            <Leyenda />
          </>
        )}
      </SegunEstado>
    </Pantalla>
  )
}

/** Cuadrícula L–D: horas del día e ícono de modalidad (A-15). */
function CuadriculaSemana({ dias }: { dias: DiaReporte[] }) {
  return (
    <Tarjeta>
      <EncabezadoSeccion titulo="Esta semana" />
      <div className="dias" style={{ marginTop: 8 }}>
        {dias.map((d) => {
          const I = iconoModalidad(d.modalidad)
          return (
            <div
              key={d.fecha}
              className={`dia${d.esHoy ? ' hoy' : ''}${d.esFuturo ? ' futuro' : ''}`}
              aria-label={`${nombreDia(diaSemana(d.fecha))} ${numeroDia(d.fecha)}: ${d.esFuturo ? 'por venir' : horas(d.horas)}, ${etiquetaModalidad(d.modalidad)}${d.esHoy ? ', hoy' : ''}`}
            >
              <span className="texto-2" style={{ fontWeight: 600 }}>
                {inicialDia(d.fecha)}
              </span>
              <span className="texto-2">{numeroDia(d.fecha)}</span>
              <span className="titulo-s tnum" style={{ color: d.horas > 0 ? 'var(--texto)' : 'var(--texto-2)', padding: '4px 0' }}>
                {d.esFuturo || d.horas === 0 ? '–' : numeroHoras(d.horas)}
              </span>
              <I size={18} color={d.modalidad ? 'var(--primario)' : 'var(--texto-2)'} aria-hidden />
            </div>
          )
        })}
      </div>
    </Tarjeta>
  )
}

function TarjetaTotal(props: { titulo: string; horasHechas: number; meta: number | null; ritmo: number | null }) {
  const { meta, ritmo } = props
  const progreso = meta != null && meta > 0 ? props.horasHechas / meta : 0
  const alRitmo = vaAlRitmo(progreso, ritmo)
  const Tendencia = alRitmo ? TrendingUp : TrendingDown
  return (
    <Tarjeta>
      <p className="texto-2">{props.titulo}</p>
      <p>
        <span className="numero-g">{numeroHoras(props.horasHechas)}</span>
        <span className="titulo-m texto-2"> {meta != null && meta > 0 ? `/ ${horas(meta)}` : 'h'}</span>
      </p>
      {meta != null && meta > 0 && (
        <>
          <div style={{ marginTop: 12 }}>
            <BarraProgreso progreso={progreso} ritmoEsperado={ritmo} altura={10} />
          </div>
          <p className="chico fila" style={{ gap: 6, marginTop: 8, color: alRitmo ? 'var(--exito)' : 'var(--alerta)' }}>
            <Tendencia size={18} aria-hidden />
            {progreso >= 1
              ? 'Meta cumplida'
              : ritmo == null
                ? `${Math.floor(progreso * 100)} % de la meta`
                : alRitmo
                  ? 'Vas al ritmo esperado'
                  : 'Vas por debajo del ritmo esperado'}
          </p>
        </>
      )}
    </Tarjeta>
  )
}

function TarjetaMeta(props: { titulo: string; horasHechas: number; meta: number | null }) {
  const { meta } = props
  return (
    <Tarjeta>
      <div className="fila">
        <IconoCircular icono={Trophy} tono="alerta" tamano={44} />
        <div className="crece">
          <p className="titulo-m">{meta != null ? `${props.titulo}: ${horas(meta)}` : `${props.titulo} sin configurar`}</p>
          <p className="texto-2">
            {meta == null || meta <= 0
              ? 'La coordinación todavía no define esta meta.'
              : props.horasHechas >= meta
                ? '¡Cumpliste la meta! Sigue así.'
                : `Te faltan ${horas(faltan(props.horasHechas, meta))}.`}
          </p>
        </div>
      </div>
    </Tarjeta>
  )
}

export function Leyenda() {
  return (
    <div className="fila chico texto-2" style={{ justifyContent: 'space-evenly', padding: '8px 0' }}>
      {(['presencial', 'home_office', null] as const).map((m) => {
        const I = iconoModalidad(m)
        return (
          <span key={m ?? 'na'} className="fila" style={{ gap: 4 }}>
            <I size={16} aria-hidden /> {etiquetaModalidad(m)}
          </span>
        )
      })}
    </div>
  )
}
