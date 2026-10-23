import { useRef, useState } from 'react'
import { CalendarDays, ExternalLink, FileUp, History, Info, Paperclip } from 'lucide-react'
import {
  TAMANO_MAXIMO_REPORTE,
  estadoVentana,
  historialSiaseDe,
  periodoActivo,
  reportesDelMes,
  subirReporte,
  urlParaVer
} from '../../datos/repositorios'
import { requerirUsuario } from '../../datos/sesion'
import { ErrorDeNegocio, mensajeAmigable } from '../../lib/errores'
import { diaMesLargo, fechaDeTexto, mesActual, mesLargo, parsearMes } from '../../lib/fechas'
import { plural } from '../../lib/formato'
import { permiteSubir, type EstadoReporteSiase, type EstadoVentanaSiase } from '../../lib/modelos'
import { AvisoBanner, Badge, Boton, Divisor, EncabezadoSeccion, IconoCircular, Pantalla, SegunEstado, Tarjeta, abrirUrl } from '../../ui/componentes'
import { useAvisos } from '../../ui/avisos'
import { etiquetaSiase, iconoSiase, tonoSiase } from '../../ui/estadosVisuales'
import { useAlReanudar, useCarga } from '../../ui/hooks'

async function cargar() {
  const usuario = await requerirUsuario()
  const [ventana, periodo, delMes, historial] = await Promise.all([
    estadoVentana(),
    periodoActivo(),
    reportesDelMes(mesActual()).then((filas) => filas.find((f) => f.becario_id === usuario.id) ?? null),
    historialSiaseDe(usuario.id)
  ])
  return { becarioId: usuario.id, ventana, periodo, delMes, historial }
}

/** Por qué no se puede subir, para explicarlo en pantalla. */
function motivoNoPuedeSubir(estado: EstadoReporteSiase, ventana: EstadoVentanaSiase | null): string | null {
  if (!permiteSubir(estado)) {
    return {
      confirmado: 'Tu ingeniero ya confirmó el reporte de este mes.',
      excluido: 'Este mes estás exento de entregar reporte.',
      sin_reporte: 'La ventana de este mes ya cerró sin que se entregara el reporte.',
      pendiente: null,
      subido: null
    }[estado]
  }
  if (!ventana?.abierta) {
    return ventana ? `La ventana abre el ${Number(ventana.fecha_apertura.slice(-2))} de cada mes.` : 'La ventana SIASE está cerrada.'
  }
  return null
}

