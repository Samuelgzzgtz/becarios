import { fechaLocal, hoy, parsear, type Fecha } from './fechas'

export type Perfil = 'becario' | 'ingeniero' | 'administrador'
export type EstadoUsuario = 'activo' | 'inactivo' | 'egresado'
export type TipoAsistencia = 'entrada' | 'salida'
export type ModalidadTrabajo = 'presencial' | 'home_office'
export type EstadoReporteSiase = 'pendiente' | 'subido' | 'confirmado' | 'excluido' | 'sin_reporte'
export type EstadoTransferencia = 'pendiente' | 'aprobada' | 'rechazada'
export type OrigenAsistencia = 'en_linea' | 'cola' | 'manual'
export type RevisionAsistencia = 'ok' | 'por_revisar' | 'aprobada'
export type MotivoRevision = 'atraso_cola' | 'reloj_adelantado' | 'sin_ubicacion' | 'fuera_de_zona'
export type TipoAnomalia = 'turno_abierto' | 'jornada_larga' | 'atraso' | 'reloj_adelantado' | 'sin_ubicacion' | 'fuera_de_zona'

/** Reglas de asistencia (tabla config_asistencia, 0021). */
export interface ConfigAsistencia {
  jornada_maxima_horas: number
  atraso_maximo_minutos: number
  tolerancia_minutos: number
}

/** Jornada máxima por omisión (la misma que el valor inicial en SQL) mientras no cargue la configuración. */
export const JORNADA_MAXIMA_POR_OMISION = 10
export const CONFIG_POR_OMISION: ConfigAsistencia = {
  jornada_maxima_horas: JORNADA_MAXIMA_POR_OMISION,
  atraso_maximo_minutos: 60,
  tolerancia_minutos: 5
}

/** Zona de registro (tabla geocercas, 0021). */
export interface Geocerca {
  id: string
  nombre: string
  latitud: number
  longitud: number
  radio_m: number
  activa: boolean
}

/** Fila de la RPC anomalias_asistencia() (0021). */
export interface Anomalia {
  tipo: TipoAnomalia
  becario_id: string
  becario_nombre: string
  asistencia_id: string
  entrada_id: string | null
  ocurrido_en: string
  fecha: string
  horas: number | null
  atraso_minutos: number | null
  detalle: string
}

/** Fila de la RPC bitacora_asistencias_de() (0021). */
export interface EntradaBitacora {
  id: number
  hecho_en: string
  accion: 'agregar' | 'editar' | 'eliminar' | 'aprobar'
  hecho_por: string | null
  hecho_por_nombre: string | null
  asistencia_id: string
  antes: Partial<Asistencia> | null
  despues: Partial<Asistencia> | null
}

export interface Usuario {
  id: string
  matricula: string
  nombre: string
  perfil: Perfil
  coordinacion?: string | null
  estado: EstadoUsuario
  /** Id del usuario en Clerk (migración 0018). */
  clerk_id?: string | null
  email?: string | null
}

export interface Asistencia {
  id?: string | null
  becario_id: string
  tipo: TipoAsistencia
  /** Lo pone el default de la columna (now()) si no se manda. */
  ocurrido_en?: string | null
  modalidad: ModalidadTrabajo
  latitud?: number | null
  longitud?: number | null
  verificado_por?: string | null
  /** Lo calcula el servidor (0021); el cliente nunca lo manda. */
  origen?: OrigenAsistencia | null
  revision?: RevisionAsistencia | null
  motivo_revision?: MotivoRevision | null
  /** Similitud facial 0..1 que calculó el teléfono (solo para auditoría). */
  puntaje_rostro?: number | null
}

/** Una asistencia lista para pintar: remota, o todavía en la cola local del teléfono. */
export interface AsistenciaUi {
  asistencia: Asistencia
  sinSubir?: boolean
  rechazo?: string | null
}

/** Fila que devuelve la RPC progreso_horas(). */
export interface ProgresoHoras {
  becario_id: string
  horas_semana: number
  horas_mes: number
  horas_semestre: number
  meta_semanal: number | null
  meta_mensual: number | null
  meta_semestral: number | null
}

/** Fila que devuelve la RPC progreso_equipo() (migración 0016). */
export interface ProgresoBecario extends ProgresoHoras {
  nombre: string
  matricula: string
  ingeniero_id?: string | null
  dias_laborales_semana?: number
  dias_laborales_transcurridos?: number
}

/** Horas que ya debería llevar esta semana: solo cuentan días laborales terminados (auditoría M-09). */
export function horasEsperadasSemana(p: ProgresoBecario): number {
  const meta = p.meta_semanal
  const dias = p.dias_laborales_semana ?? 5
  if (meta == null || dias <= 0) return 0
  return (meta * (p.dias_laborales_transcurridos ?? 0)) / dias
}

/** En riesgo: va por debajo del 80 % de lo esperado a la fecha (y ya hubo al menos un día laboral). */
export function enRiesgo(p: ProgresoBecario): boolean {
  return (p.dias_laborales_transcurridos ?? 0) > 0 && p.horas_semana < horasEsperadasSemana(p) * 0.8
}

export interface EnrolamientoFacial {
  id?: string | null
  becario_id: string
  /** real[] en Postgres (migración 0009): llega como arreglo JSON de números. */
  embedding_vector: number[]
  modelo: string
  dimension: number
  activo?: boolean
  capturado_por?: string | null
}

