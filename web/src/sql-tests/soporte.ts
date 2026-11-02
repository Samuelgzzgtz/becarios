/// <reference types="node" />
/*
 * Soporte para probar las migraciones SQL en PGlite (PostgreSQL en memoria).
 * Simula lo mínimo de Supabase que las migraciones dan por hecho: roles,
 * auth.users / auth.jwt(), storage y vault. Las migraciones se cargan tal cual.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const carpetaSql = new URL('../../../backend/sql/', import.meta.url)

export const ids = {
  admin: '00000000-0000-4000-8000-000000000001',
  ing1: '00000000-0000-4000-8000-000000000011',
  ing2: '00000000-0000-4000-8000-000000000012',
  bec1: '00000000-0000-4000-8000-000000000021',
  bec2: '00000000-0000-4000-8000-000000000022',
} as const

export const sub = {
  admin: 'user_admin',
  ing1: 'user_ing1',
  ing2: 'user_ing2',
  bec1: 'user_bec1',
  bec2: 'user_bec2',
} as const

export type Quien = keyof typeof ids

const entorno = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase concede por defecto todo a estos roles en lo que se crea en public.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb
  );
  create function auth.uid() returns uuid language sql stable
    as $$ select null::uuid $$;
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false);
  create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable
    as $$ select string_to_array(name, '/') $$;

  create schema vault;
  create table vault.secrets (id uuid primary key default gen_random_uuid(), name text, secret text);
  create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;

  set timezone = 'UTC';
`

export function leerMigraciones(hasta?: string): { archivo: string; sql: string }[] {
  return readdirSync(carpetaSql)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
    .filter((f) => !hasta || f.slice(0, 4) <= hasta)
    .map((archivo) => ({ archivo, sql: readFileSync(new URL(archivo, carpetaSql), 'utf8') }))
}

/** Base nueva con el entorno simulado y las migraciones 0001–0021 en orden. */
export async function crearBase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(entorno)
  for (const m of leerMigraciones()) {
    try {
      await db.exec(m.sql)
    } catch (e) {
      throw new Error(`No cargó ${m.archivo}: ${(e as Error).message}`)
    }
  }
  return db
}

/** Siembra un administrador, dos ingenieros y dos becarios (cada ingeniero con un becario). */
export async function sembrarUsuarios(db: PGlite) {
  await sinSesion(db)
  const filas: [Quien, string, string, string][] = [
    ['admin', 'administrador', 'Ana Admin', '1000001'],
    ['ing1', 'ingeniero', 'Iván Ingeniero', '1000011'],
    ['ing2', 'ingeniero', 'Irene Ingeniera', '1000012'],
    ['bec1', 'becario', 'Beto Becario', '1000021'],
    ['bec2', 'becario', 'Bea Becaria', '1000022'],
  ]
  for (const [q, perfil, nombre, matricula] of filas) {
    await db.query(
      `insert into public.usuarios (id, clerk_id, email, nombre, matricula, perfil, estado)
       values ($1, $2, $3, $4, $5, $6, 'activo')`,
      [ids[q], sub[q], `${q}@fime.test`, nombre, matricula, perfil],
    )
  }
  await db.query(
    `insert into public.ingenieros_becarios (ingeniero_id, becario_id) values ($1, $2), ($3, $4)`,
    [ids.ing1, ids.bec1, ids.ing2, ids.bec2],
  )
}

/** Se comporta como el usuario autenticado `quien` (rol authenticated + claims de Clerk). */
export async function como(db: PGlite, quien: Quien) {
  await db.exec('reset role')
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: sub[quien], role: 'authenticated' }),
  ])
  await db.exec('set role authenticated')
}

/** Rol anon, sin claims. */
export async function comoAnon(db: PGlite) {
  await db.exec('reset role')
  await db.exec(`select set_config('request.jwt.claims', '', false)`)
  await db.exec('set role anon')
}

/** Sin sesión y con permisos de dueño (equivale a service role / jobs): el disparador no toca nada. */
export async function sinSesion(db: PGlite) {
  await db.exec('reset role')
  await db.exec(`select set_config('request.jwt.claims', '', false)`)
}

/** Deja asistencias, bitácora, zonas y reglas como al inicio. */
export async function reiniciarAsistencias(db: PGlite) {
  await sinSesion(db)
  await db.exec(`
    truncate public.asistencias, public.bitacora_asistencias, public.geocercas;
    update public.config_asistencia
      set jornada_maxima_horas = 10, atraso_maximo_minutos = 60, tolerancia_minutos = 5;
  `)
}

export interface NuevaAsistencia {
  becario: Quien
  tipo: 'entrada' | 'salida'
  /** Expresión SQL de la hora, p. ej. `timestamptz '2026-03-10 08:00-06'` o `now() - interval '30 minutes'`. */
  en?: string
  modalidad?: 'presencial' | 'home_office'
  latitud?: number | null
  longitud?: number | null
  puntaje?: number | null
  /** Columnas que el cliente intenta mandar (el servidor debe ignorarlas). */
  extra?: Record<string, string>
}

/** Inserta con la identidad actual de la sesión; devuelve la fila resultante. */
export async function insertar(db: PGlite, a: NuevaAsistencia) {
  const cols = ['becario_id', 'tipo', 'modalidad', 'latitud', 'longitud', 'puntaje_rostro']
  const vals = ['$1', '$2', '$3', '$4', '$5', '$6']
  const params: unknown[] = [
    ids[a.becario],
    a.tipo,
    a.modalidad ?? 'home_office',
    a.latitud ?? null,
    a.longitud ?? null,
    a.puntaje ?? null,
  ]
  if (a.en) {
    cols.push('ocurrido_en')
    vals.push(a.en)
  }
  for (const [k, v] of Object.entries(a.extra ?? {})) {
    cols.push(k)
    vals.push(`'${v}'`)
  }
  const r = await db.query<Record<string, unknown>>(
    `insert into public.asistencias (${cols.join(', ')}) values (${vals.join(', ')}) returning *`,
    params,
  )
  return r.rows[0]
}

export async function horas(db: PGlite, quien: Quien, desde: string, hasta: string): Promise<number> {
  const r = await db.query<{ h: string }>(
    `select public.horas_trabajadas($1, ${desde}, ${hasta}) as h`,
    [ids[quien]],
  )
  return Number(r.rows[0].h)
}
