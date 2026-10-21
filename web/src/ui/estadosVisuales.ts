import { Ban, CheckCircle2, CircleX, CloudUpload, Hourglass } from 'lucide-react'
import type { EstadoReporteSiase, EstadoTransferencia, EstadoUsuario, Perfil } from '../lib/modelos'
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
