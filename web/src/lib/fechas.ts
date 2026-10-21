/**
 * Todas las fechas de negocio se calculan en hora de Monterrey, igual que las
 * funciones SQL (migración 0012). No usar la zona del dispositivo: un teléfono
 * con otra zona (o en UTC) movería las fronteras de día/semana/mes.
 *
 * Una fecha LOCAL se representa como texto "aaaa-mm-dd" (tipo `Fecha`); un
 * instante, como `Date`.
 */

export const ZONA = 'America/Monterrey'
const LOCALE = 'es-MX'

export type Fecha = string

const formatoPartes = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
})

function partes(instante: Date): { y: number; m: number; d: number; h: number; min: number; s: number } {
  const p: Record<string, string> = {}
  for (const { type, value } of formatoPartes.formatToParts(instante)) p[type] = value
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second }
}

const dos = (n: number) => String(n).padStart(2, '0')

function aFecha(y: number, m: number, d: number): Fecha {
  return `${y}-${dos(m)}-${dos(d)}`
}

/** "aaaa-mm-dd" → [año, mes (1-12), día]. */
function desarmar(f: Fecha): [number, number, number] {
  const [y, m, d] = f.slice(0, 10).split('-').map(Number)
  return [y, m, d]
}

/** La fecha como instante UTC a mediodía: solo para aritmética y formateo de días. */
function utcMediodia(f: Fecha): Date {
  const [y, m, d] = desarmar(f)
  return new Date(Date.UTC(y, m - 1, d, 12))
}

export function esFechaValida(texto: string | null | undefined): texto is Fecha {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto.trim())) return false
  const [y, m, d] = desarmar(texto.trim())
  const u = new Date(Date.UTC(y, m - 1, d))
  return u.getUTCFullYear() === y && u.getUTCMonth() === m - 1 && u.getUTCDate() === d
}

/**
 * Acepta tanto el formato de Postgres ("2026-10-20T15:03:12.123+00:00") como
 * el ISO de JS ("...Z"). Devuelve null si no se puede leer.
 */
export function parsear(texto: string | null | undefined): Date | null {
  if (!texto) return null
  const d = new Date(texto)
  return Number.isNaN(d.getTime()) ? null : d
}

export function fechaLocal(instante: Date): Fecha
export function fechaLocal(texto: string | null | undefined): Fecha | null
export function fechaLocal(valor: Date | string | null | undefined): Fecha | null {
  const instante = valor instanceof Date ? valor : parsear(valor)
  if (!instante) return null
  const p = partes(instante)
  return aFecha(p.y, p.m, p.d)
}

export function hoy(): Fecha {
  return fechaLocal(new Date())
}

export function sumarDias(f: Fecha, dias: number): Fecha {
  const u = utcMediodia(f)
  u.setUTCDate(u.getUTCDate() + dias)
  return aFecha(u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate())
}

/** Primer día del mes de [f] desplazado [meses]. */
export function sumarMeses(f: Fecha, meses: number): Fecha {
  const [y, m] = desarmar(f)
  const total = y * 12 + (m - 1) + meses
  return aFecha(Math.floor(total / 12), (total % 12) + 1, 1)
}

export function primerDiaMes(f: Fecha): Fecha {
  const [y, m] = desarmar(f)
  return aFecha(y, m, 1)
}

/** Primer día del mes en curso (lo que la tabla reportes_siase usa como "mes"). */
export function mesActual(): Fecha {
  return primerDiaMes(hoy())
}

export function ultimoDiaMes(f: Fecha): Fecha {
  return sumarDias(sumarMeses(f, 1), -1)
}

export function diasDelMes(f: Fecha): number {
  return Number(ultimoDiaMes(f).slice(8, 10))
}

/** 0 = domingo .. 6 = sábado, igual que horarios_modalidad.dia_semana (extract(dow) de Postgres). */
export function diaSemana(f: Fecha = hoy()): number {
  return utcMediodia(f).getUTCDay()
}

export function lunesDe(f: Fecha = hoy()): Fecha {
  const dow = diaSemana(f)
  return sumarDias(f, dow === 0 ? -6 : 1 - dow)
}

/** Días de [desde] a [hasta] (negativo si [hasta] es anterior). */
export function diasEntre(desde: Fecha, hasta: Fecha): number {
  return Math.round((utcMediodia(hasta).getTime() - utcMediodia(desde).getTime()) / 86_400_000)
}

/** Diferencia en ms entre la hora de Monterrey y UTC en ese instante. */
function desfase(instante: Date): number {
  const p = partes(instante)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(instante.getTime() / 1000) * 1000
}

