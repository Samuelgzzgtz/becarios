import { useState } from 'react'
import { Ban, CheckCheck, ExternalLink, History, ListChecks, UserX } from 'lucide-react'
import { firmar, porFirmarAntesDe, reportesDelMes, urlParaVer } from '../../datos/repositorios'
import { requerirUsuario } from '../../datos/sesion'
import { mensajeAmigable } from '../../lib/errores'
import { fechaHora, mesActual, mesLargo, parsearMes, sumarMeses } from '../../lib/fechas'
import { plural } from '../../lib/formato'
import type { EstadoReporteSiase } from '../../lib/modelos'
import {
  Avatar,
  AvisoBanner,
  Badge,
  Boton,
  Dialogo,
  EncabezadoSeccion,
  EstadoVacio,
  Pantalla,
  SegunEstado,
  SelectorMes,
  Tarjeta,
  abrirUrl
} from '../../ui/componentes'
import { useAvisos } from '../../ui/avisos'
import { etiquetaSiase, iconoSiase, tonoSiase } from '../../ui/estadosVisuales'
import { useAlReanudar, useCarga } from '../../ui/hooks'

/** Acción que espera confirmación (M-16: excluir y firmar en lote no son de un toque). */
type AccionPendiente = { tipo: 'excluir'; id: string; nombre: string } | { tipo: 'todos'; ids: string[] }

