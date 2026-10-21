import { createClient } from '@supabase/supabase-js'
import { getToken } from '@clerk/react'
import { ErrorApi } from './errores'

/**
 * La VITE_SUPABASE_PUBLISHABLE_KEY es pública a propósito (se embebe en la app
 * cliente); la seguridad real la da Row Level Security en cada tabla.
 *
 * El login es de Clerk (Supabase Third-Party Auth, migración 0018): cada
 * petición lleva el token de sesión de Clerk y RLS identifica al usuario con
 * public.uid_actual().
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const clave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !clave) {
  throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY (ver web/.env.example).')
}

export const supabase = createClient(url, clave, {
  async accessToken() {
    // Sin red Clerk no puede dar token; se reporta como error de red para que
    // la asistencia se guarde en la cola local en vez de esperar al timeout.
    if (!navigator.onLine) throw new TypeError('Failed to fetch')
    try {
      return await getToken()
    } catch {
      throw new TypeError('Failed to fetch')
    }
  }
})

interface RespuestaPostgrest<T> {
  data: T | null
  error: { message: string; code?: string; hint?: string | null; details?: string | null } | null
  status?: number
}

/**
 * Convierte la respuesta `{ data, error }` de PostgREST en un valor o en un
 * ErrorApi lanzado (los repositorios trabajan con excepciones, como en Kotlin).
 */
export async function q<T>(consulta: PromiseLike<RespuestaPostgrest<T>>): Promise<T> {
  let r: RespuestaPostgrest<T>
  try {
    r = await consulta
  } catch (e) {
    throw new ErrorApi('postgrest', { message: e instanceof Error ? e.message : String(e), red: true })
  }
  if (r.error) {
    throw new ErrorApi('postgrest', { message: r.error.message, code: r.error.code, hint: r.error.hint, status: r.status })
  }
  return r.data as T
}

/** Como [q], pero sin datos que devolver (insert/update/delete sin select). */
export async function ejecutar(consulta: PromiseLike<RespuestaPostgrest<unknown>>): Promise<void> {
  await q(consulta)
}
