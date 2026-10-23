import { ErrorApi, ErrorDeNegocio, esErrorDeRed } from '../lib/errores'
import { diaSemana, esFechaValida, primerDiaMes, type Fecha } from '../lib/fechas'
import { cache } from '../lib/local'
import {
  permiteSubir,
  type DiaHorario,
  type EnrolamientoFacial,
  type EstadoReporteSiase,
  type EstadoTransferencia,
  type EstadoVentanaSiase,
  type FilaExportacion,
  type ModalidadTrabajo,
  type PeriodoAcademico,
  type Perfil,
  type ProgresoBecario,
  type ProgresoHoras,
  type ReporteSiase,
  type ReporteSiaseMes,
  type Transferencia,
  type TransferenciaDetalle,
  type Usuario
} from '../lib/modelos'
import { ejecutar, q, supabase } from '../lib/supabase'

// ===========================================================================
// Progreso de horas
// ===========================================================================

export function progresoDe(becarioId: string): Promise<ProgresoHoras> {
  return q(supabase.rpc('progreso_horas', { p_becario: becarioId }).single<ProgresoHoras>())
}

/** Progreso de todo el equipo visible para quien llama (ingeniero: sus becarios; admin: todos), en UNA llamada (M-09). */
export async function progresoEquipo(): Promise<ProgresoBecario[]> {
  return (await q<ProgresoBecario[] | null>(supabase.rpc('progreso_equipo'))) ?? []
}

// ===========================================================================
// Horario / modalidad
// ===========================================================================

/**
 * Modalidad del día. `configurada = false`: el ingeniero no ha definido ese día;
 * se registra como presencial por omisión, pero la UI no debe presentarlo como
 * configurado (M-07).
 */
export interface ModalidadHoy {
  modalidad: ModalidadTrabajo
  configurada: boolean
}

export function semanaDe(becarioId: string): Promise<DiaHorario[]> {
  return q(supabase.from('horarios_modalidad').select('dia_semana, modalidad').eq('becario_id', becarioId))
}

/** Como [semanaDe], guardando copia local; sin red devuelve la copia (o falla si no hay). */
export async function semanaConRespaldo(becarioId: string): Promise<DiaHorario[]> {
  try {
    const semana = await semanaDe(becarioId)
    await cache.guardarHorario(becarioId, semana)
    return semana
  } catch (e) {
    if (esErrorDeRed(e)) {
      const copia = await cache.horario(becarioId)
      if (copia) return copia
    }
    throw e
  }
}

/** dia_semana en la tabla usa 0 = domingo; el día se calcula en hora de Monterrey (A-06). */
export async function modalidadDeHoy(becarioId: string): Promise<ModalidadHoy> {
  const dia = diaSemana()
  const fila = (await semanaConRespaldo(becarioId)).find((d) => d.dia_semana === dia)
  return { modalidad: fila?.modalidad ?? 'presencial', configurada: fila != null }
}

/** Da de alta o reemplaza la modalidad de un día (índice único becario_id + dia_semana). */
export function configurarDia(becarioId: string, dia: number, modalidad: ModalidadTrabajo): Promise<void> {
  return ejecutar(
    supabase.from('horarios_modalidad').upsert({ becario_id: becarioId, dia_semana: dia, modalidad }, { onConflict: 'becario_id,dia_semana' })
  )
}

/** "No aplica": el becario no trabaja ese día (borra la fila). */
export function quitarDia(becarioId: string, dia: number): Promise<void> {
  return ejecutar(supabase.from('horarios_modalidad').delete().eq('becario_id', becarioId).eq('dia_semana', dia))
}

// ===========================================================================
// Enrolamiento facial
// ===========================================================================

/**
 * El becario lee solo el suyo (RLS) y lo compara en el dispositivo. Se guarda
 * copia local para poder verificar sin red (C-02).
 */
export async function enrolamientoPropio(becarioId: string): Promise<EnrolamientoFacial | null> {
  try {
    const e = await q(
      supabase.from('enrolamientos_faciales').select('*').eq('becario_id', becarioId).eq('activo', true).maybeSingle<EnrolamientoFacial>()
    )
    await cache.guardarEnrolamiento(becarioId, e)
    return e
  } catch (e) {
    if (esErrorDeRed(e)) {
      const copia = await cache.enrolamiento(becarioId)
      if (copia) return copia
    }
    throw e
  }
}