export default function ReportesSiaseEquipo() {
  const avisos = useAvisos()
  const [mes, setMes] = useState(mesActual)
  const [procesando, setProcesando] = useState<Set<string>>(new Set())
  const [accion, setAccion] = useState<AccionPendiente | null>(null)

  const { estado, recargar } = useCarga(
    async () => {
      await requerirUsuario()
      const [delMes, anteriores] = await Promise.all([reportesDelMes(mes), porFirmarAntesDe(mes)])
      return { delMes, anteriores }
    },
    [mes],
    'No se pudieron cargar los reportes.'
  )
  useAlReanudar(recargar)

  async function ejecutar(ids: string[], nuevo: EstadoReporteSiase, textoExito: string | null) {
    if (ids.length === 0 || ids.some((i) => procesando.has(i))) return
    setProcesando((p) => new Set([...p, ...ids]))
    try {
      const cambiados = await firmar(ids, nuevo)
      if (cambiados === 0) avisos.info('Ese reporte ya había sido revisado.')
      else avisos.exito(textoExito ?? `${cambiados} reporte(s) confirmados`)
      recargar()
    } catch (e) {
      avisos.error(mensajeAmigable(e, 'No se pudo actualizar el reporte.'))
    } finally {
      setProcesando((p) => new Set([...p].filter((i) => !ids.includes(i))))
    }
  }

  const ver = (ruta: string) => abrirUrl(() => urlParaVer(ruta)).catch((e) => avisos.error(mensajeAmigable(e, 'No se pudo abrir el archivo.')))

  return (
    <Pantalla titulo="Reportes SIASE" subtitulo="Revisa y confirma las entregas de tu equipo">
      {accion?.tipo === 'excluir' && (
        <Dialogo
          titulo="Excluir reporte"
          mensaje={`${accion.nombre} quedará exento de entregar el reporte de este mes.`}
          textoConfirmar="Excluir"
          destructivo
          onConfirmar={() => {
            setAccion(null)
            void ejecutar([accion.id], 'excluido', `Reporte de ${accion.nombre} excluido`)
          }}
          onCancelar={() => setAccion(null)}
        />
      )}
      {accion?.tipo === 'todos' && (
        <Dialogo
          titulo="Confirmar reportes"
          mensaje={`Se confirmarán ${plural(accion.ids.length, 'reporte subido', 'reportes subidos')}. ¿Ya los revisaste?`}
          icono={CheckCheck}
          textoConfirmar={`Confirmar ${accion.ids.length}`}
          onConfirmar={() => {
            setAccion(null)
            void ejecutar(accion.ids, 'confirmado', null)
          }}
          onCancelar={() => setAccion(null)}
        />
      )}

      <SelectorMes nombre={mesLargo(mes)} puedeSiguiente={mes < mesActual()} onAnterior={() => setMes((m) => sumarMeses(m, -1))} onSiguiente={() => setMes((m) => sumarMeses(m, 1))} />

      <SegunEstado estado={estado} onReintentar={recargar}>
        {(d) => {
          const porRevisar = d.delMes.filter((r) => r.estado === 'subido' && r.reporte_id).map((r) => r.reporte_id!)
          return (
            <>
              {porRevisar.length > 0 && (
                <AvisoBanner
                  titulo={`${plural(porRevisar.length, 'reporte espera', 'reportes esperan')} tu revisión`}
                  texto="Abre cada archivo antes de confirmarlo."
                  tono="info"
                  icono={ListChecks}
                  textoAccion={porRevisar.length > 1 ? `Confirmar todos (${porRevisar.length})` : null}
                  onAccion={porRevisar.length > 1 && procesando.size === 0 ? () => setAccion({ tipo: 'todos', ids: porRevisar }) : null}
                />
              )}

              {d.anteriores.length > 0 && (
                <>
                  <EncabezadoSeccion titulo="Pendientes de meses anteriores" icono={History} />
                  {d.anteriores
                    .filter((p) => p.reporte.id)
                    .map((p) => {
                      const id = p.reporte.id!
                      return (
                        <Tarjeta key={`ant-${id}`}>
                          <FilaPersona nombre={p.becario?.nombre ?? 'Becario'} detalle={parsearMes(p.reporte.mes)}>
                            <Badge texto={etiquetaSiase[p.reporte.estado]} tono={tonoSiase[p.reporte.estado]} />
                          </FilaPersona>
                          <div className="envolver" style={{ marginTop: 12 }}>
                            {p.reporte.archivo_url && (
                              <Boton chico variante="secundario" icono={ExternalLink} onClick={() => ver(p.reporte.archivo_url!)}>
                                Ver reporte
                              </Boton>
                            )}
                            <Boton chico icono={ListChecks} cargando={procesando.has(id)} onClick={() => ejecutar([id], 'confirmado', 'Reporte confirmado')}>
                              Confirmar
                            </Boton>
                          </div>
                        </Tarjeta>
                      )
                    })}
                  <EncabezadoSeccion titulo={mesLargo(mes)} />
                </>
              )}

              {d.delMes.length === 0 && (
                <EstadoVacio titulo="No tienes becarios activos" mensaje="Cuando tengas becarios asignados verás aquí sus reportes." icono={UserX} />
              )}

              {d.delMes.map((r) => {
                const id = r.reporte_id
                const ocupado = id != null && procesando.has(id)
                const puedeRevisar = r.estado === 'subido' && id != null
                return (
                  <Tarjeta key={r.becario_id}>
                    <FilaPersona nombre={r.nombre} detalle={`Matrícula ${r.matricula}`}>
                      <Badge texto={etiquetaSiase[r.estado]} tono={tonoSiase[r.estado]} icono={iconoSiase[r.estado]} />
                    </FilaPersona>
                    {r.fecha_firma && <p className="chico texto-2" style={{ marginTop: 8 }}>Confirmado el {fechaHora(r.fecha_firma)}</p>}
                    {(r.archivo_ruta || puedeRevisar) && (
                      <div className="envolver" style={{ marginTop: 12 }}>
                        {r.archivo_ruta && (
                          <Boton chico variante="secundario" icono={ExternalLink} onClick={() => ver(r.archivo_ruta!)}>
                            Ver reporte
                          </Boton>
                        )}
                        {puedeRevisar && (
                          <>
                            <Boton chico icono={ListChecks} cargando={ocupado} onClick={() => ejecutar([id!], 'confirmado', 'Reporte confirmado')}>
                              Confirmar
                            </Boton>
                            <Boton chico variante="secundario" icono={Ban} deshabilitado={ocupado} onClick={() => setAccion({ tipo: 'excluir', id: id!, nombre: r.nombre })}>
                              Excluir
                            </Boton>
                          </>
                        )}
                      </div>
                    )}
                  </Tarjeta>
                )
              })}
            </>
          )
        }}
      </SegunEstado>
    </Pantalla>
  )
}

function FilaPersona(props: { nombre: string; detalle: string; children: React.ReactNode }) {
  return (
    <div className="fila">
      <Avatar nombre={props.nombre} tamano={40} />
      <div className="crece">
        <p className="titulo-s recortar">{props.nombre}</p>
        <p className="chico texto-2">{props.detalle}</p>
      </div>
      {props.children}
    </div>
  )
}
