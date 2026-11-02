import type { Asistencia, ModalidadTrabajo, TipoAsistencia } from '../lib/modelos'

export type AccionCorreccion = 'agregar' | 'modificar' | 'eliminar'
export interface PropuestaCorreccion {
  accion: AccionCorreccion
  asistenciaId: string | null
  antes: Asistencia | null
  tipo: TipoAsistencia
  ocurridoEn: string
  modalidad: ModalidadTrabajo
  motivo: string
}

export interface SolicitudCorreccion {
  id: string
  becario_id: string
  accion: AccionCorreccion
  asistencia_id: string | null
  antes: unknown
  tipo: TipoAsistencia | null
  ocurrido_en: string | null
  modalidad: ModalidadTrabajo | null
  motivo: string
  estado: 'pendiente' | 'aprobada' | 'rechazada'
  created_at: string
  resuelto_por: string | null
  resuelto_en: string | null
  respuesta: string | null
}

export interface CambioAsistencia {
  id: string
  becario_id: string
  asistencia_id: string
  accion: 'insertar' | 'modificar' | 'eliminar'
  actor_id: string | null
  actor_nombre: string | null
  antes: unknown
  despues: unknown
  motivo: string | null
  solicitud_id: string | null
  created_at: string
}

export const accionesCorreccion = { agregar: 'Agregar registro', modificar: 'Modificar registro', eliminar: 'Eliminar registro' }

export function validarPropuesta(p: PropuestaCorreccion, ahora = new Date()): string | null {
  if (p.motivo.trim().length < 5 || p.motivo.trim().length > 500) return 'Explica el motivo con entre 5 y 500 caracteres.'
  if (p.accion !== 'agregar' && !p.asistenciaId) return 'Elige el registro que quieres corregir.'
  if (p.accion !== 'eliminar') {
    const fecha = new Date(p.ocurridoEn)
    if (!Number.isFinite(fecha.getTime())) return 'Elige una fecha y hora válidas.'
    if (fecha > ahora) return 'La fecha y hora no pueden estar en el futuro.'
  }
  return null
}

/** La hora del dispositivo puede llegar después por la cola sin conexión. */
export function esMarcacionDiferida(valor: unknown): boolean {
  if (!valor || typeof valor !== 'object' || !('ocurrido_en' in valor) || !('created_at' in valor)) return false
  if (typeof valor.ocurrido_en !== 'string' || typeof valor.created_at !== 'string') return false
  return new Date(valor.created_at).getTime() - new Date(valor.ocurrido_en).getTime() > 5 * 60_000
}

