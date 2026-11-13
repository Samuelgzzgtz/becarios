import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { anomalias, aprobarAsistencia, aprobarAsistencias } from '../../datos/asistencias'
import { mensajeAmigable } from '../../lib/errores'
import { diaCompleto, fechaCorta, hora, parsear } from '../../lib/fechas'
import { entero, horas as formatoHoras, numeroHoras, plural } from '../../lib/formato'
import type { Anomalia, TipoAnomalia } from '../../lib/modelos'
import { useAvisos } from '../../ui/avisos'
import { Avatar, Badge, Boton, Chip, Dialogo, EstadoVacio, Pantalla, SegunEstado, useVolver, type Tono } from '../../ui/componentes'
import { anomaliaSeAprueba, etiquetaAnomalia } from '../../ui/estadosVisuales'
import { useAlReanudar, useCarga } from '../../ui/hooks'

/** Pastilla de cada motivo: rojo lo fuera de zona, ámbar lo que falta o no cuadra, gris lo demás. */
const TONOS: Record<TipoAnomalia, Tono> = {
  turno_abierto: 'alerta',
  jornada_larga: 'alerta',
  atraso: 'alerta',
  reloj_adelantado: 'neutro',
  sin_ubicacion: 'neutro',
  fuera_de_zona: 'peligro',
  revision_humana: 'neutro',
  sin_rostro: 'alerta',
  modalidad_distinta: 'neutro'
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

/**
 * Lista de registros por revisar (RPC anomalias_asistencia), con filtro por motivo.
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
  const [filtro, setFiltro] = useState<TipoAnomalia | null>(null)
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

  // Filtro por tipo; si el tipo elegido ya no tiene registros (se aprobaron), vuelve a "Todos".
  const tipos = estado.tipo === 'listo' ? conteoPorTipo(estado.datos) : []
  const activo = filtro && tipos.some(([t]) => t === filtro) ? filtro : null

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
        Desde el inicio del semestre. No suman horas hasta que se aprueban o se corrigen.
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
              {tipos.length > 1 && (
                <div className="chips" role="group" aria-label="Filtrar por motivo">
                  <Chip texto={`Todos · ${entero(lista.length)}`} activo={activo == null} onClick={() => setFiltro(null)} />
                  {tipos.map(([t, n]) => (
                    <Chip key={t} texto={`${etiquetaAnomalia[t] ?? 'Por revisar'} · ${entero(n)}`} activo={activo === t} onClick={() => setFiltro(t)} />
                  ))}
                </div>
              )}
              <section className="rounded-lg bg-superficie px-4" aria-label="Registros por revisar">
                {lista
                  .filter((a) => activo == null || a.tipo === activo)
                  .map((a) => {
                    const asignar = props.rutaAsignar?.(a.becario_id)
                    return (
                      <FilaAnomalia
                        key={`${a.tipo}-${a.asistencia_id}`}
                        a={a}
                        ocupado={aprobando}
                        onAprobar={props.soloLectura ? undefined : () => setAAprobar(a)}
                        onCorregir={() => props.onNavegar(props.rutaBecario(a.becario_id))}
                        onAsignar={asignar ? () => props.onNavegar(asignar) : undefined}
                      />
                    )
                  })}
              </section>
            </>
          )
        }
      </SegunEstado>
    </Pantalla>
  )
}

/** [tipo, cuántos] en el orden en que aparecen en la lista. */
function conteoPorTipo(lista: Anomalia[]): [TipoAnomalia, number][] {
  const mapa = new Map<TipoAnomalia, number>()
  for (const a of lista) mapa.set(a.tipo, (mapa.get(a.tipo) ?? 0) + 1)
  return [...mapa]
}

/** "A 256 m de la zona" o "A 1.3 km de la zona". */
function textoDistancia(m: number): string {
  return m >= 1000 ? `A ${numeroHoras(m / 1000)} km de la zona` : `A ${entero(m)} m de la zona`
}

/**
 * Esquema de un registro fuera de zona: el círculo es la zona y el punto, dónde se
 * registró. Solo representa la DISTANCIA (escala logarítmica, de 2 a 34 px fuera del
 * borde, tope en 2 km): no tenemos el rumbo, así que el punto va siempre en la misma
 * dirección. La zona es chica y está en la esquina para que el recorrido se note.
 */
function EsquemaDistancia({ metros }: { metros: number }) {
  const r = 9
  const fuera = 2 + 32 * Math.min(1, Math.log10(1 + metros / 25) / Math.log10(1 + 2000 / 25))
  const angulo = (-30 * Math.PI) / 180
  return (
    <svg className="size-14 shrink-0 rounded-md bg-fondo" viewBox="0 0 56 56" aria-hidden>
      <circle cx={12} cy={42} r={r} fill="var(--dato-c)" stroke="var(--dato)" strokeWidth={1} />
      <circle cx={12 + (r + fuera) * Math.cos(angulo)} cy={42 + (r + fuera) * Math.sin(angulo)} r={3.5} fill="var(--peligro)" />
    </svg>
  )
}

/**
 * Un registro: quién, cuándo y por qué; la evidencia y las acciones de texto.
 * Sin [onAprobar] (administrador) solo se puede ir a ver las asistencias del becario.
 * No hay "rechazar": un registro que no procede se corrige o elimina en las asistencias del becario.
 */
function FilaAnomalia(props: { a: Anomalia; ocupado: boolean; onAprobar?: () => void; onCorregir: () => void; onAsignar?: () => void }) {
  const { a } = props
  // Un motivo nuevo de la base no debe romper una versión vieja de la app en caché.
  const etiqueta = etiquetaAnomalia[a.tipo] ?? 'Por revisar'
  const instante = parsear(a.ocurrido_en)
  const lejos = a.tipo === 'fuera_de_zona' && a.distancia_m != null && a.distancia_m > 0 ? a.distancia_m : null
  // La distancia ya va junto al esquema: la evidencia agrega lo demás (rostro, sin conexión, atraso).
  const resto = lejos != null ? evidencia(a).replace(/^a [\d,]+ m de la zona( · )?/, '') : evidencia(a)
  const pruebas = resto.charAt(0).toUpperCase() + resto.slice(1)
  return (
    <article className="border-t border-regla py-3.5 first:border-t-0" aria-label={`${etiqueta} de ${a.becario_nombre}`}>
      <div className="fila gap-2.5">
        <Avatar nombre={a.becario_nombre} tamano={32} />
        <span className="crece">
          <span className="block truncate font-medium">{a.becario_nombre}</span>
          <span className="block text-[13px] text-texto-2">
            {fechaCorta(a.fecha)}
            {instante ? ` · ${hora(instante)}` : ''}
          </span>
        </span>
        <Badge texto={etiqueta} tono={TONOS[a.tipo] ?? 'alerta'} />
      </div>
      <div className="mt-2.5 flex items-center gap-3 pl-[42px]">
        {lejos != null && <EsquemaDistancia metros={lejos} />}
        <span className="min-w-0 flex-1 text-[13px] text-texto-2">
          {lejos != null ? <span className="block text-texto">{textoDistancia(lejos)}</span> : <span className="block">{a.detalle}</span>}
          {pruebas && <span className="block">{pruebas}</span>}
          {a.tipo === 'jornada_larga' && a.horas != null && <span className="block">Duración: {formatoHoras(a.horas)}</span>}
        </span>
      </div>
      {props.onAsignar && (
        <div className="mt-2 flex items-center gap-3 pl-[42px]">
          <Badge texto="Sin ingeniero activo" tono="alerta" />
          <Button variant="link" className="min-h-9 h-auto" onClick={props.onAsignar}>
            Asignar ingeniero
          </Button>
        </div>
      )}
      <div className="-mb-2 flex justify-end gap-4">
        {!props.onAprobar ? (
          <Button variant="link" onClick={props.onCorregir} aria-label={`Ver asistencias de ${a.becario_nombre}`}>
            Ver asistencias
          </Button>
        ) : anomaliaSeAprueba(a.tipo) ? (
          <>
            <Button variant="link" className="text-texto-2" onClick={props.onCorregir} aria-label={`Corregir registros de ${a.becario_nombre}`}>
              Corregir
            </Button>
            <Button variant="link" disabled={props.ocupado} onClick={props.onAprobar} aria-label={`Aprobar ${etiqueta.toLowerCase()} de ${a.becario_nombre}`}>
              {a.tipo === 'jornada_larga' ? 'Confirmar jornada' : 'Aprobar'}
            </Button>
          </>
        ) : (
          <Button variant="link" onClick={props.onCorregir} aria-label={`Agregar salida o corregir registros de ${a.becario_nombre}`}>
            Agregar salida
          </Button>
        )}
      </div>
    </article>
  )
}
