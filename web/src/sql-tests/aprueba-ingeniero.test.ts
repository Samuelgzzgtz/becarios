// @vitest-environment node
/// <reference types="node" />
/*
 * Migración 0026: solo el ingeniero asignado aprueba, corrige y resuelve
 * solicitudes; el administrador solo mira.
 */
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { como, crearBase, ids, insertar, reiniciarAsistencias, sembrarUsuarios } from './soporte'

let db: PGlite

beforeAll(async () => {
  db = await crearBase()
  await sembrarUsuarios(db)
}, 120_000)

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await reiniciarAsistencias(db)
})

async function mensaje(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa
  } catch (e) {
    return (e as Error).message
  }
  throw new Error('Se esperaba un error')
}

it('el administrador no aprueba ni corrige; el ingeniero asignado sí', async () => {
  await como(db, 'bec1')
  const entrada = await insertar(db, { becario: 'bec1', tipo: 'entrada', en: `now() - interval '2 hours'` })

  await como(db, 'admin')
  expect(await mensaje(db.query('select public.aprobar_asistencia($1)', [entrada.id]))).toMatch(/Solo el ingeniero asignado/)
  expect(await mensaje(db.query('select public.aprobar_asistencias($1)', [[entrada.id]]))).toMatch(/Solo el ingeniero asignado/)
  expect(
    await mensaje(
      db.query(`select public.corregir_asistencia($1, 'agregar', null, 'salida', now() - interval '1 hour', 'presencial', 'Salida olvidada')`, [ids.bec1]),
    ),
  ).toMatch(/Solo el ingeniero asignado/)

  await como(db, 'ing1')
  await db.query('select public.aprobar_asistencia($1)', [entrada.id])
  const fila = await db.query<{ revision: string }>('select revision from public.asistencias where id = $1', [entrada.id])
  expect(fila.rows[0].revision).toBe('aprobada')
})

it('el administrador no resuelve solicitudes de corrección; el ingeniero asignado sí', async () => {
  await como(db, 'bec1')
  const { rows } = await db.query<{ id: string }>(
    `select public.solicitar_correccion_asistencia('agregar', null, 'entrada', now() - interval '3 hours', 'presencial', 'Olvidé registrar la entrada') as id`,
  )
  const solicitud = rows[0].id

  await como(db, 'admin')
  expect(await mensaje(db.query(`select public.resolver_correccion_asistencia($1, true, 'Aprobada')`, [solicitud]))).toMatch(
    /solo su ingeniero asignado/,
  )

  await como(db, 'ing1')
  await db.query(`select public.resolver_correccion_asistencia($1, true, 'Aprobada')`, [solicitud])
  const estado = await db.query<{ estado: string }>('select estado from public.solicitudes_correccion where id = $1', [solicitud])
  expect(estado.rows[0].estado).toBe('aprobada')
})
