import { useState } from 'react'
import { CalendarRange, CircleAlert, CloudOff, ScanFace, Trash2, UserCheck, X } from 'lucide-react'
import { diaCompleto, fechaCorta, fechaLocal, hoy, hora, lunesDe, parsear, sumarDias, diaMes, type Fecha } from '../../lib/fechas'
import { horas as formatoHoras } from '../../lib/formato'
import { horasPorDia, totalHoras, type AsistenciaUi } from '../../lib/modelos'
import {
  Badge,
  BotonIcono,
  CampoTexto,
  Chip,
  Dialogo,
  IconoCircular,
  Tarjeta,
  etiquetaModalidad,
  etiquetaTipo,
  iconoModalidad,
  iconoTipo,
  tonoTipo
} from '../../ui/componentes'

/** Rango de fechas LOCALES, ambas inclusivas. */
export interface FiltroFechas {
  desde: Fecha
  hasta: Fecha
}

export const semanaActual = (): FiltroFechas => ({ desde: lunesDe(), hasta: hoy() })
export const semanaPasada = (): FiltroFechas => {
  const lunes = sumarDias(lunesDe(), -7)
  return { desde: lunes, hasta: sumarDias(lunes, 6) }
}

/**
 * Tarjeta de un registro: ícono y badge Entrada (verde) / Salida (ámbar), hora
 * grande, modalidad y cómo se verificó; "Sin subir" o el rechazo si sigue en el
 * teléfono (A-14, M-03).
 */
export function TarjetaAsistencia(props: { item: AsistenciaUi; nombreBecario?: string | null; onEliminar?: () => void }) {
  const a = props.item.asistencia
  const instante = parsear(a.ocurrido_en)
  const h = instante ? hora(instante) : '—'
  const ModalidadI = iconoModalidad(a.modalidad)
  const Verificacion = a.verificado_por ? UserCheck : ScanFace
  return (
    <Tarjeta>
      <div className="fila">
        <IconoCircular icono={iconoTipo(a.tipo)} tono={tonoTipo(a.tipo)} tamano={44} />
        <div className="crece columna" style={{ gap: 2 }}>
          {props.nombreBecario && <p className="titulo-s recortar">{props.nombreBecario}</p>}
          <div className="fila" style={{ gap: 8 }}>
            <span className="numero-m">{h}</span>
            <Badge texto={etiquetaTipo(a.tipo)} tono={tonoTipo(a.tipo)} />
          </div>
          <p className="chico texto-2 fila" style={{ gap: 4, flexWrap: 'wrap' }}>
            <ModalidadI size={15} aria-hidden /> {etiquetaModalidad(a.modalidad)} ·
            <Verificacion size={15} aria-hidden /> {a.verificado_por ? 'Registro manual' : 'Verificación facial'}
          </p>
          {props.item.rechazo ? (
            <p className="chico fila" style={{ gap: 4, color: 'var(--peligro)' }}>
              <CircleAlert size={15} aria-hidden /> No se subió: {props.item.rechazo}
            </p>
          ) : props.item.sinSubir ? (
            <Badge texto="Sin subir · se sube al haber conexión" tono="info" icono={CloudOff} />
          ) : null}
        </div>
        {props.onEliminar && a.id && !props.item.sinSubir && (
          <BotonIcono icono={Trash2} etiqueta={`Eliminar registro de las ${h}`} onClick={props.onEliminar} />
        )}
      </div>
    </Tarjeta>
  )
}

function etiquetaDia(f: Fecha | null): string {
  if (!f) return 'Sin fecha'
  const h = hoy()
  if (f === h) return `Hoy · ${fechaCorta(f)}`
  if (f === sumarDias(h, -1)) return `Ayer · ${fechaCorta(f)}`
  return diaCompleto(f)
}

