/** Validación de los formularios de Configuración (reglas de asistencia y zonas de registro). */

/** Acepta "20,5" además de "20.5". null si no es un número. */
export const aDecimal = (t: string) => {
  const v = t.trim().replace(',', '.')
  return v === '' || Number.isNaN(Number(v)) ? null : Number(v)
}
export const aEntero = (t: string) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : null)

export type CampoRegla = 'jornada' | 'atraso' | 'tolerancia'

export function validarReglas(f: Record<CampoRegla, string>) {
  const errores: Partial<Record<CampoRegla, string>> = {}
  const jornada = aDecimal(f.jornada)
  const atraso = aEntero(f.atraso)
  const tolerancia = aEntero(f.tolerancia)
  if (jornada == null || jornada < 1 || jornada > 24) errores.jornada = 'Escribe un número de horas entre 1 y 24'
  else if (Math.round(jornada * 10) / 10 !== jornada) errores.jornada = 'Usa máximo un decimal (por ejemplo 9.5)'
  if (atraso == null || atraso < 1 || atraso > 1440) errores.atraso = 'Escribe minutos enteros entre 1 y 1440'
  if (tolerancia == null || tolerancia < 1 || tolerancia > 60) errores.tolerancia = 'Escribe minutos enteros entre 1 y 60'
  return { errores, jornada, atraso, tolerancia }
}

export type CampoZona = 'nombre' | 'radio' | 'latitud' | 'longitud'

export function validarZona(f: Record<CampoZona, string>) {
  const errores: Partial<Record<CampoZona, string>> = {}
  const nombre = f.nombre.trim()
  const radio = aEntero(f.radio)
  const latitud = aDecimal(f.latitud)
  const longitud = aDecimal(f.longitud)
  if (!nombre) errores.nombre = 'Escribe un nombre para la zona'
  else if (nombre.length > 80) errores.nombre = 'Máximo 80 caracteres'
  if (radio == null || radio < 20 || radio > 5000) errores.radio = 'Escribe metros enteros entre 20 y 5000'
  if (latitud == null || latitud < -90 || latitud > 90) errores.latitud = 'La latitud va de -90 a 90'
  if (longitud == null || longitud < -180 || longitud > 180) errores.longitud = 'La longitud va de -180 a 180'
  return { errores, nombre, radio, latitud, longitud }
}

