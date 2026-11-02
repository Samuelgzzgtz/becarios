import { ejecutar, q, supabase } from '../lib/supabase'
import type { AccionCorreccion, CambioAsistencia, PropuestaCorreccion, SolicitudCorreccion } from './modelos'
import { validarPropuesta } from './modelos'

export const TAMANO_PAGINA = 30

function parametros(p: PropuestaCorreccion) {
  const error = validarPropuesta(p)
  if (error) throw new Error(error)
  return {
    p_accion: p.accion,
    p_asistencia: p.accion === 'agregar' ? null : p.asistenciaId,
    p_antes: p.accion === 'agregar' ? null : p.antes,
    p_tipo: p.accion === 'eliminar' ? null : p.tipo,
    p_ocurrido_en: p.accion === 'eliminar' ? null : p.ocurridoEn,
    p_modalidad: p.accion === 'eliminar' ? null : p.modalidad,
    p_motivo: p.motivo.trim()
  }
}

export async function solicitar(p: PropuestaCorreccion): Promise<void> {
  await ejecutar(supabase.rpc('solicitar_correccion_asistencia', parametros(p)))
}

export async function corregir(becarioId: string, p: PropuestaCorreccion): Promise<void> {
  await ejecutar(supabase.rpc('corregir_asistencia', { p_becario: becarioId, ...parametros(p) }))
}

export function resolver(id: string, aprobar: boolean, respuesta: string): Promise<void> {
  return ejecutar(supabase.rpc('resolver_correccion_asistencia', { p_solicitud: id, p_aprobar: aprobar, p_respuesta: respuesta.trim() }))
}

export async function solicitudes(pagina: number, soloPendientes: boolean, becarioId?: string) {
  let consulta = supabase.from('solicitudes_correccion').select('*').order('created_at', { ascending: false }).order('id')
  if (soloPendientes) consulta = consulta.eq('estado', 'pendiente')
  if (becarioId) consulta = consulta.eq('becario_id', becarioId)
  const filas = await q<SolicitudCorreccion[]>(consulta.range(pagina * TAMANO_PAGINA, (pagina + 1) * TAMANO_PAGINA))
  return { filas: filas.slice(0, TAMANO_PAGINA), hayMas: filas.length > TAMANO_PAGINA }
}

export async function cambios(pagina: number, becarioId?: string) {
  let consulta = supabase.from('bitacora_asistencias').select('id,becario_id,asistencia_id,accion,actor_id:hecho_por,actor_nombre,antes,despues,motivo,solicitud_id,created_at:hecho_en').order('hecho_en', { ascending: false }).order('id')
  if (becarioId) consulta = consulta.eq('becario_id', becarioId)
  const filas = await q<CambioAsistencia[]>(consulta.range(pagina * TAMANO_PAGINA, (pagina + 1) * TAMANO_PAGINA))
  return { filas: filas.slice(0, TAMANO_PAGINA), hayMas: filas.length > TAMANO_PAGINA }
}

export async function nombresDe(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const usuarios = await q<{ id: string; nombre: string }[]>(supabase.from('usuarios').select('id,nombre').in('id', [...new Set(ids)]))
  return new Map(usuarios.map(u => [u.id, u.nombre]))
}

export function accionDeTexto(texto: string): AccionCorreccion {
  switch (texto) {
    case 'modificar': return 'modificar'
    case 'eliminar': return 'eliminar'
    default: return 'agregar'
  }
}
