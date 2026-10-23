import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { DiaHorario, EnrolamientoFacial, ModalidadTrabajo, TipoAsistencia, Usuario } from './modelos'

/**
 * Lo que la app guarda en el teléfono (IndexedDB), equivalente a Room +
 * SharedPreferences de la versión Android:
 *  - `pendientes`: cola de asistencias registradas sin red (C-01).
 *  - `cache`: lo mínimo para que "Registrar asistencia" funcione sin red (C-02):
 *    perfil, embedding facial, patrón semanal y último registro.
 * Todo se borra al cerrar sesión.
 *
 * Nota: el embedding es dato biométrico; igual que en Android, queda protegido
 * solo por el aislamiento del origen del navegador.
 */

export interface AsistenciaPendiente {
  id?: number
  becarioId: string
  tipo: TipoAsistencia
  ocurridoEn: string
  modalidad: ModalidadTrabajo
  latitud?: number | null
  longitud?: number | null
  intentos: number
  /** Rechazo permanente del servidor: ya no se reintenta, se le muestra al becario. */
  error?: string | null
}

export interface UltimoRegistro {
  tipo: TipoAsistencia
  ocurrido_en: string
}

interface Esquema extends DBSchema {
  pendientes: { key: number; value: AsistenciaPendiente; indexes: { porBecario: string } }
  cache: { key: string; value: unknown }
}

let db: Promise<IDBPDatabase<Esquema>> | null = null

function abrir(): Promise<IDBPDatabase<Esquema>> {
  db ??= openDB<Esquema>('docencheck', 1, {
    upgrade(base) {
      const pendientes = base.createObjectStore('pendientes', { keyPath: 'id', autoIncrement: true })
      pendientes.createIndex('porBecario', 'becarioId')
      base.createObjectStore('cache')
    }
  })
  return db
}

// ---- Cola de asistencias ----------------------------------------------------

export async function encolar(p: Omit<AsistenciaPendiente, 'id' | 'intentos' | 'error'>): Promise<void> {
  await (await abrir()).add('pendientes', { ...p, intentos: 0, error: null })
}

export async function todasDe(becarioId: string): Promise<AsistenciaPendiente[]> {
  return (await abrir()).getAllFromIndex('pendientes', 'porBecario', becarioId)
}

/** Las que todavía se intentan subir (sin rechazo permanente), de la más antigua a la más reciente. */
export async function porSubirDe(becarioId: string): Promise<AsistenciaPendiente[]> {
  return (await todasDe(becarioId)).filter((p) => !p.error).sort((a, b) => a.ocurridoEn.localeCompare(b.ocurridoEn))
}

export async function contarPendientes(becarioId: string): Promise<number> {
  return (await porSubirDe(becarioId)).length
}

export async function contarRechazadas(becarioId: string): Promise<number> {
  return (await todasDe(becarioId)).filter((p) => p.error).length
}

export async function actualizarPendiente(p: AsistenciaPendiente): Promise<void> {
  await (await abrir()).put('pendientes', p)
}

export async function eliminarPendiente(id: number): Promise<void> {
  await (await abrir()).delete('pendientes', id)
}

export async function eliminarPendientesDe(becarioId: string, soloRechazadas = false): Promise<void> {
  const base = await abrir()
  for (const p of await todasDe(becarioId)) {
    if (p.id != null && (!soloRechazadas || p.error)) await base.delete('pendientes', p.id)
  }
}

// ---- Caché para uso sin red -------------------------------------------------

async function leer<T>(clave: string): Promise<T | null> {
  try {
    return ((await (await abrir()).get('cache', clave)) as T | undefined) ?? null
  } catch {
    return null
  }
}

async function escribir(clave: string, valor: unknown): Promise<void> {
  try {
    const base = await abrir()
    if (valor == null) await base.delete('cache', clave)
    else await base.put('cache', valor, clave)
  } catch {
    // Sin IndexedDB (modo privado muy restringido): la app sigue funcionando en línea.
  }
}

export const cache = {
  usuario: () => leer<Usuario>('usuario'),
  guardarUsuario: (u: Usuario) => escribir('usuario', u),
  enrolamiento: (becarioId: string) => leer<EnrolamientoFacial>(`enrolamiento_${becarioId}`),
  guardarEnrolamiento: (becarioId: string, e: EnrolamientoFacial | null) => escribir(`enrolamiento_${becarioId}`, e),
  horario: (becarioId: string) => leer<DiaHorario[]>(`horario_${becarioId}`),
  guardarHorario: (becarioId: string, dias: DiaHorario[]) => escribir(`horario_${becarioId}`, dias),
  ultimoRegistro: (becarioId: string) => leer<UltimoRegistro>(`ultimo_registro_${becarioId}`),
  guardarUltimoRegistro: (becarioId: string, r: UltimoRegistro) => escribir(`ultimo_registro_${becarioId}`, r),
  async limpiar() {
    try {
      await (await abrir()).clear('cache')
    } catch {
      // Igual que arriba.
    }
  }
}
