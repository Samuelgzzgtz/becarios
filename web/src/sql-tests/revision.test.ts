// @vitest-environment node
/// <reference types="node" />
/*
 * Migración 0025 sobre PGlite: aprobación por lote, evidencia, horas por aprobar,
 * ids generados en el teléfono y confianza de los disparadores.
 */
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { como, crearBase, ids, insertar, leerMigraciones, reiniciarAsistencias, sembrarUsuarios, sinSesion } from './soporte'

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

async function error(promesa: Promise<unknown>) {
  try {
    await promesa
  } catch (e) {
    return e as Error & { code?: string }
  }
  throw new Error('Se esperaba un error')
}

async function filas(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, params)).rows
}

/** Turno de 2 h de hoy registrado por el propio becario: los dos quedan en revisión humana. */
async function turnoPropio(becario: 'bec1' | 'bec2' = 'bec1') {
  // Sin esto la entrada de hace 2 h sería atraso_cola (reiniciarAsistencias lo restablece).
  await sinSesion(db)
  await db.exec('update public.config_asistencia set atraso_maximo_minutos = 1440')
  await como(db, becario)
  const e = await insertar(db, { becario, tipo: 'entrada', en: `now() - interval '2 hours'` })
  const s = await insertar(db, { becario, tipo: 'salida' })
  return [e.id as string, s.id as string]
}

describe('aprobar_asistencias (lote)', () => {
  it('aprueba todo el lote y las horas suman; devuelve cuántos cambió', async () => {
    const turno = await turnoPropio()
    await como(db, 'ing1')
    expect((await filas('select public.aprobar_asistencias($1) as n', [turno]))[0].n).toBe(2)
    expect((await filas('select public.aprobar_asistencias($1) as n', [turno]))[0].n).toBe(0)
    expect(Number((await filas(`select public.horas_trabajadas($1, now() - interval '1 day', now()) as h`, [ids.bec1]))[0].h)).toBeCloseTo(2, 1)
  })

  it('todo o nada: un registro ajeno, o el propio, rechaza el lote', async () => {
    const propios = await turnoPropio('bec1')
    const ajenos = await turnoPropio('bec2')
    await como(db, 'ing1')
    expect((await error(db.query('select public.aprobar_asistencias($1)', [[...propios, ...ajenos]]))).message).toMatch(/Solo el ingeniero/)
    await como(db, 'bec1')
    expect((await error(db.query('select public.aprobar_asistencias($1)', [propios]))).message).toMatch(/Solo el ingeniero/)
    await sinSesion(db)
    expect(await filas(`select 1 from public.asistencias where revision = 'aprobada'`)).toHaveLength(0)
  })

  it('solo aprueba juntos los de revisión humana; otro motivo rechaza el lote', async () => {
    const turno = await turnoPropio()
    const sinRostro = await insertar(db, { becario: 'bec1', tipo: 'entrada', en: `now() - interval '1 hour'`, puntaje: null })
    expect(sinRostro.motivo_revision).toBe('sin_rostro')
    await como(db, 'ing1')
    expect((await error(db.query('select public.aprobar_asistencias($1)', [[...turno, sinRostro.id]]))).message).toMatch(/uno por uno/)
    expect((await filas('select public.aprobar_asistencias($1) as n', [turno]))[0].n).toBe(2)
  })

  it('confirmar la jornada solo aplica a una salida', async () => {
    const [entrada] = await turnoPropio()
    await como(db, 'ing1')
    expect((await error(db.query('select public.aprobar_asistencia($1, true)', [entrada]))).message).toMatch(/salida/)
  })
})

describe('horas_por_aprobar', () => {
  it('suma los pares por revisar y deja de contarlos al aprobar', async () => {
    const turno = await turnoPropio()
    const ver = async () => (await filas('select * from public.horas_por_aprobar($1)', [ids.bec1]))[0]
    await como(db, 'bec1')
    expect(Number((await ver()).horas_semestre)).toBeCloseTo(2, 1)
    await como(db, 'ing1')
    await db.query('select public.aprobar_asistencias($1)', [turno])
    await como(db, 'bec1')
    expect(Number((await ver()).horas_semestre)).toBe(0)
  })
})

describe('anomalias_asistencia: evidencia', () => {
  it('devuelve rostro, metros fuera de la zona, origen y atraso de subida', async () => {
    await sinSesion(db)
    await db.query(`insert into public.geocercas (nombre, latitud, longitud, radio_m) values ('FIME', 25.725, -100.313, 100)`)
    await como(db, 'bec1')
    // ~0.002° de latitud ≈ 222 m del centro: 122 m fuera del radio.
    const fila = await insertar(db, { becario: 'bec1', tipo: 'entrada', latitud: 25.727, longitud: -100.313, puntaje: 0.82 })
    await como(db, 'ing1')
    const r = await filas('select * from public.anomalias_asistencia() where asistencia_id = $1', [fila.id])
    expect(r).toHaveLength(1)
    expect(Number(r[0].puntaje_rostro)).toBeCloseTo(0.82)
    expect(r[0].distancia_m).toBeGreaterThan(110)
    expect(r[0].distancia_m).toBeLessThan(135)
    expect(r[0].origen).toBe('en_linea')
    expect(r[0].subido_minutos).toBe(0)
    expect((await filas('select public.contar_anomalias_asistencia() as n'))[0].n).toBe(1)
  })
})