/**
 * Alta (o reemplazo) de la biometría con la RPC enrolar_becario (0015): el
 * ingeniero no puede LEER enrolamientos, así que el reemplazo se hace del lado
 * del servidor en una transacción (A-05). Devuelve true si reemplazó una existente.
 */
export function enrolar(becarioId: string, embedding: number[], modelo: string, dimension: number): Promise<boolean> {
  return q(supabase.rpc('enrolar_becario', { p_becario: becarioId, p_embedding: embedding, p_modelo: modelo, p_dimension: dimension }))
}

/** ¿Ya tiene biometría? (para avisar que se va a reemplazar, M-08). */
export function tieneEnrolamiento(becarioId: string): Promise<boolean> {
  return q(supabase.rpc('tiene_enrolamiento', { p_becario: becarioId }))
}

// ===========================================================================
// Equipo (usuarios visibles para el ingeniero)
// ===========================================================================

export function usuario(id: string): Promise<Usuario | null> {
  return q(supabase.from('usuarios').select('*').eq('id', id).maybeSingle<Usuario>())
}

/** El ingeniero actualmente asignado a un becario (lookup inverso), para Mi cuenta. */
export async function ingenieroDe(becarioId: string): Promise<Usuario | null> {
  const fila = await q(
    supabase.from('ingenieros_becarios').select('ingeniero_id').eq('becario_id', becarioId).eq('activo', true).maybeSingle<{ ingeniero_id: string }>()
  )
  return fila ? usuario(fila.ingeniero_id) : null
}

/** Ingenieros ACTIVOS a los que se puede transferir (M-06). */
export function otrosIngenieros(propioId: string): Promise<Usuario[]> {
  return q(supabase.from('usuarios').select('*').eq('perfil', 'ingeniero').eq('estado', 'activo').neq('id', propioId).order('nombre'))
}

// ===========================================================================
// SIASE
// ===========================================================================

const BUCKET_SIASE = 'siase'

/** Tamaño máximo de archivo (M-12). */
export const TAMANO_MAXIMO_REPORTE = 10 * 1024 * 1024

/** Un reporte que espera firma, con el nombre del becario (A-03). */
export interface ReportePorFirmar {
  reporte: ReporteSiase
  becario: Usuario | null
}

export function estadoVentana(): Promise<EstadoVentanaSiase> {
  return q(supabase.rpc('estado_ventana_siase').single<EstadoVentanaSiase>())
}

export function periodoActivo(): Promise<PeriodoAcademico | null> {
  return q(supabase.from('periodos_academicos').select('*').eq('activo', true).maybeSingle<PeriodoAcademico>())
}

export function reporteDelMes(becarioId: string, mes: Fecha): Promise<ReporteSiase | null> {
  return q(supabase.from('reportes_siase').select('*').eq('becario_id', becarioId).eq('mes', mes).maybeSingle<ReporteSiase>())
}

/** Estado EFECTIVO de cada becario visible para un mes (RPC reportes_siase_mes, 0014; A-04, M-04). */
export async function reportesDelMes(mes: Fecha): Promise<ReporteSiaseMes[]> {
  return (await q<ReporteSiaseMes[] | null>(supabase.rpc('reportes_siase_mes', { p_mes: primerDiaMes(mes) }))) ?? []
}

/** Reportes 'subido' de meses ANTERIORES a [mesVisible] que siguen esperando firma (A-03). */
export async function porFirmarAntesDe(mesVisible: Fecha): Promise<ReportePorFirmar[]> {
  const reportes = await q<ReporteSiase[]>(
    supabase.from('reportes_siase').select('*').eq('estado', 'subido').lt('mes', primerDiaMes(mesVisible)).order('mes', { ascending: false })
  )
  if (reportes.length === 0) return []
  const ids = [...new Set(reportes.map((r) => r.becario_id))]
  const becarios = await q<Usuario[]>(supabase.from('usuarios').select('*').in('id', ids))
  const porId = new Map(becarios.map((b) => [b.id, b]))
  return reportes.map((reporte) => ({ reporte, becario: porId.get(reporte.becario_id) ?? null }))
}