/** Lista agrupada por día local, con el total de horas trabajadas de ese día (mismo cálculo que el servidor). */
export function AsistenciasPorDia(props: {
  lista: AsistenciaUi[]
  nombreDe?: (item: AsistenciaUi) => string | null | undefined
  agruparPorBecario?: boolean
  onEliminar?: (item: AsistenciaUi) => void
}) {
  const grupos = new Map<string, AsistenciaUi[]>()
  for (const item of props.lista) {
    const dia = fechaLocal(item.asistencia.ocurrido_en) ?? ''
    grupos.set(dia, [...(grupos.get(dia) ?? []), item])
  }
  return (
    <>
      {[...grupos.entries()].map(([dia, delDia]) => {
        let horasDia: number
        if (props.agruparPorBecario) {
          const porBecario = new Map<string, AsistenciaUi[]>()
          for (const i of delDia) porBecario.set(i.asistencia.becario_id, [...(porBecario.get(i.asistencia.becario_id) ?? []), i])
          horasDia = [...porBecario.values()].reduce((s, g) => s + totalHoras(g.map((i) => i.asistencia)), 0)
        } else {
          horasDia = [...horasPorDia(delDia.map((i) => i.asistencia)).values()].reduce((s, x) => s + x, 0)
        }
        return (
          <section key={dia || 'sin-fecha'} className="columna" style={{ gap: 8 }}>
            <div className="fila" style={{ paddingTop: 8 }}>
              <h3 className="titulo-s crece">{etiquetaDia(dia || null)}</h3>
              {horasDia > 0 && <span className="chico texto-2">{formatoHoras(horasDia)} trabajadas</span>}
            </div>
            {delDia.map((item, i) => (
              <TarjetaAsistencia
                key={`${item.asistencia.id ?? item.asistencia.ocurrido_en}-${item.asistencia.becario_id}-${item.sinSubir ? 1 : 0}-${i}`}
                item={item}
                nombreBecario={props.nombreDe?.(item)}
                onEliminar={props.onEliminar ? () => props.onEliminar!(item) : undefined}
              />
            ))}
          </section>
        )
      })}
    </>
  )
}

/** Atajos de fecha + rango elegido. Muestra el rango activo con botón para quitarlo. */
export function FiltrosFecha(props: {
  filtro: FiltroFechas | null
  onFiltro: (f: FiltroFechas) => void
  conSemanaPasada?: boolean
  onLimpiar?: (() => void) | null
}) {
  const [eligiendo, setEligiendo] = useState(false)
  const { filtro } = props
  const actual = semanaActual()
  const pasada = semanaPasada()
  const esActual = filtro?.desde === actual.desde && filtro?.hasta === actual.hasta
  const esPasada = filtro?.desde === pasada.desde && filtro?.hasta === pasada.hasta
  const esRango = filtro != null && !esActual && !esPasada
  return (
    <div className="columna" style={{ gap: 6 }}>
      <div className="chips">
        {props.onLimpiar && <Chip texto="Recientes" activo={filtro == null} onClick={props.onLimpiar} />}
        <Chip texto="Esta semana" activo={esActual} onClick={() => props.onFiltro(actual)} />
        {props.conSemanaPasada && <Chip texto="Semana pasada" activo={esPasada} onClick={() => props.onFiltro(pasada)} />}
        <Chip
          texto={esRango && filtro ? `${diaMes(filtro.desde)} – ${diaMes(filtro.hasta)}` : 'Elegir fechas'}
          activo={esRango}
          icono={CalendarRange}
          onClick={() => setEligiendo(true)}
        />
      </div>
      {filtro && (
        <div className="fila">
          <span className="chico texto-2 crece">
            Del {fechaCorta(filtro.desde)} al {fechaCorta(filtro.hasta)}
          </span>
          {props.onLimpiar && <BotonIcono icono={X} etiqueta="Quitar filtro de fechas" onClick={props.onLimpiar} />}
        </div>
      )}
      {eligiendo && (
        <DialogoRango
          inicial={filtro}
          onConfirmar={(f) => {
            setEligiendo(false)
            props.onFiltro(f)
          }}
          onCancelar={() => setEligiendo(false)}
        />
      )}
    </div>
  )
}

function DialogoRango(props: { inicial: FiltroFechas | null; onConfirmar: (f: FiltroFechas) => void; onCancelar: () => void }) {
  const max = hoy()
  const [desde, setDesde] = useState(props.inicial?.desde ?? lunesDe())
  const [hasta, setHasta] = useState(props.inicial?.hasta ?? max)
  const error = desde && hasta && hasta < desde ? 'Debe ser igual o posterior a "Desde"' : null
  return (
    <Dialogo
      titulo="Elegir fechas"
      mensaje="Muestra los registros entre estas dos fechas (ambas incluidas)."
      icono={CalendarRange}
      textoConfirmar="Aplicar"
      confirmarHabilitado={!!desde && !!hasta && !error}
      onConfirmar={() => props.onConfirmar({ desde, hasta })}
      onCancelar={props.onCancelar}
    >
      <CampoTexto etiqueta="Desde" tipo="date" valor={desde} onCambio={setDesde} max={max} />
      <CampoTexto etiqueta="Hasta (incluido)" tipo="date" valor={hasta} onCambio={setHasta} min={desde} max={max} error={error} />
    </Dialogo>
  )
}
