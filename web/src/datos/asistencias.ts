import { ErrorDeNegocio, esAsistenciaDuplicada, esErrorDeRed, esErrorDeSesion, mensajeAmigable } from '../lib/errores'
import { fechaLocal, inicioDia, parsear, sumarDias, type Fecha } from '../lib/fechas'
import {
  cache,
  contarPendientes,
  contarRechazadas,
  eliminarPendiente,
  eliminarPendientesDe,
  encolar,
  porSubirDe,
  todasDe,
  actualizarPendiente
} from '../lib/local'
import {
  normalizarPuntaje,
  siguienteTipoSegun,
  type Anomalia,
  type Asistencia,
  type AsistenciaUi,
  type ModalidadTrabajo,
  type TipoAsistencia
} from '../lib/modelos'
import { ejecutar, q, supabase } from '../lib/supabase'
import { usuarioAutenticado } from './sesion'

/** Cómo quedó un registro: ya en el servidor, o guardado en el teléfono para subirlo después. */
export type ResultadoRegistro = 'subido' | 'en_cola'

export interface ResultadoSincronizacion {
  subidas: number
  rechazadas: number
  pendientes: number
}

/** Avisa a quien escuche (la app) que la cola cambió, p. ej. para sincronizar en cuanto haya red. */
export const eventosCola = new EventTarget()

/**
 * Intenta subir la asistencia de inmediato. Solo los fallos de RED la mandan a
 * la cola local (auditoría C-01): un rechazo del servidor (duplicado, cuenta
 * inactiva, permisos) se devuelve como error para que el becario lo vea.
 */
export async function registrar(
  becarioId: string,
  tipo: TipoAsistencia,
  modalidad: ModalidadTrabajo,
  latitud: number | null = null,
  longitud: number | null = null,
  puntajeRostro: number | null = null
): Promise<ResultadoRegistro> {
  const ocurridoEn = new Date().toISOString()
  const puntaje = normalizarPuntaje(puntajeRostro)
  // Mismo id en cada reintento: si el primer envío sí llegó, el servidor responde 23505 y no se duplica.
  const asistenciaId = crypto.randomUUID()
  // origen, revision y motivo_revision los calcula el servidor (0021); no se mandan.
  const asistencia: Asistencia = {
    id: asistenciaId,
    becario_id: becarioId,
    tipo,
    ocurrido_en: ocurridoEn,
    modalidad,
    latitud,
    longitud,
    puntaje_rostro: puntaje
  }

  try {
    await ejecutar(supabase.from('asistencias').insert(asistencia))
    await cache.guardarUltimoRegistro(becarioId, { tipo, ocurrido_en: ocurridoEn })
    return 'subido'
  } catch (e) {
    if (!esErrorDeRed(e)) throw new ErrorDeNegocio(mensajeAmigable(e, 'No se pudo registrar tu asistencia.'))
    await encolar({ asistenciaId, becarioId, tipo, ocurridoEn, modalidad, latitud, longitud, puntajeRostro: puntaje })
    await cache.guardarUltimoRegistro(becarioId, { tipo, ocurrido_en: ocurridoEn })
    eventosCola.dispatchEvent(new Event('encolada'))
    return 'en_cola'
  }
}

let sincronizacionEnCurso: Promise<ResultadoSincronizacion> | null = null

/**
 * Sube la cola del usuario con sesión, cada registro por separado (auditoría A-12):
 *  - error de red / sesión vencida → se queda en cola, `intentos` + 1
 *  - duplicado (ya había subido)   → se borra de la cola
 *  - cualquier otro rechazo         → se marca con `error` y ya no se reintenta
 * Una sola pasada a la vez (la app la dispara al abrir, al volver la red, etc.).
 */
export function sincronizarPendientes(): Promise<ResultadoSincronizacion> {
  sincronizacionEnCurso ??= subirCola().finally(() => {
    sincronizacionEnCurso = null
  })
  return sincronizacionEnCurso
}

