import { useState } from 'react'
import { CalendarDays, CalendarPlus, CalendarX, CheckCircle2, ClipboardCheck, Clock, MapPinOff, MapPin, ScanFace, TriangleAlert, Watch, type LucideProps } from 'lucide-react'
import type { ComponentType } from 'react'
import { anomalias, aprobarAsistencia, aprobarAsistencias } from '../../datos/asistencias'
import { mensajeAmigable } from '../../lib/errores'
import { diaCompleto, hora, parsear } from '../../lib/fechas'
import { entero, horas as formatoHoras, plural } from '../../lib/formato'
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
  fuera_de_zona: MapPin,
  revision_humana: ClipboardCheck,
  sin_rostro: ScanFace,
  modalidad_distinta: CalendarX
}

const TONOS: Record<TipoAnomalia, Tono> = {
  turno_abierto: 'peligro',
  jornada_larga: 'alerta',
  atraso: 'alerta',
  reloj_adelantado: 'alerta',
  sin_ubicacion: 'info',
  fuera_de_zona: 'alerta',
  revision_humana: 'info',
  sin_rostro: 'alerta',
  modalidad_distinta: 'alerta'
}

/** Solo la revisión humana simple se aprueba en lote (igual que aprobar_asistencias); lo demás, uno por uno. */
const seApruebaEnLote = (a: Anomalia) => a.tipo === 'revision_humana'

/** Filas que PostgREST devuelve como máximo (max_rows); la lista llega de lo más antiguo a lo más reciente. */
const MAXIMO_FILAS = 1000

/** Qué pasa al aprobar, dicho en claro, para la confirmación. [jornadaPendiente]: el registro es parte de una jornada larga sin confirmar. */
function consecuencia(a: Anomalia, jornadaPendiente: boolean): string {
  const quien = a.becario_nombre
  const dia = diaCompleto(a.fecha).toLowerCase()
  if (a.tipo === 'jornada_larga') {
    const h = a.horas != null ? ` de ${formatoHoras(a.horas)}` : ''
    return `Se contará la jornada${h} de ${quien} del ${dia}. Confirma que sí la trabajó completa.`
  }
  if (jornadaPendiente) return `Se aprobará el registro de ${quien} del ${dia}. Su jornada pasa el tope y no contará hasta que la confirmes.`
  return `El registro de ${quien} del ${dia} empezará a contar para sus horas.`
}

