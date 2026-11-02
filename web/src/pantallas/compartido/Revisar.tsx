import { useState } from 'react'
import { CalendarPlus, CheckCircle2, ClipboardCheck, Clock, MapPinOff, MapPin, TriangleAlert, Watch, type LucideProps } from 'lucide-react'
import type { ComponentType } from 'react'
import { anomalias, aprobarAsistencia } from '../../datos/asistencias'
import { mensajeAmigable } from '../../lib/errores'
import { diaCompleto, hora, parsear } from '../../lib/fechas'
import { horas as formatoHoras, plural } from '../../lib/formato'
import type { Anomalia, TipoAnomalia } from '../../lib/modelos'
import { useAvisos } from '../../ui/avisos'
import { Avatar, Badge, Boton, Dialogo, EstadoVacio, Pantalla, SegunEstado, Tarjeta, useVolver, type Tono } from '../../ui/componentes'
import { anomaliaSeAprueba, etiquetaAnomalia } from '../../ui/estadosVisuales'
import { useAlReanudar, useCarga } from '../../ui/hooks'

const ICONOS: Record<TipoAnomalia, ComponentType<LucideProps>> = {
  turno_abierto: Clock,
  jornada_larga: TriangleAlert,
  atraso: Clock,
  reloj_adelantado: Watch,
  sin_ubicacion: MapPinOff,
  fuera_de_zona: MapPin
}

const TONOS: Record<TipoAnomalia, Tono> = {
  turno_abierto: 'peligro',
  jornada_larga: 'alerta',
  atraso: 'alerta',
  reloj_adelantado: 'alerta',
  sin_ubicacion: 'info',
  fuera_de_zona: 'alerta'
}

/** Qué pasa al aprobar, dicho en claro, para la confirmación. */
function consecuencia(a: Anomalia): string {
  const quien = a.becario_nombre
  const dia = diaCompleto(a.fecha).toLowerCase()
  if (a.tipo === 'jornada_larga') {
    const h = a.horas != null ? ` de ${formatoHoras(a.horas)}` : ''
    return `Se contará la jornada${h} de ${quien} del ${dia}. Confirma que sí la trabajó completa.`
  }
  return `El registro de ${quien} del ${dia} empezará a contar para sus horas.`
}

function porBecario(lista: Anomalia[]): { id: string; nombre: string; items: Anomalia[] }[] {
  const mapa = new Map<string, { id: string; nombre: string; items: Anomalia[] }>()
  for (const a of lista) {
    const g = mapa.get(a.becario_id) ?? { id: a.becario_id, nombre: a.becario_nombre, items: [] }
    g.items.push(a)
    mapa.set(a.becario_id, g)
  }
  return [...mapa.values()].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
}

/**
 * Lista de registros por revisar (RPC anomalias_asistencia), agrupada por becario.
 * La usan el ingeniero (sus becarios) y el administrador (todos): el servidor decide qué se ve.
 * [rutaBecario] lleva a las asistencias del becario, donde se agrega la salida o se corrige.
 */
export default function Revisar(props: { rutaBecario: (becarioId: string) => string; rutaVolver: string; onNavegar: (ruta: string) => void }) {
  const volver = useVolver(props.rutaVolver)
  const avisos = useAvisos()
  const { estado, recargar } = useCarga(() => anomalias(), [], 'No se pudo cargar la lista de registros por revisar.')
  useAlReanudar(recargar)
  const [aAprobar, setAAprobar] = useState<Anomalia | null>(null)
  const [aprobando, setAprobando] = useState(false)

  async function aprobar(a: Anomalia) {
    if (aprobando) return
    setAprobando(true)
    try {
      await aprobarAsistencia(a.asistencia_id)
      avisos.exito('Registro aprobado.')
      recargar()
    } catch (e) {
      avisos.error(mensajeAmigable(e, 'No se pudo aprobar el registro.'))
    } finally {
      setAprobando(false)
    }
  }

  return (
    <Pantalla
      titulo="Por revisar"
      subtitulo={estado.tipo === 'listo' ? plural(estado.datos.length, 'registro', 'registros') : 'Registros que necesitan tu atención'}
      onVolver={volver}
    >
      {aAprobar && (
        <Dialogo
          titulo="Aprobar registro"
          mensaje={consecuencia(aAprobar)}
          icono={ClipboardCheck}
          textoConfirmar="Aprobar"
          onConfirmar={() => {
            const a = aAprobar
            setAAprobar(null)
            void aprobar(a)
          }}
          onCancelar={() => setAAprobar(null)}
        />
      )}
      <p className="chico texto-2">Últimos 30 días. Un registro por revisar no suma horas hasta que se aprueba o se corrige.</p>
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(lista) =>
          lista.length === 0 ? (
            <EstadoVacio titulo="Todo en orden" mensaje="No hay registros por revisar en los últimos 30 días." icono={CheckCircle2} />
          ) : (
            <>
              {porBecario(lista).map((g) => (
                <section key={g.id} className="columna" style={{ gap: 8 }} aria-label={`Registros de ${g.nombre}`}>
                  <div className="fila" style={{ paddingTop: 8 }}>
                    <Avatar nombre={g.nombre} tamano={36} />
                    <h3 className="titulo-s crece recortar">{g.nombre}</h3>
                    <span className="chico texto-2">{plural(g.items.length, 'pendiente', 'pendientes')}</span>
                  </div>
                  {g.items.map((a) => (
                    <FilaAnomalia
                      key={`${a.tipo}-${a.asistencia_id}`}
                      a={a}
                      ocupado={aprobando}
                      onAprobar={() => setAAprobar(a)}
                      onCorregir={() => props.onNavegar(props.rutaBecario(a.becario_id))}
                    />
                  ))}
                </section>
              ))}
            </>
          )
        }
      </SegunEstado>
    </Pantalla>
  )
}

function FilaAnomalia(props: { a: Anomalia; ocupado: boolean; onAprobar: () => void; onCorregir: () => void }) {
  const { a } = props
  const I = ICONOS[a.tipo]
  const instante = parsear(a.ocurrido_en)
  return (
    <Tarjeta>
      <div className="columna" style={{ gap: 8 }}>
        <div className="fila" style={{ flexWrap: 'wrap' }}>
          <Badge texto={etiquetaAnomalia[a.tipo]} tono={TONOS[a.tipo]} icono={I} />
          <span className="chico texto-2">
            {diaCompleto(a.fecha)}
            {instante ? ` · ${hora(instante)}` : ''}
          </span>
        </div>
        <p>{a.detalle}</p>
        {a.tipo === 'jornada_larga' && a.horas != null && <p className="chico texto-2">Duración: {formatoHoras(a.horas)}</p>}
        {a.tipo === 'atraso' && a.atraso_minutos != null && <p className="chico texto-2">Llegó {plural(a.atraso_minutos, 'minuto', 'minutos')} después.</p>}
        <div className="fila" style={{ justifyContent: 'flex-end' }}>
          {anomaliaSeAprueba(a.tipo) ? (
            <Boton icono={CheckCircle2} deshabilitado={props.ocupado} onClick={props.onAprobar} etiqueta={`Aprobar ${etiquetaAnomalia[a.tipo].toLowerCase()} de ${a.becario_nombre}`}>
              Aprobar
            </Boton>
          ) : (
            <Boton icono={CalendarPlus} variante="secundario" onClick={props.onCorregir} etiqueta={`Agregar salida o corregir registros de ${a.becario_nombre}`}>
              Agregar salida / corregir
            </Boton>
          )}
        </div>
      </div>
    </Tarjeta>
  )
}
