import { useState } from 'react'
import { ClipboardCheck, ExternalLink, History, Inbox, PenLine } from 'lucide-react'
import { firmar, porFirmarAntesDe, reportesDelMes, urlParaVer } from '../../datos/repositorios'
import { mensajeAmigable } from '../../lib/errores'
import { mesActual, mesLargo, parsearMes, sumarMeses } from '../../lib/fechas'
import { plural } from '../../lib/formato'
import { AvisoBanner, Badge, Boton, BotonIcono, Chip, Dialogo, EncabezadoSeccion, EstadoVacio, Pantalla, SegunEstado, SelectorMes, Tarjeta, abrirUrl, useVolver } from '../../ui/componentes'
import { useAvisos } from '../../ui/avisos'
import { etiquetaSiase, tonoSiase } from '../../ui/estadosVisuales'
import { useAlReanudar, useCarga } from '../../ui/hooks'

/** Firma en lote de los reportes del mes, con su estado EFECTIVO (A-04, M-04, M-16). */
export default function FirmasSiase() {
  const volver = useVolver('/admin/mas')
  const avisos = useAvisos()
  const [mes, setMes] = useState(mesActual)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [firmando, setFirmando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  const { estado, datos, recargar } = useCarga(
    async () => {
      const [filas, anteriores] = await Promise.all([reportesDelMes(mes), porFirmarAntesDe(mes)])
      setSeleccion(new Set())
      return { filas, anteriores }
    },
    [mes],
    'No se pudieron cargar los reportes.'
  )
  useAlReanudar(() => !firmando && recargar())

  const firmables = (datos?.filas ?? []).filter((f) => f.estado === 'subido' && f.reporte_id)
  const seleccionados = firmables.filter((f) => seleccion.has(f.reporte_id!)).map((f) => f.reporte_id!)

  /** El resultado se informa siempre (A-08). */
  async function ejecutarFirma(ids: string[]) {
    setFirmando(true)
    try {
      const n = await firmar(ids)
      if (n < ids.length) avisos.info(`Se firmaron ${n} de ${ids.length}; los demás ya habían sido revisados.`)
      else avisos.exito(`${n} reporte(s) firmados`)
    } catch (e) {
      avisos.error(mensajeAmigable(e, 'No se pudieron firmar los reportes.'))
    } finally {
      setFirmando(false)
      recargar()
    }
  }

  const alternar = (id: string) =>
    setSeleccion((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const ver = (ruta: string) => abrirUrl(() => urlParaVer(ruta)).catch((e) => avisos.error(mensajeAmigable(e, 'No se pudo abrir el archivo.')))

  return (
    <Pantalla
      titulo="Firmas SIASE"
      subtitulo="Reportes mensuales de todos los becarios"
      onVolver={volver}
      barraAccion={
        firmables.length > 0 && (
          <Boton
            ancho
            icono={PenLine}
            cargando={firmando}
            deshabilitado={seleccionados.length === 0}
            onClick={() => (seleccionados.length === 0 ? avisos.info('Selecciona al menos un reporte subido para firmar.') : setConfirmando(true))}
          >
            {seleccionados.length === 0 ? 'Selecciona reportes para firmar' : `Firmar ${seleccionados.length}`}
          </Boton>
        )
      }
    >
      {confirmando && (
        <Dialogo
          titulo="Firmar reportes"
          mensaje={`Se firmarán ${plural(seleccionados.length, 'reporte', 'reportes')} de ${mesLargo(mes)}.`}
          icono={PenLine}
          textoConfirmar={`Firmar ${seleccionados.length}`}
          onConfirmar={() => {
            setConfirmando(false)
            void ejecutarFirma(seleccionados)
          }}
          onCancelar={() => setConfirmando(false)}
        />
      )}
      <SelectorMes nombre={mesLargo(mes)} puedeSiguiente={mes < mesActual()} onAnterior={() => setMes((m) => sumarMeses(m, -1))} onSiguiente={() => setMes((m) => sumarMeses(m, 1))} />

      <SegunEstado estado={estado} onReintentar={recargar}>
        {(d) => {
          const filas = soloPendientes ? d.filas.filter((f) => f.estado === 'subido' && f.reporte_id) : d.filas
          const todos = firmables.length > 0 && seleccionados.length === firmables.length
          return (
            <>
              {firmables.length > 0 && (
                <AvisoBanner
                  titulo={`Hay ${plural(firmables.length, 'reporte listo', 'reportes listos')} para firmar`}
                  texto='Toca cada fila para seleccionarla o usa "Seleccionar todos".'
                  tono="exito"
                  icono={ClipboardCheck}
                />
              )}
              <div className="fila">
                {firmables.length > 0 ? (
                  <label className="fila crece" style={{ gap: 8, cursor: 'pointer', minHeight: 44 }}>
                    <input
                      type="checkbox"
                      className="casilla"
                      checked={todos}
                      ref={(el) => {
                        if (el) el.indeterminate = seleccionados.length > 0 && !todos
                      }}
                      disabled={firmando}
                      onChange={() => setSeleccion(todos ? new Set() : new Set(firmables.map((f) => f.reporte_id!)))}
                    />
                    <span className="titulo-s">Seleccionar todos ({firmables.length})</span>
                  </label>
                ) : (
                  <span className="crece" />
                )}
                <Chip texto="Solo por firmar" activo={soloPendientes} onClick={() => setSoloPendientes((v) => !v)} />
              </div>

              {d.anteriores.length > 0 && (
                <>
                  <EncabezadoSeccion titulo="Pendientes de meses anteriores" icono={History} />
                  {d.anteriores
                    .filter((p) => p.reporte.id)
                    .map((p) => (
                      <Tarjeta key={`ant-${p.reporte.id}`}>
                        <div className="fila">
                          <div className="crece">
                            <p className="titulo-s">{p.becario?.nombre ?? 'Becario'}</p>
                            <p className="chico texto-2">{parsearMes(p.reporte.mes)}</p>
                          </div>
                          {p.reporte.archivo_url && (
                            <BotonIcono icono={ExternalLink} etiqueta={`Ver reporte de ${p.becario?.nombre ?? 'becario'}`} onClick={() => ver(p.reporte.archivo_url!)} />
                          )}
                          <Boton chico variante="secundario" icono={PenLine} deshabilitado={firmando} onClick={() => ejecutarFirma([p.reporte.id!])}>
                            Firmar
                          </Boton>
                        </div>
                      </Tarjeta>
                    ))}
                  <EncabezadoSeccion titulo={mesLargo(mes)} />
                </>
              )}

              {filas.length === 0 && (
                <EstadoVacio
                  titulo={soloPendientes ? 'No hay reportes por firmar' : 'No hay becarios activos'}
                  mensaje={soloPendientes ? `Todo lo entregado en ${mesLargo(mes)} ya está revisado.` : null}
                  icono={Inbox}
                />
              )}
              {filas.map((f) => {
                const firmable = f.estado === 'subido' && !!f.reporte_id
                const elegido = firmable && seleccion.has(f.reporte_id!)
                return (
                  <div key={f.becario_id} className={`tarjeta${elegido ? ' seleccionada' : ''}`} style={{ padding: '6px 6px 6px 12px' }}>
                    <div className="fila">
                      <label className="fila crece" style={{ gap: 12, cursor: firmable ? 'pointer' : 'default', minHeight: 48 }}>
                        <input type="checkbox" className="casilla" checked={elegido} disabled={!firmable || firmando} onChange={() => alternar(f.reporte_id!)} />
                        <span className="crece" style={{ minWidth: 0 }}>
                          <span className="titulo-s recortar" style={{ display: 'block' }}>
                            {f.nombre}
                          </span>
                          <span className="chico texto-2">Matrícula {f.matricula}</span>
                        </span>
                      </label>
                      <Badge texto={etiquetaSiase[f.estado]} tono={tonoSiase[f.estado]} />
                      {f.archivo_ruta ? (
                        <BotonIcono icono={ExternalLink} etiqueta={`Ver reporte de ${f.nombre}`} onClick={() => ver(f.archivo_ruta!)} />
                      ) : (
                        <span style={{ width: 44 }} />
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          )
        }}
      </SegunEstado>
    </Pantalla>
  )
}
