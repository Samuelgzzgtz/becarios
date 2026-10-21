import { fechaLocal, hoy, parsear, type Fecha } from './fechas'

export type Perfil = 'becario' | 'ingeniero' | 'administrador'
export type EstadoUsuario = 'activo' | 'inactivo' | 'egresado'
export type TipoAsistencia = 'entrada' | 'salida'
export type ModalidadTrabajo = 'presencial' | 'home_office'
export type EstadoReporteSiase = 'pendiente' | 'subido' | 'confirmado' | 'excluido' | 'sin_reporte'
export type EstadoTransferencia = 'pendiente' | 'aprobada' | 'rechazada'

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
 * Horas por día local (Monterrey). Igual que horas_trabajadas() en SQL (0012):
 * una entrada solo se empareja con la salida inmediata siguiente si ambas son
 * del mismo día; una entrada sin salida ese día no suma (turno abierto).
 */
export function horasPorDia(asistencias: Asistencia[]): Map<Fecha, number> {
  const ordenadas = asistencias
    .map((a) => ({ instante: parsear(a.ocurrido_en), tipo: a.tipo }))
    .filter((a): a is { instante: Date; tipo: TipoAsistencia } => a.instante != null)
    .sort((a, b) => a.instante.getTime() - b.instante.getTime())

  const resultado = new Map<Fecha, number>()
  for (let i = 0; i < ordenadas.length - 1; i++) {
    const actual = ordenadas[i]
    const siguiente = ordenadas[i + 1]
    if (actual.tipo === 'entrada' && siguiente.tipo === 'salida') {
      const dia = fechaLocal(actual.instante)
      if (dia === fechaLocal(siguiente.instante)) {
        const minutos = Math.floor((siguiente.instante.getTime() - actual.instante.getTime()) / 60_000)
        resultado.set(dia, (resultado.get(dia) ?? 0) + Math.max(0, minutos / 60))
      }
    }
  }
  return resultado
}

export function totalHoras(asistencias: Asistencia[]): number {
  let total = 0
  for (const h of horasPorDia(asistencias).values()) total += h
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