async function subirCola(): Promise<ResultadoSincronizacion> {
  const uid = await usuarioAutenticado().then((u) => u?.id ?? null, () => null)
  if (!uid) return { subidas: 0, rechazadas: 0, pendientes: 0 }

  let subidas = 0
  let rechazadas = 0
  let pendientes = 0
  for (const p of await porSubirDe(uid)) {
    try {
      await ejecutar(
        supabase.from('asistencias').insert({
          // Sin id (encolado por una versión anterior), lo genera el servidor.
          ...(p.asistenciaId ? { id: p.asistenciaId } : {}),
          becario_id: p.becarioId,
          tipo: p.tipo,
          ocurrido_en: p.ocurridoEn,
          modalidad: p.modalidad,
          latitud: p.latitud ?? null,
          longitud: p.longitud ?? null,
          puntaje_rostro: p.puntajeRostro ?? null
        } satisfies Asistencia)
      )
      if (p.id != null) await eliminarPendiente(p.id)
      subidas++
    } catch (e) {
      if (esAsistenciaDuplicada(e)) {
        if (p.id != null) await eliminarPendiente(p.id)
        subidas++
      } else if (esErrorDeRed(e) || esErrorDeSesion(e)) {
        await actualizarPendiente({ ...p, intentos: p.intentos + 1 })
        pendientes++
      } else {
        await actualizarPendiente({ ...p, intentos: p.intentos + 1, error: mensajeAmigable(e, 'El servidor rechazó este registro.') })
        rechazadas++
      }
    }
  }
  if (subidas + rechazadas > 0) eventosCola.dispatchEvent(new Event('sincronizada'))
  return { subidas, rechazadas, pendientes }
}

export function historial(becarioId: string, limite = 50): Promise<Asistencia[]> {
  return q(
    supabase.from('asistencias').select('*').eq('becario_id', becarioId).order('ocurrido_en', { ascending: false }).limit(limite)
  )
}

/** Historial acotado a un rango [desde, hasta) de instantes ISO-8601. */
export function historialEntre(becarioId: string, desde: string, hasta: string): Promise<Asistencia[]> {
  return q(
    supabase
      .from('asistencias')
      .select('*')
      .eq('becario_id', becarioId)
      .gte('ocurrido_en', desde)
      .lt('ocurrido_en', hasta)
      .order('ocurrido_en', { ascending: false })
  )
}

/** Historial entre dos fechas LOCALES, ambas inclusivas. */
export function historialEntreFechas(becarioId: string, desde: Fecha, hasta: Fecha): Promise<Asistencia[]> {
  return historialEntre(becarioId, inicioDia(desde).toISOString(), inicioDia(sumarDias(hasta, 1)).toISOString())
}

/** Historial de varios becarios en un rango de fechas locales, del más reciente al más antiguo (M-17). */
export async function historialEquipo(becarioIds: string[], desde: Fecha, hasta: Fecha): Promise<AsistenciaUi[]> {
  if (becarioIds.length === 0) return []
  const filas = await q<Asistencia[]>(
    supabase
      .from('asistencias')
      .select('*')
      .in('becario_id', becarioIds)
      .gte('ocurrido_en', inicioDia(desde).toISOString())
      .lt('ocurrido_en', inicioDia(sumarDias(hasta, 1)).toISOString())
      .order('ocurrido_en', { ascending: false })
      .limit(5000)
  )
  return filas.map((asistencia) => ({ asistencia }))
}

export const pendientesSinSubir = contarPendientes
export const rechazadasSinSubir = contarRechazadas

/** Borra la cola local de un becario (al confirmar el cierre de sesión con pendientes). */
export const descartarPendientes = (becarioId: string) => eliminarPendientesDe(becarioId)

/** Borra los registros que el servidor rechazó, una vez que el becario los vio. */
export const descartarRechazadas = (becarioId: string) => eliminarPendientesDe(becarioId, true)

