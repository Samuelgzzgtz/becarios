/**
 * Error cuyo mensaje ya está escrito para el usuario (validaciones de la app o
 * mensajes en español que devuelve el backend). [mensajeAmigable] lo muestra tal cual.
 */
export class ErrorDeNegocio extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorDeNegocio'
  }
}

/**
 * Error de Supabase normalizado (PostgREST, Auth, Storage o Functions). supabase-js
 * no lanza: devuelve `{ error }`; los repositorios lo convierten en esta clase.
 */
export class ErrorApi extends Error {
  readonly origen: 'postgrest' | 'auth' | 'storage' | 'functions'
  readonly code: string
  readonly status: number
  readonly hint: string
  readonly red: boolean

  constructor(
    origen: ErrorApi['origen'],
    datos: { message?: string; code?: string | number; status?: number; hint?: string | null; red?: boolean }
  ) {
    super(datos.message ?? 'Error del servidor')
    this.name = 'ErrorApi'
    this.origen = origen
    this.code = datos.code == null ? '' : String(datos.code)
    this.status = datos.status ?? 0
    this.hint = datos.hint ?? ''
    this.red = datos.red ?? pareceErrorDeRed(datos.message)
  }
}

export const MENSAJE_SIN_CONEXION = 'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.'
export const MENSAJE_SESION_EXPIRADA = 'Tu sesión expiró. Cierra sesión y vuelve a entrar.'
export const MENSAJE_CUENTA_INACTIVA = 'Tu cuenta está inactiva; contacta a la coordinación.'

/** Mensajes que dan Chrome ("Failed to fetch"), Firefox ("NetworkError") y Safari ("Load failed"). */
function pareceErrorDeRed(mensaje: string | undefined): boolean {
  if (!mensaje) return false
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|err_internet_disconnected|the internet connection appears to be offline/i.test(
    mensaje
  )
}

/** Fallo de red (sin señal, DNS, timeout): lo único que justifica guardar en cola offline. */
export function esErrorDeRed(e: unknown): boolean {
  if (e instanceof ErrorApi) return e.red
  if (e instanceof TypeError) return pareceErrorDeRed(e.message) || !navigator.onLine
  if (e instanceof Error) {
    if (e.name === 'AuthRetryableFetchError' || e.name === 'FunctionsFetchError') return true
    return pareceErrorDeRed(e.message) || (e.name === 'StorageUnknownError' && !navigator.onLine)
  }
  return false
}

/** El trigger de asistencias rechazó un registro por duplicado (ver migración 0013). */
export function esAsistenciaDuplicada(e: unknown): boolean {
  return e instanceof ErrorApi && e.origen === 'postgrest' && e.hint === 'asistencia_duplicada'
}

/** Sesión inválida o vencida: el registro es válido, pero hay que volver a iniciar sesión. */
export function esErrorDeSesion(e: unknown): boolean {
  if (!(e instanceof ErrorApi)) return false
  return e.code === 'PGRST301' || e.code === 'PGRST303' || e.status === 401
}

/**
 * Traduce cualquier error a un mensaje en español sin texto técnico.
 * [predeterminado] se usa cuando no se reconoce el error.
 */
export function mensajeAmigable(e: unknown, predeterminado = 'Ocurrió un error inesperado. Intenta de nuevo.'): string {
  if (e instanceof ErrorDeNegocio) return e.message || predeterminado
  if (esErrorDeRed(e)) return MENSAJE_SIN_CONEXION
  if (e instanceof DOMException) {
    if (e.name === 'NotAllowedError') return 'No diste permiso para usar la cámara. Actívalo en la configuración del navegador.'
    if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') return 'No se encontró una cámara en este dispositivo.'
    if (e.name === 'NotReadableError') return 'La cámara está ocupada por otra app. Ciérrala e intenta de nuevo.'
  }
  if (!(e instanceof ErrorApi)) return predeterminado

  if (e.origen === 'auth') return mensajeDeAuth(e)
  if (e.origen === 'postgrest') return mensajeDePostgrest(e, predeterminado)
  switch (true) {
    case e.status === 401:
      return MENSAJE_SESION_EXPIRADA
    case e.status === 403:
      return 'No tienes permiso para hacer esto.'
    case e.status === 404:
      return 'No se encontró la información solicitada.'
    case e.status === 413:
      return 'El archivo es demasiado grande.'
    case e.status === 429:
      return 'Demasiados intentos. Espera un momento e intenta de nuevo.'
    case e.status >= 500 && e.status <= 599:
      return 'El servidor no está disponible en este momento. Intenta más tarde.'
    default:
      return predeterminado
  }
}

function mensajeDeAuth(e: ErrorApi): string {
  switch (e.code) {
    case 'invalid_credentials':
      return 'Correo o contraseña incorrectos.'
    case 'email_not_confirmed':
      return 'Tu correo aún no está confirmado; contacta a la coordinación.'
    case 'user_banned':
      return 'Tu cuenta está bloqueada; contacta a la coordinación.'
    case 'over_request_rate_limit':
      return 'Demasiados intentos. Espera un momento e intenta de nuevo.'
  }
  if (e.status === 400) return 'Correo o contraseña incorrectos.'
  if (e.status === 401 || e.status === 403) return MENSAJE_SESION_EXPIRADA
  if (e.status === 429) return 'Demasiados intentos. Espera un momento e intenta de nuevo.'
  return 'No se pudo validar tu sesión. Intenta de nuevo.'
}

function mensajeDePostgrest(e: ErrorApi, predeterminado: string): string {
  const texto = e.message
  switch (e.code) {
    // raise exception de nuestras funciones: el mensaje ya está en español.
    case 'P0001':
      return texto.trim() ? texto : predeterminado
    case '23505':
      if (texto.includes('transferencias_pendiente_idx')) return 'Este becario ya tiene una solicitud de transferencia pendiente.'
      if (texto.includes('matricula')) return 'Esa matrícula ya está registrada.'
      if (texto.includes('enrolamientos_faciales')) return 'Este becario ya tiene biometría registrada.'
      if (texto.includes('ingenieros_becarios')) return 'Este becario ya tiene un ingeniero asignado.'
      return 'Ese registro ya existe.'
    case '22P02':
    case '22007':
    case '22008':
      return 'Algún dato tiene un formato no válido.'
    case '23514':
      return 'Algún valor está fuera del rango permitido.'
    case '23503':
      return 'El registro está ligado a otros datos y no se puede modificar.'
    case '42501':
      return 'No tienes permiso para hacer esto.'
    case 'PGRST116':
      return 'No se encontró la información solicitada.'
    case 'PGRST301':
    case 'PGRST303':
      return MENSAJE_SESION_EXPIRADA
  }
  if (e.status === 401) return MENSAJE_SESION_EXPIRADA
  if (e.status === 403) return 'No tienes permiso para hacer esto.'
  if (e.status >= 500 && e.status <= 599) return 'El servidor no está disponible en este momento. Intenta más tarde.'
  return predeterminado
}