export function historialSiaseDe(becarioId: string, limite = 6): Promise<ReporteSiase[]> {
  return q(supabase.from('reportes_siase').select('*').eq('becario_id', becarioId).order('mes', { ascending: false }).limit(limite))
}

function nombreSeguro(nombre: string): string {
  const limpio = nombre.trim().replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)
  return limpio || 'reporte_siase'
}

/**
 * Sube el PDF/imagen a Storage y crea o actualiza la fila de estatus. Guarda la
 * RUTA del objeto, no una URL firmada que caduca (A-02). Antes revisa que el
 * reporte siga abierto (A-01; el backend también lo bloquea).
 */
export async function subirReporte(becarioId: string, periodoId: string, mes: Fecha, archivo: File): Promise<string> {
  if (archivo.size > TAMANO_MAXIMO_REPORTE) throw new ErrorDeNegocio('El archivo pesa más de 10 MB. Reduce su tamaño e intenta de nuevo.')
  if (archivo.size === 0) throw new ErrorDeNegocio('El archivo elegido está vacío.')

  const existente = await reporteDelMes(becarioId, mes)
  if (existente && !permiteSubir(existente.estado)) {
    throw new ErrorDeNegocio('Este reporte ya fue revisado por tu ingeniero; ya no se puede reemplazar.')
  }

  const ruta = `${becarioId}/${mes}/${nombreSeguro(archivo.name)}`
  const { error } = await supabase.storage.from(BUCKET_SIASE).upload(ruta, archivo, { upsert: true, contentType: archivo.type || undefined })
  if (error) {
    const status = Number((error as { statusCode?: string | number }).statusCode ?? (error as { status?: number }).status ?? 0)
    throw new ErrorApi('storage', { message: error.message, status })
  }

  if (!existente) {
    await ejecutar(
      supabase.from('reportes_siase').insert({ becario_id: becarioId, periodo_id: periodoId, mes, archivo_url: ruta, estado: 'subido' })
    )
  } else {
    await ejecutar(supabase.from('reportes_siase').update({ archivo_url: ruta, estado: 'subido' }).eq('id', existente.id!))
  }
  return ruta
}

/** URL temporal (10 min) para abrir el archivo (A-02). Acepta filas viejas que guarden una URL completa. */
export async function urlParaVer(rutaOUrl: string): Promise<string> {
  if (rutaOUrl.startsWith('http')) return rutaOUrl
  const { data, error } = await supabase.storage.from(BUCKET_SIASE).createSignedUrl(rutaOUrl, 600)
  if (error || !data) throw new ErrorApi('storage', { message: error?.message ?? 'Sin URL', status: 404 })
  return data.signedUrl
}

/**
 * Confirma (firma) o excluye reportes con la RPC firmar_reportes_siase (0014):
 * quién firma y cuándo lo pone el servidor. Devuelve cuántos cambió.
 */
export function firmar(reporteIds: string[], estado: EstadoReporteSiase = 'confirmado'): Promise<number> {
  if (reporteIds.length === 0) return Promise.reject(new ErrorDeNegocio('Selecciona al menos un reporte.'))
  return q(supabase.rpc('firmar_reportes_siase', { p_ids: reporteIds, p_estado: estado }))
}

// ===========================================================================
// Transferencias
// ===========================================================================

/** Resuelve los nombres de becario/origen/destino en una sola consulta. Lo que RLS no deje ver queda en null. */
async function conDetalle(transferencias: Transferencia[]): Promise<TransferenciaDetalle[]> {
  if (transferencias.length === 0) return []
  const ids = [...new Set(transferencias.flatMap((t) => [t.becario_id, t.ingeniero_origen, t.ingeniero_destino]))]
  const usuarios = new Map((await q<Usuario[]>(supabase.from('usuarios').select('*').in('id', ids))).map((u) => [u.id, u]))
  return transferencias.map((t) => ({
    transferencia: t,
    becario: usuarios.get(t.becario_id) ?? null,
    origen: usuarios.get(t.ingeniero_origen) ?? null,
    destino: usuarios.get(t.ingeniero_destino) ?? null
  }))
}