/** Instante absoluto de la fecha y hora LOCALES de Monterrey. */
export function aInstante(f: Fecha, hora = '00:00'): Date {
  const [y, m, d] = desarmar(f)
  const [h, min] = hora.split(':').map(Number)
  const comoUtc = Date.UTC(y, m - 1, d, h, min)
  // Dos pasadas por si el desfase cambia justo en esa fecha (horario de verano).
  let instante = comoUtc - desfase(new Date(comoUtc))
  instante = comoUtc - desfase(new Date(instante))
  return new Date(instante)
}

/** Medianoche local de esa fecha, como instante absoluto. */
export function inicioDia(f: Fecha): Date {
  return aInstante(f, '00:00')
}

/** "13:05" de ese instante en Monterrey. */
export function horaLocal24(instante: Date): string {
  const p = partes(instante)
  return `${dos(p.h)}:${dos(p.min)}`
}

// ---------------------------------------------------------------------------
// Formateo (solo presentación)
// ---------------------------------------------------------------------------

const capitalizar = (s: string) => (s ? s.charAt(0).toLocaleUpperCase(LOCALE) + s.slice(1) : s)
const sinPuntos = (s: string) => s.replace(/\./g, '')

const fmtCortaFecha = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
const fmtCortaInstante = new Intl.DateTimeFormat(LOCALE, { timeZone: ZONA, weekday: 'short', day: 'numeric', month: 'short' })
const fmtHora = new Intl.DateTimeFormat(LOCALE, { timeZone: ZONA, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })
const fmtMes = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', month: 'long', year: 'numeric' })
const fmtDiaCompleto = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
const fmtDiaMesLargo = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', day: 'numeric', month: 'long' })
const fmtFechaMedia = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })

function armarCorta(fmt: Intl.DateTimeFormat, d: Date): string {
  const p: Record<string, string> = {}
  for (const { type, value } of fmt.formatToParts(d)) p[type] = value
  return capitalizar(`${sinPuntos(p.weekday)} ${p.day} ${sinPuntos(p.month)}`)
}

/** "Lun 20 oct" */
export function fechaCorta(valor: Date | Fecha): string {
  return valor instanceof Date ? armarCorta(fmtCortaInstante, valor) : armarCorta(fmtCortaFecha, utcMediodia(valor))
}

/** "9:03" */
export function hora(instante: Date): string {
  return fmtHora.format(instante)
}

/** "Lun 20 oct · 9:03"; cadena vacía si no se puede leer. */
export function fechaHora(texto: string | null | undefined): string {
  const d = parsear(texto)
  return d ? `${fechaCorta(d)} · ${hora(d)}` : ''
}

/** "Octubre 2026" */
export function mesLargo(mes: Fecha): string {
  return capitalizar(fmtMes.format(utcMediodia(mes)).replace(' de ', ' '))
}

/** "2026-10-01" → "Octubre 2026"; si no se puede leer, devuelve el texto tal cual. */
export function parsearMes(texto: string): string {
  return esFechaValida(texto.slice(0, 10)) ? mesLargo(texto.slice(0, 10)) : texto
}

/** "20/10" */
export function diaMes(f: Fecha): string {
  const [, m, d] = desarmar(f)
  return `${dos(d)}/${dos(m)}`
}

/** "Martes 20 de octubre" */
export function diaCompleto(f: Fecha): string {
  return capitalizar(fmtDiaCompleto.format(utcMediodia(f)).replace(',', ''))
}

/** "20 de octubre" */
export function diaMesLargo(f: Fecha): string {
  return fmtDiaMesLargo.format(utcMediodia(f))
}

/** "20 oct 2026" */
export function fechaMedia(f: Fecha): string {
  return sinPuntos(fmtFechaMedia.format(utcMediodia(f))).replace(/ de /g, ' ')
}

/** "2026-10-26" (o con hora) → fecha; null si no se puede leer. */
export function fechaDeTexto(texto: string | null | undefined): Fecha | null {
  if (!texto) return null
  const f = texto.slice(0, 10)
  return esFechaValida(f) ? f : null
}

const INICIALES = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** Letra del día para la cuadrícula L–D. */
export function inicialDia(f: Fecha): string {
  return INICIALES[diaSemana(f)]
}

export function nombreDia(dow: number): string {
  return NOMBRES_DIA[dow] ?? 'Día'
}

export function numeroDia(f: Fecha): number {
  return Number(f.slice(8, 10))
}
