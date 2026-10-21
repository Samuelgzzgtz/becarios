import { ErrorApi, ErrorDeNegocio, MENSAJE_CUENTA_INACTIVA, esErrorDeRed } from '../lib/errores'
import { cache } from '../lib/local'
import type { Usuario } from '../lib/modelos'
import { q, supabase } from '../lib/supabase'

/*
 * El login lo hace Clerk; el perfil (becario/ingeniero/administrador), estado y
 * datos viven en public.usuarios, enlazados por usuarios.clerk_id (migración
 * 0018). Las cuentas y accesos se administran en el Dashboard de Clerk y el
 * webhook clerk-webhook los refleja en usuarios.
 *
 * Igual que en Android (C-02/A-11): sin red se usa la copia local del perfil,
 * para que un becario pueda registrar asistencia offline.
 */

/** Lo que la app sabe de la sesión de Clerk (lo actualiza <PuenteClerk /> en App.tsx). */
interface EstadoClerk {
  cargado: boolean
  userId: string | null
  cerrarSesion: () => Promise<void>
  abrirPerfil: () => void
}

let clerk: EstadoClerk = { cargado: false, userId: null, cerrarSesion: async () => undefined, abrirPerfil: () => undefined }
let alCargar: (() => void)[] = []

export function registrarClerk(estado: EstadoClerk) {
  if (estado.userId !== clerk.userId) usuarioActual = null
  clerk = estado
  if (estado.cargado) {
    alCargar.forEach((f) => f())
    alCargar = []
  }
}

/** Espera a que Clerk cargue. Sin red no carga nunca: se rinde pronto y se usa la copia local. */
function esperarClerk(): Promise<boolean> {
  if (clerk.cargado) return Promise.resolve(true)
  return new Promise((resolver) => {
    const limite = window.setTimeout(() => resolver(false), navigator.onLine ? 15_000 : 1_500)
    alCargar.push(() => {
      window.clearTimeout(limite)
      resolver(true)
    })
  })
}

let usuarioActual: Usuario | null = null
let consultaEnCurso: Promise<Usuario | null> | null = null

/** El perfil ya cargado, sin red (para guardas de navegación). */
export function usuarioEnMemoria(): Usuario | null {
  return usuarioActual
}

async function copiaLocal(clerkId?: string): Promise<Usuario> {
  const identidad = clerk.userId
  const copia = await cache.usuario()
  if (clerk.userId !== identidad || (clerkId && clerk.userId !== clerkId)) throw new CuentaSinAcceso()
  if (copia && (!clerkId || copia.clerk_id === clerkId)) {
    usuarioActual = copia
    return copia
  }
  throw new ErrorApi('auth', { message: 'Failed to fetch', red: true })
}

async function cargarPerfil(): Promise<Usuario | null> {
  if (!(await esperarClerk())) {
    if (!navigator.onLine) return copiaLocal()
    throw new ErrorApi('auth', { message: 'No se pudo cargar la sesión. Vuelve a intentar.' })
  }

  const clerkId = clerk.userId
  if (!clerkId) {
    usuarioActual = null
    return null
  }
  if (usuarioActual) return usuarioActual

  let usuario: Usuario | null
  try {
    usuario = await q(supabase.from('usuarios').select('*').eq('clerk_id', clerkId).maybeSingle<Usuario>())
  } catch (e) {
    if (esErrorDeRed(e)) return copiaLocal(clerkId)
    throw e
  }
  // Una respuesta anterior no puede reemplazar el perfil de otra sesión.
  if (clerk.userId !== clerkId) return null
  if (usuario) await cache.guardarUsuario(usuario)
  if (clerk.userId !== clerkId) return null
  usuarioActual = usuario
  return usuario
}

/**
 * El usuario de la app para la sesión de Clerk; null si no hay sesión. Si hay
 * sesión pero todavía no existe su fila en usuarios (el webhook aún no llega)
 * lanza CuentaSinAcceso. Sin red y sin copia local lanza el error de red.
 */
export function usuarioAutenticado(): Promise<Usuario | null> {
  consultaEnCurso ??= cargarPerfil()
    .then((u) => {
      if (!u && clerk.userId) throw new CuentaSinAcceso()
      return u
    })
    .finally(() => {
      consultaEnCurso = null
    })
  return consultaEnCurso
}

/** Hay sesión de Clerk, pero la coordinación aún no le da acceso (sin perfil, o pendiente de sincronizar). */
export class CuentaSinAcceso extends ErrorDeNegocio {
  constructor() {
    super('Tu cuenta todavía no tiene acceso a DocenCheck. Pide a la coordinación que te lo asigne y vuelve a intentar.')
    this.name = 'CuentaSinAcceso'
  }
}

/** Como [usuarioAutenticado], pero sin sesión lanza un error legible. */
export async function requerirUsuario(): Promise<Usuario> {
  const u = await usuarioAutenticado()
  if (!u) throw new ErrorDeNegocio('Tu sesión terminó. Vuelve a iniciar sesión.')
  return u
}

/** Olvida la copia en memoria y vuelve a leer el perfil. */
export function refrescar(): Promise<Usuario | null> {
  usuarioActual = null
  return usuarioAutenticado()
}

/**
 * La sesión activa, si hay. Una cuenta sin acceso (dada de baja en Clerk o sin
 * perfil asignado) no entra (A-13): se lanza el motivo para mostrarlo.
 */
export async function sesionActiva(): Promise<Usuario | null> {
  const u = await usuarioAutenticado()
  if (!u) return null
  if (u.estado !== 'activo') {
    usuarioActual = null
    throw new ErrorDeNegocio(MENSAJE_CUENTA_INACTIVA)
  }
  return u
}

/** Cierra la sesión de Clerk y borra la copia local del perfil. */
export async function cerrarSesion(): Promise<void> {
  usuarioActual = null
  await cache.limpiar()
  await clerk.cerrarSesion().catch(() => undefined)
}

/** Ventana de Clerk para cambiar contraseña, correo o métodos de acceso. */
export function abrirPerfilClerk() {
  clerk.abrirPerfil()
}

export function limpiarMemoria() {
  usuarioActual = null
}