/** La solicitud pendiente de un becario, si hay (M-06). */
export function transferenciaPendienteDe(becarioId: string): Promise<Transferencia | null> {
  return q(supabase.from('transferencias').select('*').eq('becario_id', becarioId).eq('estado', 'pendiente').maybeSingle<Transferencia>())
}

export async function solicitarTransferencia(becarioId: string, origen: string, destino: string, motivo: string): Promise<void> {
  if (await transferenciaPendienteDe(becarioId)) {
    throw new ErrorDeNegocio('Este becario ya tiene una solicitud de transferencia pendiente.')
  }
  await ejecutar(
    supabase.from('transferencias').insert({ becario_id: becarioId, ingeniero_origen: origen, ingeniero_destino: destino, motivo: motivo.trim() })
  )
}

export async function transferenciasDelEquipo(ingenieroId: string): Promise<TransferenciaDetalle[]> {
  const lista = await q<Transferencia[]>(
    supabase
      .from('transferencias')
      .select('*')
      .or(`ingeniero_origen.eq.${ingenieroId},ingeniero_destino.eq.${ingenieroId}`)
      .order('created_at', { ascending: false })
  )
  return conDetalle(lista)
}

// ===========================================================================
// Administración
// ===========================================================================

/** Fila de la RPC indicadores_admin() (0016, M-05). */
export interface IndicadoresSistema {
  becarios_activos: number
  ingenieros_activos: number
  becarios_sin_asignar: number
  transferencias_pendientes: number
  /** Reportes 'subido' de cualquier mes: lo que hay que firmar. */
  siase_por_firmar: number
  /** Becarios activos que no han entregado el reporte del mes en curso. */
  siase_sin_entregar: number
  periodo_nombre?: string | null
  periodo_fin?: string | null
  ventana_abierta?: boolean | null
  ventana_dias_restantes?: number | null
}

export interface MetasGlobales {
  meta_semanal: number
  meta_mensual: number
  meta_semestral: number
}

export interface VentanaConfig {
  dia_apertura: number
  dia_cierre: number
}

/** Resumen para la confirmación del cierre de semestre (C-05). */
export interface VistaPreviaCierre {
  periodo_id: string
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  becarios_activos: number
  becarios_cumplidos: number
}

export interface ResultadoCierre {
  periodo_cerrado: string
  periodo_nuevo: string
  becarios_activos: number
  becarios_cumplidos: number
}

export function indicadores(): Promise<IndicadoresSistema> {
  return q(supabase.rpc('indicadores_admin').single<IndicadoresSistema>())
}

/** Por omisión solo activos; con [incluirInactivos] trae todos (para poder reactivar, A-13). */
export function listarPorPerfil(perfil: Perfil, incluirInactivos = false): Promise<Usuario[]> {
  let consulta = supabase.from('usuarios').select('*').eq('perfil', perfil)
  if (!incluirInactivos) consulta = consulta.eq('estado', 'activo')
  return q(consulta.order('nombre'))
}

/** El ingeniero vigente de un becario (A-10). */
export async function ingenieroAsignadoDe(becarioId: string): Promise<string | null> {
  const fila = await q(
    supabase.from('ingenieros_becarios').select('ingeniero_id').eq('becario_id', becarioId).eq('activo', true).maybeSingle<{ ingeniero_id: string }>()
  )
  return fila?.ingeniero_id ?? null
}

/** Asignación atómica en el servidor (RPC asignar_ingeniero, 0015; A-10). */
export function asignarBecario(becarioId: string, ingenieroId: string): Promise<void> {
  return ejecutar(supabase.rpc('asignar_ingeniero', { p_becario: becarioId, p_ingeniero: ingenieroId }))
}

export async function transferenciasPendientes(): Promise<TransferenciaDetalle[]> {
  return conDetalle(await q<Transferencia[]>(supabase.from('transferencias').select('*').eq('estado', 'pendiente').order('created_at')))
}

/** Aprobar/rechazar en una transacción con bloqueo de fila (RPC resolver_transferencia, 0015; C-06). */
export function resolverTransferencia(transferenciaId: string, aprobar: boolean): Promise<EstadoTransferencia> {
  return q(supabase.rpc('resolver_transferencia', { p_transferencia: transferenciaId, p_aprobar: aprobar }))
}