export default function ReporteSiaseBecario() {
  const avisos = useAvisos()
  const { estado, recargar } = useCarga(cargar, [], 'No se pudo cargar tu reporte SIASE.')
  const [subiendo, setSubiendo] = useState(false)
  const [archivoElegido, setArchivoElegido] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const selector = useRef<HTMLInputElement>(null)
  // Al volver del selector de archivos no se pisa una subida en curso.
  useAlReanudar(() => {
    if (!subiendo) recargar()
  })

  return (
    <Pantalla titulo="Reporte mensual SIASE" subtitulo="Entrega tu captura o PDF de SIASE">
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(d) => {
          const estadoMes: EstadoReporteSiase = d.delMes?.estado ?? 'pendiente'
          const puedeSubir = !subiendo && d.ventana.abierta && permiteSubir(estadoMes)
          const motivo = subiendo ? null : motivoNoPuedeSubir(estadoMes, d.ventana)
          const apertura = fechaDeTexto(d.ventana.fecha_apertura)
          const cierre = fechaDeTexto(d.ventana.fecha_cierre)

          async function alElegir(archivo: File | undefined) {
            if (!archivo) return
            if (!puedeSubir) {
              if (motivo) avisos.error(motivo)
              return
            }
            if (!d.periodo) {
              avisos.error('No hay un periodo académico activo; avisa a la coordinación.')
              return
            }
            setSubiendo(true)
            setMensaje(null)
            setArchivoElegido(archivo.name)
            try {
              if (archivo.size > TAMANO_MAXIMO_REPORTE) throw new ErrorDeNegocio('El archivo pesa más de 10 MB. Reduce su tamaño e intenta de nuevo.')
              await subirReporte(d.becarioId, d.periodo.id, mesActual(), archivo)
              avisos.exito(`Reporte "${archivo.name}" subido. Tu ingeniero lo revisará.`)
              recargar()
            } catch (e) {
              const texto = mensajeAmigable(e, 'No se pudo subir el archivo.')
              setMensaje(texto)
              avisos.error(texto)
            } finally {
              setSubiendo(false)
            }
          }

          return (
            <>
              <Tarjeta>
                <div className="fila">
                  <IconoCircular icono={CalendarDays} tono="exito" />
                  <div className="crece">
                    <p className="titulo-m">{mesLargo(mesActual())}</p>
                    <p className="chico texto-2">{d.periodo ? `Periodo ${d.periodo.nombre}` : 'Sin periodo activo'}</p>
                  </div>
                  <Badge texto={d.ventana.abierta ? 'Abierta' : 'Cerrada'} tono={d.ventana.abierta ? 'exito' : 'neutro'} />
                </div>
                <p className="texto-2" style={{ marginTop: 12 }}>
                  {d.ventana.abierta && d.ventana.dias_restantes <= 0
                    ? 'Hoy es el último día para entregar.'
                    : d.ventana.abierta
                      ? `Quedan ${plural(d.ventana.dias_restantes, 'día', 'días')}${cierre ? `; cierra el ${diaMesLargo(cierre)}.` : '.'}`
                      : apertura && cierre
                        ? `La ventana va del ${diaMesLargo(apertura)} al ${diaMesLargo(cierre)}.`
                        : 'La ventana está cerrada por ahora.'}
                </p>
              </Tarjeta>

              <Tarjeta>
                <div className="fila">
                  <p className="titulo-m crece">Tu reporte</p>
                  <Badge texto={etiquetaSiase[estadoMes]} tono={tonoSiase[estadoMes]} icono={iconoSiase[estadoMes]} />
                </div>
                {estadoMes !== 'excluido' && estadoMes !== 'sin_reporte' && (
                  <Etapas actual={estadoMes === 'pendiente' ? 0 : estadoMes === 'subido' ? 1 : 3} />
                )}
                {motivo && (
                  <div style={{ marginTop: 16 }}>
                    <AvisoBanner texto={motivo} tono="neutro" icono={Info} />
                  </div>
                )}
              </Tarjeta>

              <input
                ref={selector}
                type="file"
                accept="application/pdf,image/*"
                hidden
                onChange={(e) => {
                  void alElegir(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                className={`zona-carga${puedeSubir ? ' habilitada' : ''}`}
                disabled={!puedeSubir}
                onClick={() => selector.current?.click()}
              >
                {subiendo ? (
                  <>
                    <span className="giro grande" aria-hidden />
                    <span className="titulo-s">Subiendo archivo…</span>
                  </>
                ) : (
                  <>
                    <FileUp size={40} color={puedeSubir ? 'var(--primario)' : 'var(--texto-2)'} aria-hidden />
                    <span className="titulo-s" style={{ color: puedeSubir ? 'var(--texto)' : 'var(--texto-2)' }}>
                      {estadoMes === 'subido' ? 'Reemplazar el reporte entregado' : 'Subir captura o PDF de SIASE'}
                    </span>
                    <span className="chico texto-2">PDF, JPG o PNG · máximo 10 MB</span>
                  </>
                )}
              </button>
              {mensaje && <AvisoBanner texto={mensaje} tono="peligro" />}

              {(archivoElegido || d.delMes?.archivo_ruta) && (
                <Tarjeta>
                  {archivoElegido && (
                    <p className="fila" style={{ gap: 8 }}>
                      <Paperclip size={18} color="var(--texto-2)" aria-hidden /> Último archivo: {archivoElegido}
                    </p>
                  )}
                  {d.delMes?.archivo_ruta && (
                    <div style={{ marginTop: 8 }}>
                      <Boton
                        variante="secundario"
                        icono={ExternalLink}
                        ancho
                        onClick={() => abrirUrl(() => urlParaVer(d.delMes!.archivo_ruta!)).catch((e) => avisos.error(mensajeAmigable(e, 'No se pudo abrir el archivo.')))}
                      >
                        Ver archivo entregado
                      </Boton>
                    </div>
                  )}
                </Tarjeta>
              )}

              <Tarjeta>
                <EncabezadoSeccion titulo="Historial de reportes" icono={History} />
                {d.historial.length === 0 && <p className="texto-2" style={{ marginTop: 8 }}>Aún no hay reportes anteriores.</p>}
                {d.historial.map((r, i) => (
                  <div key={r.id ?? r.mes}>
                    {i > 0 && <Divisor />}
                    <div className="fila" style={{ padding: '10px 0' }}>
                      <span className="crece">{parsearMes(r.mes)}</span>
                      <Badge texto={etiquetaSiase[r.estado]} tono={tonoSiase[r.estado]} />
                    </div>
                  </div>
                ))}
              </Tarjeta>
            </>
          )
        }}
      </SegunEstado>
    </Pantalla>
  )
}

function Etapas({ actual }: { actual: number }) {
  return (
    <ol className="etapas" style={{ listStyle: 'none', padding: 0 }}>
      {['Pendiente', 'Subido', 'Confirmado'].map((e, i) => (
        <li key={e} className={`etapa${i < actual || actual === 3 ? ' hecha' : ''}${i === actual ? ' actual' : ''}`}>
          <span className="punto">{i + 1}</span>
          {e}
        </li>
      ))}
    </ol>
  )
}