/** Evidencia compacta: "a 35 m · rostro 0.82 · sin conexión · subido 3 h después". */
function evidencia(a: Anomalia): string {
  const partes: string[] = []
  if (a.distancia_m != null) partes.push(a.distancia_m === 0 ? 'en zona' : `a ${entero(a.distancia_m)} m de la zona`)
  if (a.puntaje_rostro != null) partes.push(`rostro ${a.puntaje_rostro.toFixed(2)}`)
  if (a.origen === 'cola') partes.push('sin conexión')
  if (a.origen === 'manual') partes.push('agregado por ingeniero')
  const m = a.subido_minutos ?? 0
  if (m >= 5) partes.push(`subido ${m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} días`} después`)
  return partes.join(' · ')
}

/** Quita de la lista lo que ya quedó aprobado, sin volver a pedirla al servidor. */
function sinAprobadas(lista: Anomalia[], ids: Set<string>, jornada: boolean): Anomalia[] {
  // El turno sin salida sigue hasta que se agregue la salida; la jornada larga, hasta confirmarla.
  return lista.filter((a) => !ids.has(a.asistencia_id) || a.tipo === 'turno_abierto' || (a.tipo === 'jornada_larga' && !jornada))
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
 * [soloLectura]: el administrador solo mira; aprueba el ingeniero asignado (0026).
 * [rutaAsignar]: ruta para asignarle ingeniero a un becario que no tiene uno activo (nadie puede aprobarle); null si sí tiene.
 */
export default function Revisar(props: {
  rutaBecario: (becarioId: string) => string
  rutaVolver: string
  onNavegar: (ruta: string) => void
  soloLectura?: boolean
  rutaAsignar?: (becarioId: string) => string | null
}) {
  const volver = useVolver(props.rutaVolver)
  const avisos = useAvisos()
  const { estado, recargar, actualizar } = useCarga(() => anomalias(), [], 'No se pudo cargar la lista de registros por revisar.')
  useAlReanudar(recargar)
  const [aAprobar, setAAprobar] = useState<Anomalia | null>(null)
  const [aprobarTodos, setAprobarTodos] = useState(false)
  const [aprobando, setAprobando] = useState(false)
  const idsLote = new Set(estado.tipo === 'listo' && !props.soloLectura ? estado.datos.filter(seApruebaEnLote).map((a) => a.asistencia_id) : [])

  async function aprobar(a: Anomalia) {
    if (aprobando) return
    setAprobando(true)
    const jornada = a.tipo === 'jornada_larga'
    try {
      await aprobarAsistencia(a.asistencia_id, jornada)
      avisos.exito(jornada ? 'Jornada confirmada.' : 'Registro aprobado.')
      if (enTope) recargar()
      else actualizar((lista) => sinAprobadas(lista, new Set([a.asistencia_id]), jornada))
    } catch (e) {
      avisos.error(mensajeAmigable(e, 'No se pudo aprobar el registro.'))
    } finally {
      setAprobando(false)
    }
  }

  // En el tope de filas, quitar las aprobadas escondería las que faltan: mejor volver a pedir la lista.
  const enTope = estado.tipo === 'listo' && estado.datos.length >= MAXIMO_FILAS

  async function aprobarLote(ids: Set<string>) {
    if (aprobando) return
    setAprobando(true)
    try {
      const lista = [...ids]
      // aprobar_asistencias acepta hasta 1000 ids por llamada.
      for (let i = 0; i < lista.length; i += MAXIMO_FILAS) await aprobarAsistencias(lista.slice(i, i + MAXIMO_FILAS))
      avisos.exito(`${plural(ids.size, 'registro aprobado', 'registros aprobados')}.`)
      if (enTope) recargar()
      else actualizar((lista) => sinAprobadas(lista, ids, false))
    } catch (e) {
      avisos.error(mensajeAmigable(e, 'No se pudieron aprobar los registros.'))
      // Un tramo anterior pudo quedar aprobado.
      recargar()
    } finally {
      setAprobando(false)
    }
  }

  return (
    <Pantalla
      titulo="Por revisar"
      subtitulo={estado.tipo === 'listo' ? plural(estado.datos.length, 'registro', 'registros') : 'Registros que necesitan tu atención'}
      onVolver={volver}
      barraAccion={
        idsLote.size > 1 && (
          <Boton ancho icono={CheckCircle2} cargando={aprobando} onClick={() => setAprobarTodos(true)}>
            Aprobar todos ({entero(idsLote.size)})
          </Boton>
        )
      }
    >
      {aprobarTodos && (
        <Dialogo
          titulo="Aprobar todos"
          mensaje={`Se aprobarán ${plural(idsLote.size, 'registro', 'registros')} en revisión humana. Los demás motivos y las jornadas largas se revisan uno por uno.`}
          icono={ClipboardCheck}
          textoConfirmar="Aprobar todos"
          onConfirmar={() => {
            setAprobarTodos(false)
            void aprobarLote(idsLote)
          }}
          onCancelar={() => setAprobarTodos(false)}
        />
      )}
      {aAprobar && (
        <Dialogo
          titulo={aAprobar.tipo === 'jornada_larga' ? 'Confirmar jornada' : 'Aprobar registro'}
          mensaje={consecuencia(
            aAprobar,
            estado.tipo === 'listo' &&
              estado.datos.some((x) => x.tipo === 'jornada_larga' && (x.asistencia_id === aAprobar.asistencia_id || x.entrada_id === aAprobar.asistencia_id))
          )}
          icono={ClipboardCheck}
          textoConfirmar={aAprobar.tipo === 'jornada_larga' ? 'Confirmar' : 'Aprobar'}
          onConfirmar={() => {
            const a = aAprobar
            setAAprobar(null)
            void aprobar(a)
          }}
          onCancelar={() => setAAprobar(null)}
        />
      )}
      <p className="chico texto-2">
        Desde el inicio del semestre. Un registro por revisar no suma horas hasta que se aprueba o se corrige.
        {props.soloLectura && ' Los aprueba el ingeniero asignado a cada becario.'}
      </p>
      {estado.tipo === 'listo' && estado.datos.length >= MAXIMO_FILAS && (
        <p className="chico texto-2">Mostrando los primeros {entero(MAXIMO_FILAS)}, los más antiguos. Al resolverlos aparecerán los demás.</p>
      )}
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(lista) =>
          lista.length === 0 ? (
            <EstadoVacio titulo="Todo en orden" mensaje="No hay registros por revisar en este semestre." icono={CheckCircle2} />
          ) : (
            <>
              {porBecario(lista).map((g) => {
                const asignar = props.rutaAsignar?.(g.id)
                return (
                <section key={g.id} className="columna" style={{ gap: 8 }} aria-label={`Registros de ${g.nombre}`}>
                  <div className="fila" style={{ paddingTop: 8 }}>
                    <Avatar nombre={g.nombre} tamano={36} />
                    <h3 className="titulo-s crece recortar">{g.nombre}</h3>
                    <span className="chico texto-2">{plural(g.items.length, 'pendiente', 'pendientes')}</span>
                  </div>
                  {asignar && (
                    <div className="fila" style={{ flexWrap: 'wrap' }}>
                      <Badge texto="Sin ingeniero activo: nadie puede aprobar" tono="alerta" icono={TriangleAlert} />
                      <Boton chico variante="secundario" onClick={() => props.onNavegar(asignar)}>
                        Asignar ingeniero
                      </Boton>
                    </div>
                  )}
                  {g.items.map((a) => (
                    <FilaAnomalia
                      key={`${a.tipo}-${a.asistencia_id}`}
                      a={a}
                      ocupado={aprobando}
                      onAprobar={props.soloLectura ? undefined : () => setAAprobar(a)}
                      onCorregir={() => props.onNavegar(props.rutaBecario(a.becario_id))}
                    />
                  ))}
                </section>
                )
              })}
            </>
          )
        }
      </SegunEstado>
    </Pantalla>
  )
}

/** Sin [onAprobar] (administrador) solo se puede ir a ver las asistencias del becario. */
function FilaAnomalia(props: { a: Anomalia; ocupado: boolean; onAprobar?: () => void; onCorregir: () => void }) {
  const { a } = props
  // Un motivo nuevo de la base no debe romper una versión vieja de la app en caché.
  const I = ICONOS[a.tipo] ?? TriangleAlert
  const etiqueta = etiquetaAnomalia[a.tipo] ?? 'Por revisar'
  const instante = parsear(a.ocurrido_en)
  const pruebas = evidencia(a)
  return (
    <Tarjeta>
      <div className="columna" style={{ gap: 8 }}>
        <div className="fila" style={{ flexWrap: 'wrap' }}>
          <Badge texto={etiqueta} tono={TONOS[a.tipo] ?? 'alerta'} icono={I} />
          <span className="chico texto-2">
            {diaCompleto(a.fecha)}
            {instante ? ` · ${hora(instante)}` : ''}
          </span>
        </div>
        <p>{a.detalle}</p>
        {pruebas && <p className="chico texto-2">{pruebas}</p>}
        {a.tipo === 'jornada_larga' && a.horas != null && <p className="chico texto-2">Duración: {formatoHoras(a.horas)}</p>}
        <div className="fila" style={{ justifyContent: 'flex-end' }}>
          {!props.onAprobar ? (
            <Boton icono={CalendarDays} variante="secundario" onClick={props.onCorregir} etiqueta={`Ver asistencias de ${a.becario_nombre}`}>
              Ver asistencias
            </Boton>
          ) : anomaliaSeAprueba(a.tipo) ? (
            <Boton icono={CheckCircle2} deshabilitado={props.ocupado} onClick={props.onAprobar} etiqueta={`Aprobar ${etiqueta.toLowerCase()} de ${a.becario_nombre}`}>
              {a.tipo === 'jornada_larga' ? 'Confirmar jornada' : 'Aprobar'}
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
