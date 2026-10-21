import { useState } from 'react'
import { HardHat, TrendingDown, UserX, Users } from 'lucide-react'
import { listarPorPerfil, progresoEquipo } from '../../datos/repositorios'
import { entero, plural, ritmoMes } from '../../lib/formato'
import { enRiesgo, horasEsperadasSemana, type ProgresoBecario } from '../../lib/modelos'
import { Badge, CuadriculaDos, Divisor, EncabezadoSeccion, EstadoVacio, FilaProgreso, Pantalla, Segmentado, SegunEstado, Tarjeta, TarjetaIndicador, useVolver } from '../../ui/componentes'
import { useAlReanudar, useCarga } from '../../ui/hooks'

/** Una sola llamada para todos los becarios activos (M-09), agrupados por ingeniero. */
async function cargar() {
  const [filas, ingenieros] = await Promise.all([progresoEquipo(), listarPorPerfil('ingeniero', true).catch(() => [])])
  return { filas, nombres: new Map(ingenieros.map((i) => [i.id, i.nombre])) }
}

export default function ReporteHorasGlobal() {
  const volver = useVolver('/admin/mas')
  const { estado, recargar } = useCarga(cargar, [], 'No se pudo cargar el reporte global.')
  useAlReanudar(recargar)
  const [periodo, setPeriodo] = useState(0)

  return (
    <Pantalla titulo="Reporte de horas" subtitulo="Todos los becarios activos" onVolver={volver}>
      <SegunEstado estado={estado} onReintentar={recargar}>
        {({ filas, nombres }) => {
          const grupos = new Map<string | null, ProgresoBecario[]>()
          for (const f of filas) grupos.set(f.ingeniero_id ?? null, [...(grupos.get(f.ingeniero_id ?? null) ?? []), f])
          const ordenados = [...grupos.entries()].sort(([a], [b]) =>
            a == null ? 1 : b == null ? -1 : (nombres.get(a) ?? '').localeCompare(nombres.get(b) ?? '')
          )
          const riesgo = filas.filter(enRiesgo).length
          return (
            <>
              <CuadriculaDos>
                <TarjetaIndicador valor={entero(filas.length)} etiqueta="Becarios supervisados" icono={Users} />
                <TarjetaIndicador valor={entero(riesgo)} etiqueta="Con ritmo bajo" icono={TrendingDown} alerta={riesgo > 0} detalle="esta semana" />
              </CuadriculaDos>
              <Segmentado opciones={['Semana', 'Mes', 'Semestre']} seleccionado={periodo} onSeleccionar={setPeriodo} etiqueta="Periodo" />
              {filas.length === 0 && <EstadoVacio titulo="Sin becarios activos" icono={Users} />}
              {ordenados.map(([ingenieroId, becarios]) => (
                <Tarjeta key={ingenieroId ?? 'sin'}>
                  <EncabezadoSeccion
                    titulo={ingenieroId == null ? 'Sin ingeniero asignado' : (nombres.get(ingenieroId) ?? 'Ingeniero')}
                    icono={ingenieroId == null ? UserX : HardHat}
                  />
                  <p className="chico texto-2">{plural(becarios.length, 'becario', 'becarios')}</p>
                  {[...becarios]
                    .sort((a, b) => a.nombre.localeCompare(b.nombre))
                    .map((b, i) => (
                      <div key={b.becario_id}>
                        {i > 0 && <Divisor />}
                        <div style={{ paddingTop: 10 }}>
                          <div className="fila">
                            <span className="titulo-s crece">{b.nombre}</span>
                            {enRiesgo(b) && <Badge texto="Ritmo bajo" tono="alerta" />}
                          </div>
                          {periodo === 0 ? (
                            <FilaProgreso
                              etiqueta="Semana"
                              horas={b.horas_semana}
                              meta={b.meta_semanal}
                              ritmoEsperado={b.meta_semanal && b.meta_semanal > 0 ? horasEsperadasSemana(b) / b.meta_semanal : null}
                            />
                          ) : periodo === 1 ? (
                            <FilaProgreso etiqueta="Mes" horas={b.horas_mes} meta={b.meta_mensual} ritmoEsperado={ritmoMes()} />
                          ) : (
                            <FilaProgreso etiqueta="Semestre" horas={b.horas_semestre} meta={b.meta_semestral} />
                          )}
                        </div>
                      </div>
                    ))}
                </Tarjeta>
              ))}
            </>
          )
        }}
      </SegunEstado>
    </Pantalla>
  )
}