describe('registro con id del teléfono', () => {
  it('acepta el id del cliente y un reintento con el mismo id da 23505', async () => {
    await como(db, 'bec1')
    const id = '00000000-0000-4000-8000-0000000000aa'
    const ins = `insert into public.asistencias (id, becario_id, tipo, modalidad, puntaje_rostro, ocurrido_en)
                 values ($1, $2, 'entrada', 'presencial', 0.9, now() + interval '1 hour')`
    await db.query(ins, [id, ids.bec1])
    // El anti-duplicado de 1 min ignora el mismo id (y con reloj adelantado la hora cambia): lo detiene la llave.
    expect((await error(db.query(ins, [id, ids.bec1]))).code).toBe('23505')
  })

  it('el cliente no puede marcar su propia jornada como confirmada', async () => {
    await como(db, 'bec1')
    const fila = await insertar(db, { becario: 'bec1', tipo: 'salida', extra: { jornada_aprobada: 'true' } })
    expect(fila.jornada_aprobada).toBe(false)
  })
})

describe('confianza de los disparadores', () => {
  it('un JWT authenticated sin usuario de Clerk no se trata como service role', async () => {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: 'legado-supabase', role: 'authenticated' })])
    await db.exec('set role authenticated')
    const e = await error(
      db.query(`insert into public.asistencias (becario_id, tipo, modalidad) values ($1, 'entrada', 'presencial')`, [ids.bec1]),
    )
    expect(e.message).toMatch(/Inicia sesión/)
  })
})

describe('cierre y exportación', () => {
  it('la exportación pagina por cursor y la vista previa cuenta también jornadas sin confirmar', async () => {
    await sinSesion(db)
    await db.exec(`update public.periodos_academicos set fecha_inicio = public.hoy_local() - 10, fecha_fin = public.hoy_local() + 10 where activo`)
    await turnoPropio()
    await como(db, 'admin')

    const pagina = (despues: Record<string, unknown> | null) =>
      filas(
        `select id, ocurrido_en, revision, motivo_revision, origen
         from public.exportar_asistencias(public.hoy_local() - 1, public.hoy_local(), 0, 1, $1, $2)`,
        [despues?.ocurrido_en ?? null, despues?.id ?? null],
      )
    const primera = await pagina(null)
    const segunda = await pagina(primera[0])
    expect(primera).toHaveLength(1)
    expect(segunda).toHaveLength(1)
    expect(segunda[0].id).not.toBe(primera[0].id)
    expect(await pagina(segunda[0])).toHaveLength(0)
    expect(primera[0]).toMatchObject({ revision: 'por_revisar', motivo_revision: 'revision_humana', origen: 'cola' })

    // Jornada de 15 h de hace 3 días, aprobada pero sin confirmar: también avisa.
    await sinSesion(db)
    const dia = `public.inicio_dia_local(public.hoy_local() - 3)`
    await insertar(db, { becario: 'bec1', tipo: 'entrada', en: `${dia} + interval '7 hours'` })
    await insertar(db, { becario: 'bec1', tipo: 'salida', en: `${dia} + interval '22 hours'` })
    await como(db, 'admin')
    expect((await filas('select registros_por_revisar from public.vista_previa_cierre()'))[0].registros_por_revisar).toBe(3)
  })
})

describe('backfill de jornada_aprobada', () => {
  it('confirma las salidas aprobadas sin motivo que pasan el tope, sin escribir en la bitácora', async () => {
    const base = await crearBase('0024')
    try {
      await sembrarUsuarios(base)
      const t = (h: string) => `timestamptz '2026-03-10 ${h}-06'`
      // Sin sesión: quedan 'ok'. Larga (6-20) y corta (21-23); las dos salidas aprobadas como en 0021-0023.
      for (const [tipo, h] of [['entrada', '06:00'], ['salida', '20:00'], ['entrada', '21:00'], ['salida', '23:00']] as const) {
        await insertar(base, { becario: 'bec1', tipo, en: t(h) })
      }
      await base.exec(`update public.asistencias set revision = 'aprobada' where tipo = 'salida'`)
      const bitacora = async () => Number((await base.query<{ n: string }>('select count(*) as n from public.bitacora_asistencias')).rows[0].n)
      const antes = await bitacora()
      await base.exec(leerMigraciones().find((m) => m.archivo.startsWith('0025'))!.sql)
      const r = await base.query<{ hora: string; jornada_aprobada: boolean }>(
        `select to_char(ocurrido_en at time zone 'America/Monterrey', 'HH24:MI') as hora, jornada_aprobada
         from public.asistencias where tipo = 'salida' order by ocurrido_en`,
      )
      expect(r.rows).toEqual([{ hora: '20:00', jornada_aprobada: true }, { hora: '23:00', jornada_aprobada: false }])
      expect(await bitacora()).toBe(antes)
    } finally {
      await base.close()
    }
  }, 120_000)
})
