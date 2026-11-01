import { Ban, CheckCircle2, CircleX, CloudUpload, Hourglass } from 'lucide-react'
import type { EstadoReporteSiase, EstadoTransferencia, EstadoUsuario, MotivoRevision, Perfil, TipoAnomalia } from '../lib/modelos'
import type { Icono, Tono } from './componentes'

/* Etiqueta legible, tono del badge e ícono de cada enum (auditoría M-03: nunca el valor crudo). */

export const etiquetaSiase: Record<EstadoReporteSiase, string> = {
  pendiente: 'Pendiente',
  subido: 'En revisión',
  confirmado: 'Confirmado',
  excluido: 'Exento',
  sin_reporte: 'Sin reporte'
}

export const tonoSiase: Record<EstadoReporteSiase, Tono> = {
  pendiente: 'alerta',
  subido: 'info',
  confirmado: 'exito',
  excluido: 'neutro',
  sin_reporte: 'peligro'
}

export const iconoSiase: Record<EstadoReporteSiase, Icono> = {
  pendiente: Hourglass,
  subido: CloudUpload,
  confirmado: CheckCircle2,
  excluido: Ban,
  sin_reporte: CircleX
}

export const etiquetaTransferencia: Record<EstadoTransferencia, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada'
}

export const tonoTransferencia: Record<EstadoTransferencia, Tono> = {
  pendiente: 'alerta',
  aprobada: 'exito',
  rechazada: 'peligro'
}

export const etiquetaEstadoUsuario: Record<EstadoUsuario, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  egresado: 'Egresado'
}

export const tonoEstadoUsuario: Record<EstadoUsuario, Tono> = {
  activo: 'exito',
  inactivo: 'neutro',
  egresado: 'info'
}

export const etiquetaPerfil: Record<Perfil, string> = {
  becario: 'Becario',
  ingeniero: 'Ingeniero',
  administrador: 'Administrador'
}

/* Integridad de horas (0021). */

/** Por qué un registro quedó "Por revisar", en una frase corta. */
export const explicacionMotivo: Record<MotivoRevision, string> = {
  atraso_cola: 'Se guardó sin conexión y llegó con mucho atraso.',
  reloj_adelantado: 'La hora del teléfono iba adelantada; se ajustó a la del servidor.',
  sin_ubicacion: 'No se pudo confirmar la ubicación al registrar.',
  fuera_de_zona: 'Se registró fuera de las zonas permitidas.'
}

export const EXPLICACION_POR_REVISAR = 'No suma horas hasta que un ingeniero lo apruebe.'
export const EXPLICACION_TARDIO = 'Se guardó sin conexión y se subió después.'

export const etiquetaAnomalia: Record<TipoAnomalia, string> = {
  turno_abierto: 'Turno sin salida',
  jornada_larga: 'Jornada muy larga',
  atraso: 'Registro con atraso',
  reloj_adelantado: 'Reloj adelantado',
  sin_ubicacion: 'Sin ubicación',
  fuera_de_zona: 'Fuera de zona'
}

/** Cómo se resuelve cada anomalía: aprobar el registro, o corregirlo agregando/ajustando registros. */
export const anomaliaSeAprueba = (t: TipoAnomalia): boolean => t !== 'turno_abierto'

export const etiquetaAccionBitacora: Record<'agregar' | 'editar' | 'eliminar' | 'aprobar', string> = {
  agregar: 'Agregó un registro',
  editar: 'Editó un registro',
  eliminar: 'Eliminó un registro',
  aprobar: 'Aprobó un registro'
}
