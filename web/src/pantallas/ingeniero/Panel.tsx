import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, CalendarCheck, ChevronRight, FileText, History, TrendingDown, Users } from 'lucide-react'
import { historialEquipo } from '../../datos/asistencias'
import { estadoVentana, progresoEquipo } from '../../datos/repositorios'
import { requerirUsuario, usuarioEnMemoria } from '../../datos/sesion'
import { diaCompleto, fechaHora, fechaLocal, hoy, sumarDias } from '../../lib/fechas'
import { horas, horasDeMeta, plural, primerNombre } from '../../lib/formato'
import { enRiesgo, horasEsperadasSemana } from '../../lib/modelos'
import {
  BarraProgreso,
  CuadriculaDos,
  Divisor,
  EncabezadoSeccion,
  IconoCircular,
  Pantalla,
  SegunEstado,
  Tarjeta,
  TarjetaIndicador,
  etiquetaTipo
} from '../../ui/componentes'
import { useAlReanudar, useCarga } from '../../ui/hooks'

/**
 * Una sola llamada para el equipo (progreso_equipo, M-09). "En riesgo" compara
 * contra los días laborales YA TERMINADOS; además: asistencias de hoy, ventana
 * SIASE y actividad reciente (si algo de eso falla, solo esa tarjeta se oculta).
 */
async function cargar() {
  await requerirUsuario()
  const equipo = await progresoEquipo()
  const [ventana, registros] = await Promise.all([
    estadoVentana().catch(() => null),
    historialEquipo(
      equipo.map((b) => b.becario_id),
      sumarDias(hoy(), -6),
      hoy()
    ).catch(() => null)
  ])
  const nombres = new Map(equipo.map((b) => [b.becario_id, b.nombre]))
  return {
    equipo,
    riesgo: equipo.filter(enRiesgo),
    ventana,
    conRegistroHoy: registros ? new Set(registros.filter((r) => fechaLocal(r.asistencia.ocurrido_en) === hoy()).map((r) => r.asistencia.becario_id)).size : null,
    actividad: (registros ?? []).slice(0, 6).map((r) => ({ ...r, nombre: nombres.get(r.asistencia.becario_id) ?? 'Becario' }))
  }
}

export default function PanelIngeniero() {
  const navegar = useNavigate()
  const { estado, recargar } = useCarga(cargar, [], 'No se pudo cargar el panel.')
  useAlReanudar(recargar)
  const nombre = usuarioEnMemoria()?.nombre

  return (
    <Pantalla titulo={nombre ? `Hola, Ing. ${primerNombre(nombre)}` : 'Panel del ingeniero'} subtitulo={diaCompleto(hoy())}>
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(d) => (
          <>
            <CuadriculaDos>
              <TarjetaIndicador valor={String(d.equipo.length)} etiqueta="Becarios activos" icono={Users} onClick={() => navegar('/ingeniero/becarios')} />
              <TarjetaIndicador
                valor={d.conRegistroHoy != null ? String(d.conRegistroHoy) : '–'}
                etiqueta="Asistieron hoy"
                icono={CalendarCheck}
                detalle={`de ${d.equipo.length}`}
                onClick={() => navegar('/ingeniero/asistencias')}
              />
              <TarjetaIndicador valor={String(d.riesgo.length)} etiqueta="Debajo de su meta" icono={TrendingDown} alerta={d.riesgo.length > 0} detalle="esta semana" />
              <TarjetaIndicador
                valor={!d.ventana ? '–' : d.ventana.abierta ? plural(d.ventana.dias_restantes, 'día', 'días') : 'Cerrada'}
                etiqueta="Ventana SIASE"
                icono={FileText}
                alerta={d.ventana?.abierta === true}
                detalle={d.ventana?.abierta ? 'para entregar' : null}
                onClick={() => navegar('/ingeniero/siase')}
              />
            </CuadriculaDos>

            {d.riesgo.length > 0 && (
              <Tarjeta>
                <EncabezadoSeccion titulo="Requieren atención" icono={TrendingDown} />
                <p className="chico texto-2">Van por debajo del 80 % de lo esperado según sus días laborales.</p>
                {d.riesgo.map((r, i) => {
                  const meta = r.meta_semanal ?? 0
                  const esperadas = horasEsperadasSemana(r)
                  return (
                    <div key={r.becario_id}>
                      {i > 0 && <Divisor />}
                      <div style={{ padding: '10px 0' }}>
                        <div className="fila">
                          <span className="titulo-s crece">{r.nombre}</span>
                          <span className="titulo-s" style={{ color: 'var(--alerta)' }}>
                            {horasDeMeta(r.horas_semana, meta)}
                          </span>
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <BarraProgreso progreso={meta > 0 ? r.horas_semana / meta : 0} ritmoEsperado={meta > 0 ? esperadas / meta : null} />
                        </div>
                        <p className="chico texto-2" style={{ marginTop: 4 }}>
                          Debería llevar {horas(esperadas)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </Tarjeta>
            )}

            <Tarjeta>
              <EncabezadoSeccion titulo="Actividad reciente" icono={History} textoAccion="Ver todo" onAccion={() => navegar('/ingeniero/asistencias')} />
              {d.actividad.length === 0 && <p className="texto-2" style={{ marginTop: 8 }}>Sin registros en los últimos 7 días.</p>}
              {d.actividad.map((e, i) => (
                <div key={`${e.asistencia.id}-${i}`} className="fila" style={{ padding: '8px 0' }}>
                  <span
                    style={{ width: 10, height: 10, borderRadius: 999, background: e.asistencia.tipo === 'entrada' ? 'var(--exito)' : 'var(--alerta)', flexShrink: 0 }}
                    aria-hidden
                  />
                  <div className="crece">
                    <p className="titulo-s recortar">{e.nombre}</p>
                    <p className="chico texto-2">
                      {etiquetaTipo(e.asistencia.tipo)} · {fechaHora(e.asistencia.ocurrido_en)}
                    </p>
                  </div>
                </div>
              ))}
            </Tarjeta>

            <Tarjeta onClick={() => navegar('/ingeniero/transferencias')} etiqueta="Transferencias">
              <div className="fila">
                <IconoCircular icono={ArrowLeftRight} tono="info" />
                <div className="crece">
                  <p className="titulo-s">Transferencias</p>
                  <p className="chico texto-2">Estado de tus solicitudes de cambio</p>
                </div>
                <ChevronRight color="var(--texto-2)" aria-hidden />
              </div>
            </Tarjeta>
          </>
        )}
      </SegunEstado>
    </Pantalla>
  )
}