export interface ReporteSiase {
  id?: string | null
  becario_id: string
  periodo_id: string
  /** "aaaa-mm-01" */
  mes: string
  /** RUTA del objeto en el bucket ("<becario>/<mes>/<archivo>"), no una URL (0014, A-02). */
  archivo_url?: string | null
  estado: EstadoReporteSiase
  fecha_firma?: string | null
  firmado_por?: string | null
}

/** Fila de la RPC reportes_siase_mes() (0014): estado EFECTIVO de cada becario activo en un mes. */
export interface ReporteSiaseMes {
  becario_id: string
  nombre: string
  matricula: string
  reporte_id?: string | null
  mes: string
  archivo_ruta?: string | null
  estado: EstadoReporteSiase
  fecha_firma?: string | null
  firmado_por?: string | null
  actualizado?: string | null
}

/** Fila que devuelve la RPC estado_ventana_siase(). */
export interface EstadoVentanaSiase {
  abierta: boolean
  fecha_apertura: string
  fecha_cierre: string
  dias_restantes: number
}

export interface PeriodoAcademico {
  id: string
  nombre: string
  activo: boolean
  tipo?: string | null
  fecha_inicio?: string | null
  fecha_fin?: string | null
}

/** El becario solo puede (re)subir mientras el reporte no ha sido revisado (auditoría A-01). */
export function permiteSubir(estado: EstadoReporteSiase): boolean {
  return estado === 'pendiente' || estado === 'subido'
}

export interface Transferencia {
  id?: string | null
  becario_id: string
  ingeniero_origen: string
  ingeniero_destino: string
  motivo: string
  estado: EstadoTransferencia
  created_at?: string | null
}

/** Transferencia con los nombres resueltos (C-06, M-06). */
export interface TransferenciaDetalle {
  transferencia: Transferencia
  becario: Usuario | null
  origen: Usuario | null
  destino: Usuario | null
}

export interface DiaHorario {
  dia_semana: number
  modalidad: ModalidadTrabajo
}

/** Fila de exportar_asistencias() (0016): fecha y hora ya en hora local. */
export interface FilaExportacion {
  id: string
  matricula: string
  nombre: string
  tipo: string
  modalidad: string
  fecha: string
  hora: string
}

/**
 * Horas por día local (Monterrey). Mismas reglas que horas_trabajadas() en SQL (0021):
 * una entrada se empareja con la salida inmediata siguiente y el par suma solo si
 *  1. ambas son del mismo día local (0012; una entrada sin salida ese día no suma),
 *  2. ni la entrada ni la salida están 'por_revisar', y
 *  3. dura a lo más [tope] horas, o la salida es 'aprobada' u origen 'manual'.
 * [tope] es jornada_maxima_horas de la configuración (10 por omisión).
 */
export function horasPorDia(asistencias: Asistencia[], tope: number = JORNADA_MAXIMA_POR_OMISION): Map<Fecha, number> {
  const ordenadas = asistencias
    .map((a) => ({ instante: parsear(a.ocurrido_en), a }))
    .filter((x): x is { instante: Date; a: Asistencia } => x.instante != null)
    .sort((x, y) => x.instante.getTime() - y.instante.getTime())

  const resultado = new Map<Fecha, number>()
  for (let i = 0; i < ordenadas.length - 1; i++) {
    const entrada = ordenadas[i]
    const salida = ordenadas[i + 1]
    if (entrada.a.tipo !== 'entrada' || salida.a.tipo !== 'salida') continue
    const dia = fechaLocal(entrada.instante)
    if (dia !== fechaLocal(salida.instante)) continue
    if (entrada.a.revision === 'por_revisar' || salida.a.revision === 'por_revisar') continue
    const minutos = Math.floor((salida.instante.getTime() - entrada.instante.getTime()) / 60_000)
    const horas = Math.max(0, minutos / 60)
    const confiable = salida.a.revision === 'aprobada' || salida.a.origen === 'manual'
    if (horas > tope && !confiable) continue
    resultado.set(dia, (resultado.get(dia) ?? 0) + horas)
  }
  return resultado
}

export function totalHoras(asistencias: Asistencia[], tope: number = JORNADA_MAXIMA_POR_OMISION): number {
  let total = 0
  for (const h of horasPorDia(asistencias, tope).values()) total += h
  return total
}

/**
 * El siguiente registro esperado, decidido por día local (auditoría C-04): si
 * el último fue una entrada de HOY, toca salida; en cualquier otro caso (salida,
 * o una entrada de un día anterior que quedó sin salida) toca entrada.
 */
export function siguienteTipoSegun(
  ultimoTipo: TipoAsistencia | null | undefined,
  ultimoInstante: Date | null | undefined,
  dia: Fecha = hoy()
): TipoAsistencia {
  return ultimoTipo === 'entrada' && ultimoInstante != null && fechaLocal(ultimoInstante) === dia ? 'salida' : 'entrada'
}

/** La columna es numeric(5,4) con CHECK 0..1: la similitud coseno puede salir negativa o con muchos decimales. */
export function normalizarPuntaje(p: number | null | undefined): number | null {
  if (p == null || !Number.isFinite(p)) return null
  return Math.round(Math.min(1, Math.max(0, p)) * 10_000) / 10_000
}
