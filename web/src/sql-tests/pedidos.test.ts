// @vitest-environment node
/// <reference types="node" />
/*
 * Migración 0027 sobre PGlite: turno mínimo entre entrada y salida, horario por
 * omisión de los becarios (el bucket solo PDF se prueba en seguridad.test.ts).
 */
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { como, crearBase, ids, insertar, reiniciarAsistencias, sembrarUsuarios, sinSesion } from './soporte'

let db: PGlite

/** Hace N minutos, sin cruzar la medianoche de Monterrey (si no, ya no es el mismo turno). */
const haceMinutos = (n: number) => `greatest(public.inicio_dia_local(public.hoy_local()), now() - interval '${n} minutes')`

beforeAll(async () => {
  db = await crearBase()
  await sembrarUsuarios(db)
}, 120_000)

afterAll(async () => {
  await db?.close()
})

async function filas(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, params)).rows
}

describe('turno mínimo', () => {
  beforeEach(async () => {
    await reiniciarAsistencias(db)
    await db.exec('update public.config_asistencia set turno_minimo_minutos = 30')
  })

  it('una salida propia antes de 30 minutos queda por revisar como salida temprana', async () => {
    await como(db, 'bec1')
    await insertar(db, { becario: 'bec1', tipo: 'entrada', en: haceMinutos(10) })
    const s = await insertar(db, { becario: 'bec1', tipo: 'salida' })
    expect(s.motivo_revision).toBe('salida_temprana')

    await como(db, 'ing1')
    const [a] = await filas(`select tipo, detalle from public.anomalias_asistencia($1) where asistencia_id = $2`, [ids.bec1, s.id])
    expect(a).toMatchObject({ tipo: 'salida_temprana', detalle: 'Salida registrada muy poco después de la entrada.' })
  })

  it('si la salida llega antes que su entrada, se ve como salida temprana y no se aprueba en lote', async () => {
    await como(db, 'bec1')
    const s = await insertar(db, { becario: 'bec1', tipo: 'salida' })
    const e = await insertar(db, { becario: 'bec1', tipo: 'entrada', en: haceMinutos(8) })
    expect([s.motivo_revision, e.motivo_revision]).toEqual(['revision_humana', 'revision_humana'])

    await como(db, 'ing1')
    const [a] = await filas(`select tipo from public.anomalias_asistencia($1) where asistencia_id = $2`, [ids.bec1, s.id])
    expect(a?.tipo).toBe('salida_temprana')
    await expect(db.query('select public.aprobar_asistencias($1)', [[e.id, s.id]])).rejects.toThrow(/turno mínimo/)
    // Uno por uno el ingeniero sí decide.
    await db.query('select public.aprobar_asistencia($1)', [s.id])
  })

  it('después de 30 minutos sigue la revisión humana de siempre', async () => {
    await como(db, 'bec1')
    await insertar(db, { becario: 'bec1', tipo: 'entrada', en: `now() - interval '31 minutes'` })
    expect((await insertar(db, { becario: 'bec1', tipo: 'salida' })).motivo_revision).toBe('revision_humana')
  })

  it('en 0 se apaga', async () => {
    await sinSesion(db)
    await db.exec('update public.config_asistencia set turno_minimo_minutos = 0')
    await como(db, 'bec2')
    await insertar(db, { becario: 'bec2', tipo: 'entrada', en: `now() - interval '5 minutes'` })
    expect((await insertar(db, { becario: 'bec2', tipo: 'salida' })).motivo_revision).toBe('revision_humana')
  })

  it('guardar_config_asistencia valida el turno mínimo y lo conserva si no llega', async () => {
    await como(db, 'admin')
    await db.query('select public.guardar_config_asistencia(10, 60, 5, 45)')
    await db.query('select public.guardar_config_asistencia(10, 60, 5)')
    expect((await filas('select turno_minimo_minutos as t from public.config_asistencia'))[0].t).toBe(45)
    await expect(db.query('select public.guardar_config_asistencia(10, 60, 5, 300)')).rejects.toThrow(/entre 0 y 240/)
  })
})

describe('horario por omisión', () => {
  async function dias(id: string) {
    await sinSesion(db)
    return (await filas('select dia_semana, modalidad from public.horarios_modalidad where becario_id = $1 order by dia_semana', [id])).map(
      (f) => `${f.dia_semana}:${f.modalidad}`
    )
  }
  const lunesAViernes = [1, 2, 3, 4, 5].map((d) => `${d}:presencial`)

  it('un becario nuevo empieza de lunes a viernes presencial; un ingeniero no', async () => {
    await sinSesion(db)
    const nuevo = '00000000-0000-4000-8000-000000000031'
    const ing = '00000000-0000-4000-8000-000000000032'
    await db.query(
      `insert into public.usuarios (id, clerk_id, email, nombre, matricula, perfil, estado)
       values ($1, 'user_nuevo', 'nuevo@fime.test', 'Nora Nueva', '1000031', 'becario', 'activo'),
              ($2, 'user_ing3', 'ing3@fime.test', 'Iker Ingeniero', '1000032', 'ingeniero', 'activo')`,
      [nuevo, ing]
    )
    expect(await dias(nuevo)).toEqual(lunesAViernes)
    expect(await dias(ing)).toEqual([])

    // Al pasar a becario recibe el mismo horario; un horario ya configurado no se toca.
    await db.query(`update public.usuarios set perfil = 'becario' where id = $1`, [ing])
    expect(await dias(ing)).toEqual(lunesAViernes)
    await db.query(`delete from public.horarios_modalidad where becario_id = $1 and dia_semana = 5`, [ing])
    await db.query(`update public.usuarios set perfil = 'ingeniero' where id = $1`, [ing])
    await db.query(`update public.usuarios set perfil = 'becario' where id = $1`, [ing])
    expect(await dias(ing)).toEqual(lunesAViernes.slice(0, 4))
  })
})
