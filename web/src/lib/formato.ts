import { diaSemana, diasDelMes, hoy, numeroDia, type Fecha } from './fechas'

/**
 * Formatos de presentación (solo UI): horas, conteos y plurales en español de
 * México. Las fechas de negocio siguen en fechas.ts (zona America/Monterrey).
 */

const fmtHoras = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 })
const fmtEntero = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })

/** 12.5 → "12.5"; 12.0 → "12". Un decimal como máximo. */
export function numeroHoras(horas: number): string {
  return fmtHoras.format(horas)
}

/** "12.5 h" */
export function horas(h: number): string {
  return `${numeroHoras(h)} h`
}

/** "12.5 / 20 h" o "12.5 h" si no hay meta. */
export function horasDeMeta(h: number, meta: number | null | undefined): string {
  return meta == null || meta <= 0 ? horas(h) : `${numeroHoras(h)} / ${numeroHoras(meta)} h`
}

/** Horas que faltan para la meta (nunca negativo). */
export function faltan(h: number, meta: number): number {
  return Math.max(0, meta - h)
}

/** "1,284" */
export function entero(n: number): string {
  return fmtEntero.format(n)
}

/** plural(1, "registro", "registros") = "1 registro"; plural(3, ...) = "3 registros". */
export function plural(n: number, singular: string, pluralTexto: string): string {
  return `${entero(n)} ${n === 1 ? singular : pluralTexto}`
}

/** Primer nombre para saludos ("Ana María López" → "Ana"). */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(' ')[0] ?? ''
}

export function iniciales(nombre: string): string {
  const r = nombre
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
  return r || '?'
}

/**
 * Fracción de la semana/mes ya transcurrida, para comparar el avance contra el
 * ritmo esperado (auditoría B-06) en vez de un umbral fijo del 50 %.
 * Semana: días hábiles (L–V) ya terminados / 5. Mes: días terminados / días del mes.
 */
export function ritmoSemana(f: Fecha = hoy()): number {
  const dow = diaSemana(f)
  const isoDia = dow === 0 ? 7 : dow
  return Math.min(5, Math.max(0, isoDia - 1)) / 5
}

export function ritmoMes(f: Fecha = hoy()): number {
  return (numeroDia(f) - 1) / diasDelMes(f)
}

/** Va al ritmo si ya cumplió, si no hay ritmo esperado, o si lleva al menos el 80 % de lo esperado. */
export function vaAlRitmo(progreso: number, ritmoEsperado: number | null | undefined): boolean {
  return progreso >= 1 || ritmoEsperado == null || progreso >= ritmoEsperado * 0.8
}
