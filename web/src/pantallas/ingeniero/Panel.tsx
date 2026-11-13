import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { contarAnomalias, historialEquipo } from '../../datos/asistencias'
import { estadoVentana, progresoEquipo } from '../../datos/repositorios'
import { requerirUsuario } from '../../datos/sesion'
import { diaCompleto, fechaLocal, hoy } from '../../lib/fechas'
import { entero, numeroHoras, plural } from '../../lib/formato'
import { enRiesgo, horasEsperadasSemana, type ProgresoBecario } from '../../lib/modelos'
import { Avatar, BarraProgreso, EstadoVacio, Pantalla, SegunEstado, TarjetaIndicador } from '../../ui/componentes'
import { useAlReanudar, useCarga } from '../../ui/hooks'

/** Filas del equipo en el panel; el resto, en "Becarios". */
const MAXIMO_FILAS = 6

/**
 * Una sola llamada para el equipo (progreso_equipo, M-09). "Atrasados" compara
 * contra los días laborales YA TERMINADOS; además: quién vino hoy, ventana SIASE y
 * registros por revisar (si algo de eso falla, solo ese número se muestra como –).
 * La actividad reciente se quitó del panel: es lo mismo que la pestaña Asistencias.
 */
async function cargar() {
  await requerirUsuario()
  const equipo = await progresoEquipo()
  const [ventana, registrosHoy, porRevisar] = await Promise.all([
    estadoVentana().catch(() => null),
    historialEquipo(
      equipo.map((b) => b.becario_id),
      hoy(),
      hoy()
    ).catch(() => null),
    contarAnomalias().catch(() => null)
  ])
  return {
    equipo,
    riesgo: equipo.filter(enRiesgo),
    ventana,
    porRevisar,
    conRegistroHoy: registrosHoy ? new Set(registrosHoy.filter((r) => fechaLocal(r.asistencia.ocurrido_en) === hoy()).map((r) => r.asistencia.becario_id)).size : null
  }
}

export default function PanelIngeniero() {
  const navegar = useNavigate()
  const { estado, datos, recargar } = useCarga(cargar, [], 'No se pudo cargar el panel.')
  useAlReanudar(recargar)
  const fecha = diaCompleto(hoy()).toLowerCase()

  return (
    <Pantalla titulo="Mi equipo" subtitulo={datos ? `${plural(datos.equipo.length, 'becario', 'becarios')} · ${fecha}` : fecha}>
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(d) => {
          // Del más atrasado al más adelantado: los que necesitan atención quedan arriba.
          const orden = [...d.equipo].sort((a, b) => a.horas_semana - b.horas_semana)
          return (
            <>
              {(d.porRevisar ?? 0) > 0 && (
                <div className="fila rounded-lg bg-superficie py-3 pr-3 pl-4">
                  <span className="crece">
                    <span className="block font-medium">
                      {plural(d.porRevisar ?? 0, 'registro espera', 'registros esperan')} revisión
                    </span>
                    <span className="block text-[13px] text-texto-2">No suman horas hasta que los revises</span>
                  </span>
                  <Button className="h-10" onClick={() => navegar('/ingeniero/revisar')}>
                    Revisar
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-regla">
                <TarjetaIndicador
                  valor={d.conRegistroHoy != null ? entero(d.conRegistroHoy) : '–'}
                  detalle={`de ${entero(d.equipo.length)}`}
                  etiqueta="Vinieron hoy"
                  onClick={() => navegar('/ingeniero/asistencias')}
                />
                <TarjetaIndicador valor={entero(d.riesgo.length)} etiqueta="Atrasados" alerta={d.riesgo.length > 0} onClick={() => navegar('/ingeniero/becarios')} />
                <TarjetaIndicador
                  valor={!d.ventana ? '–' : d.ventana.abierta ? plural(Math.max(d.ventana.dias_restantes, 0), 'día', 'días') : 'Cerrada'}
                  etiqueta={d.ventana?.abierta ? 'Para el SIASE' : 'Ventana SIASE'}
                  alerta={d.ventana?.abierta === true}
                  onClick={() => navegar('/ingeniero/siase')}
                />
              </div>

              {d.equipo.length === 0 ? (
                <EstadoVacio titulo="Sin becarios asignados" mensaje="Cuando la coordinación te asigne becarios aparecerán aquí." />
              ) : (
                <section className="rounded-lg bg-superficie px-4 pt-3.5 pb-1.5" aria-label="Horas de la semana">
                  <div className="fila">
                    <h2 className="crece font-medium">Horas de la semana</h2>
                    <span className="text-xs text-texto-2">marca: lo esperado a hoy</span>
                  </div>
                  {orden.slice(0, MAXIMO_FILAS).map((b) => (
                    <FilaBecario key={b.becario_id} becario={b} onAbrir={() => navegar(`/ingeniero/becario/${b.becario_id}/asistencias`)} />
                  ))}
                  {d.equipo.length > MAXIMO_FILAS && (
                    <div className="flex justify-center border-t border-regla">
                      <Button variant="link" className="text-texto-2" onClick={() => navegar('/ingeniero/becarios')}>
                        Ver los {entero(d.equipo.length)}
                      </Button>
                    </div>
                  )}
                </section>
              )}

              <button type="button" className="fila w-full rounded-lg bg-superficie px-4 py-3 text-left" onClick={() => navegar('/ingeniero/transferencias')}>
                <span className="crece">
                  <span className="block font-medium">Transferencias</span>
                  <span className="block text-[13px] text-texto-2">Estado de tus solicitudes de cambio</span>
                </span>
                <ChevronRight className="size-4 text-texto-2" aria-hidden />
              </button>
            </>
          )
        }}
      </SegunEstado>
    </Pantalla>
  )
}

/** Avatar, nombre, horas de la semana (ámbar si va atrasado) y barra con la marca de lo esperado a hoy. */
function FilaBecario({ becario: b, onAbrir }: { becario: ProgresoBecario; onAbrir: () => void }) {
  const meta = b.meta_semanal ?? 0
  const atrasado = enRiesgo(b)
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="fila w-full border-t border-regla py-3 text-left first-of-type:border-t-0"
      aria-label={`${b.nombre}: ${numeroHoras(b.horas_semana)} horas esta semana${atrasado ? ', atrasado' : ''}`}
    >
      <Avatar nombre={b.nombre} tamano={32} />
      <span className="crece">
        <span className="fila gap-2">
          <span className="crece truncate">{b.nombre}</span>
          <span className={cn('text-[13px] whitespace-nowrap', atrasado ? 'font-medium text-alerta' : 'text-texto-2')}>{numeroHoras(b.horas_semana)} h</span>
        </span>
        <span className="mt-2 block">
          <BarraProgreso progreso={meta > 0 ? b.horas_semana / meta : 0} ritmoEsperado={meta > 0 ? horasEsperadasSemana(b) / meta : null} />
        </span>
      </span>
    </button>
  )
}