/** Lo que sigue en el teléfono sin subir, para mostrarlo con la etiqueta "Sin subir" (A-14). */
export async function localesComoUi(becarioId: string, desde?: Fecha | null, hasta?: Fecha | null): Promise<AsistenciaUi[]> {
  return (await todasDe(becarioId))
    .filter((p) => {
      const dia = fechaLocal(p.ocurridoEn)
      if (!dia) return true
      return (!desde || dia >= desde) && (!hasta || dia <= hasta)
    })
    .map((p) => ({
      asistencia: { becario_id: p.becarioId, tipo: p.tipo, ocurrido_en: p.ocurridoEn, modalidad: p.modalidad },
      sinSubir: true,
      rechazo: p.error ?? null
    }))
}

/**
 * Qué toca registrar ahora (auditoría C-04): decide por DÍA LOCAL, mirando lo
 * subido y lo que sigue en cola. Sin red usa el último registro guardado (C-02).
 */
export async function siguienteTipo(becarioId: string): Promise<TipoAsistencia> {
  const candidatos: { tipo: TipoAsistencia; instante: Date }[] = []
  try {
    const ultimo = (await historial(becarioId, 1))[0]
    if (ultimo?.ocurrido_en) {
      await cache.guardarUltimoRegistro(becarioId, { tipo: ultimo.tipo, ocurrido_en: ultimo.ocurrido_en })
      const instante = parsear(ultimo.ocurrido_en)
      if (instante) candidatos.push({ tipo: ultimo.tipo, instante })
    }
  } catch {
    const u = await cache.ultimoRegistro(becarioId)
    const instante = parsear(u?.ocurrido_en)
    if (u && instante) candidatos.push({ tipo: u.tipo, instante })
  }
  for (const p of await porSubirDe(becarioId)) {
    const instante = parsear(p.ocurridoEn)
    if (instante) candidatos.push({ tipo: p.tipo, instante })
  }
  const ultimo = candidatos.sort((a, b) => b.instante.getTime() - a.instante.getTime())[0]
  return siguienteTipoSegun(ultimo?.tipo, ultimo?.instante)
}

// ---------------------------------------------------------------------------
// Integridad de horas (0021): anomalías, aprobación y bitácora
// ---------------------------------------------------------------------------

/**
 * Registros que requieren atención (turnos sin salida, jornadas largas, atrasos…).
 * Sin [becarioId], el servidor devuelve los de todos los que quien llama puede ver.
 * Por omisión cubre desde el inicio del periodo activo (0025).
 */
export async function anomalias(becarioId: string | null = null, desde: Fecha | null = null, hasta: Fecha | null = null): Promise<Anomalia[]> {
  const filas = await q<Anomalia[] | null>(
    supabase.rpc('anomalias_asistencia', { p_becario: becarioId, p_desde: desde, p_hasta: hasta })
  )
  const numero = (v: unknown) => (v == null ? null : Number(v))
  return (filas ?? []).map((f) => ({
    ...f,
    entrada_id: f.entrada_id ?? null,
    horas: numero(f.horas),
    atraso_minutos: numero(f.atraso_minutos),
    puntaje_rostro: numero(f.puntaje_rostro),
    distancia_m: numero(f.distancia_m),
    origen: f.origen ?? null,
    subido_minutos: numero(f.subido_minutos)
  }))
}

/** Cuántos registros hay por revisar, sin traer la lista (paneles). */
export async function contarAnomalias(): Promise<number> {
  return Number(await q<number>(supabase.rpc('contar_anomalias_asistencia')))
}

/**
 * Aprueba la revisión del registro. Con [jornada] además confirma la jornada larga
 * que cierra esa salida; sin eso no pasa el tope (0025). Ingeniero asignado o administrador.
 */
export function aprobarAsistencia(asistenciaId: string, jornada = false): Promise<void> {
  return ejecutar(supabase.rpc('aprobar_asistencia', { p_asistencia: asistenciaId, p_jornada: jornada }))
}

/** Aprueba la revisión de varios registros de una vez (no confirma jornadas largas). */
export function aprobarAsistencias(asistenciaIds: string[]): Promise<number> {
  return q(supabase.rpc('aprobar_asistencias', { p_ids: asistenciaIds }))
}
