import { fechaHora } from './fechas'
import type { Asistencia, EntradaBitacora } from './modelos'

const nombreTipo = (a: Partial<Asistencia> | null | undefined) => (a?.tipo === 'salida' ? 'salida' : a?.tipo === 'entrada' ? 'entrada' : 'registro')
const modalidad = (m: string | null | undefined) => (m === 'home_office' ? 'home office' : m === 'presencial' ? 'presencial' : 'sin modalidad')
const cuando = (a: Partial<Asistencia> | null | undefined) => {
  const t = fechaHora(a?.ocurrido_en)
  return t ? ` del ${t}` : ''
}

/** Frase corta y clara de un cambio de la bitácora ("Ana agregó una salida del Lun 20 oct · 18:00"). */
export function describirBitacora(e: EntradaBitacora): string {
  const quien = e.hecho_por_nombre?.trim() || 'Alguien'
  switch (e.accion) {
    case 'agregar':
      return `${quien} agregó una ${nombreTipo(e.despues)}${cuando(e.despues)}.`
    case 'eliminar':
      return `${quien} eliminó la ${nombreTipo(e.antes)}${cuando(e.antes)}.`
    case 'aprobar':
      return `${quien} aprobó la ${nombreTipo(e.despues ?? e.antes)}${cuando(e.despues ?? e.antes)}, para que cuente en las horas.`
    case 'editar': {
      const cambios: string[] = []
      const a = e.antes ?? {}
      const d = e.despues ?? {}
      if (a.ocurrido_en !== d.ocurrido_en) {
        cambios.push(`la hora pasó de ${fechaHora(a.ocurrido_en) || 'sin dato'} a ${fechaHora(d.ocurrido_en) || 'sin dato'}`)
      }
      if (a.tipo !== d.tipo && a.tipo && d.tipo) cambios.push(`el tipo pasó de ${a.tipo} a ${d.tipo}`)
      if (a.modalidad !== d.modalidad) cambios.push(`la modalidad pasó de ${modalidad(a.modalidad)} a ${modalidad(d.modalidad)}`)
      const base = `${quien} editó la ${nombreTipo(d.tipo ? d : a)}`
      return cambios.length > 0 ? `${base}: ${cambios.join('; ')}.` : `${base}.`
    }
    default:
      return `${quien} hizo un cambio en un registro.`
  }
}