export function metasGlobales(): Promise<MetasGlobales | null> {
  return q(supabase.from('metas_horas').select('meta_semanal, meta_mensual, meta_semestral').is('becario_id', null).maybeSingle<MetasGlobales>())
}

export function ventanaConfig(): Promise<VentanaConfig | null> {
  return q(supabase.from('ventana_siase').select('dia_apertura, dia_cierre').maybeSingle<VentanaConfig>())
}

/** Metas + ventana en una sola transacción (RPC guardar_configuracion, 0015; M-10). */
export function guardarConfiguracion(semanal: number, mensual: number, semestral: number, apertura: number, cierre: number): Promise<void> {
  return ejecutar(
    supabase.rpc('guardar_configuracion', {
      p_meta_semanal: semanal,
      p_meta_mensual: mensual,
      p_meta_semestral: semestral,
      p_dia_apertura: apertura,
      p_dia_cierre: cierre
    })
  )
}

export async function vistaPreviaCierre(): Promise<VistaPreviaCierre | null> {
  return ((await q<VistaPreviaCierre[] | null>(supabase.rpc('vista_previa_cierre'))) ?? [])[0] ?? null
}

/**
 * [periodoActual] es el periodo que el admin vio al confirmar: si ya no es el
 * activo (doble envío, otro admin), el servidor rechaza (C-05).
 */
export async function cerrarSemestre(nombre: string, tipo: string, inicio: Fecha, fin: Fecha, periodoActual: string): Promise<ResultadoCierre> {
  const r = await q<ResultadoCierre | ResultadoCierre[]>(
    supabase.rpc('cerrar_semestre', {
      p_nuevo_nombre: nombre.trim(),
      p_nuevo_tipo: tipo,
      p_nuevo_inicio: inicio,
      p_nuevo_fin: fin,
      p_periodo_actual: periodoActual
    })
  )
  return Array.isArray(r) ? r[0] : r
}

/** Crear el primer periodo cuando no hay ninguno activo (RPC abrir_periodo, 0015; M-11). */
export function abrirPeriodo(nombre: string, tipo: string, inicio: Fecha, fin: Fecha): Promise<void> {
  return ejecutar(supabase.rpc('abrir_periodo', { p_nombre: nombre.trim(), p_tipo: tipo, p_inicio: inicio, p_fin: fin }))
}

/** CSV generado y cuántos registros trae (A-16). */
export interface ExportacionCsv {
  contenido: string
  registros: number
}

const TAMANO_PAGINA = 1000

function campoCsv(valor: string): string {
  return /[",\n\r]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}

/**
 * CSV compatible con Excel (A-16): páginas de 1000 hasta traer todo, campos
 * escapados (RFC 4180), BOM UTF-8 para los acentos, incluye becarios inactivos y
 * fecha/hora ya en hora de Monterrey. [desde] y [hasta] son inclusivas.
 */
export async function exportarAsistenciasCsv(desde: Fecha, hasta: Fecha): Promise<ExportacionCsv> {
  if (!esFechaValida(desde) || !esFechaValida(hasta)) throw new ErrorDeNegocio('Las fechas deben tener el formato aaaa-mm-dd.')
  if (hasta < desde) throw new ErrorDeNegocio('La fecha final no puede ser anterior a la inicial.')

  const filas: FilaExportacion[] = []
  for (let offset = 0; ; offset += TAMANO_PAGINA) {
    const pagina =
      (await q<FilaExportacion[] | null>(
        supabase.rpc('exportar_asistencias', { p_desde: desde, p_hasta: hasta, p_offset: offset, p_limite: TAMANO_PAGINA })
      )) ?? []
    filas.push(...pagina)
    if (pagina.length < TAMANO_PAGINA) break
  }

  const lineas = [
    ['matricula', 'nombre', 'tipo', 'modalidad', 'fecha', 'hora'].map(campoCsv).join(','),
    ...filas.map((f) => [f.matricula, f.nombre, f.tipo, f.modalidad, f.fecha, f.hora].map(campoCsv).join(','))
  ]
  return { contenido: '﻿' + lineas.join('\r\n') + '\r\n', registros: filas.length }
}
