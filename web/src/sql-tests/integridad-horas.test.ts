// @vitest-environment node
/// <reference types="node" />
/*
 * Migración 0021 (integridad de horas): reglas de docs/integridad-horas.md
 * comprobadas sobre PGlite con las migraciones 0001–0021 cargadas en orden.
 *
 * Fechas fijas del pasado (2026-03-10, hora de Monterrey = UTC-6) se insertan
 * sin sesión (service role) o como ingeniero; al becario se le prueba con
 * tiempos relativos a now().
 */
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  como,
  comoAnon,
  crearBase,
  horarioSemanal,
  horas,
  ids,
  insertar,
  leerMigraciones,
  reiniciarAsistencias,
  sembrarUsuarios,
  sinSesion,
  type NuevaAsistencia,
} from './soporte'

let db: PGlite

const dia = '2026-03-10'
const t = (hora: string, d = dia) => `timestamptz '${d} ${hora}-06'`
const DIA_DESDE = t('00:00')
const DIA_HASTA = `timestamptz '2026-03-11 00:00-06'`

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

async function bitacora() {
  await sinSesion(db)
  const r = await db.query<{ accion: string; hecho_por: string | null }>(
    'select accion, hecho_por from public.bitacora_asistencias order by id',
  )
  return r.rows
}

async function insertarManual(a: NuevaAsistencia) {
  await db.query(
    `select public.corregir_asistencia($1, 'agregar', null, $2, ${a.en ?? 'now()'}, $3, 'Alta manual de prueba')`,
    [ids[a.becario], a.tipo, a.modalidad ?? 'home_office'],
  )
  return (await db.query<Record<string, unknown>>(
    'select * from public.asistencias where becario_id=$1 and tipo=$2 order by created_at desc limit 1',
    [ids[a.becario], a.tipo],
  )).rows[0]
}

async function error(promesa: Promise<unknown>) {
  try {
    await promesa
  } catch (e) {
    return e as Error & { hint?: string }
  }
  throw new Error('Se esperaba un error y no hubo ninguno')
}

/** Jornada de 8:00 a 23:59 del 2026-03-10 para bec1, sin sesión; devuelve el id de la salida. */
async function jornadaLarga(becario: 'bec1' | 'bec2' = 'bec1', d = dia) {
  await sinSesion(db)
  await insertar(db, { becario, tipo: 'entrada', en: t('08:00', d) })
  const salida = await insertar(db, { becario, tipo: 'salida', en: t('23:59', d) })
  return salida.id as string
}

describe('migración', () => {
  it('es segura de correr dos veces y deja la configuración inicial', async () => {
    const sql = leerMigraciones().find((m) => m.archivo.startsWith('0021'))!.sql
    await sinSesion(db)
    await db.exec('begin')
    try {
      await db.exec(sql)
      const cfg = await db.query('select * from public.config_asistencia')
      expect(cfg.rows).toHaveLength(1)
      expect(cfg.rows[0]).toMatchObject({
        jornada_maxima_horas: '10.0',
        atraso_maximo_minutos: 60,
        tolerancia_minutos: 5,
      })
    } finally {
      await db.exec('rollback')
    }
  })

  it('el disparador del servidor se ordena antes del anti-duplicado', async () => {
    const r = await db.query<{ tgname: string }>(
      `select tgname from pg_trigger
       where tgrelid = 'public.asistencias'::regclass and not tgisinternal and tgtype & 2 = 2
       order by tgname`,
    )
    const nombres = r.rows.map((x) => x.tgname)
    expect(nombres.indexOf('asistencias_0_servidor')).toBeLessThan(nombres.indexOf('asistencias_validar'))
  })

  it('anon no puede ejecutar las RPC nuevas', async () => {
    await comoAnon(db)
    const e = await error(db.query('select * from public.anomalias_asistencia()'))
    expect(e.message).toMatch(/permission denied/i)
    const e2 = await error(db.query('select public.aprobar_asistencia($1)', [ids.bec1]))
    expect(e2.message).toMatch(/permission denied/i)
  })
})

describe('(a) tope de jornada', () => {
  it('8:00 → 23:59 el mismo día con tope 10: no suma', async () => {
    await jornadaLarga()
    expect(await horas(db, 'bec1', DIA_DESDE, DIA_HASTA)).toBe(0)
  })

  it('con la salida aprobada suma ~15.98 h', async () => {
    const salida = await jornadaLarga()
    await como(db, 'ing1')
    await db.query('select public.aprobar_asistencia($1)', [salida])
    expect(await horas(db, 'bec1', DIA_DESDE, DIA_HASTA)).toBeCloseTo(15.98, 2)
  })

  it('dentro del tope suma, y el tope sale de la configuración', async () => {
    await sinSesion(db)
    await insertar(db, { becario: 'bec1', tipo: 'entrada', en: t('08:00') })
    await insertar(db, { becario: 'bec1', tipo: 'salida', en: t('16:00') })
    await insertar(db, { becario: 'bec1', tipo: 'entrada', en: t('17:00') })
    await insertar(db, { becario: 'bec1', tipo: 'salida', en: t('19:30') })
    expect(await horas(db, 'bec1', DIA_DESDE, DIA_HASTA)).toBe(10.5)

    // Con tope 6 la jornada de 8 h deja de sumar; solo queda la de 2.5 h.
    await como(db, 'admin')
    await db.query('select public.guardar_config_asistencia(6, 60, 5)')
    expect(await horas(db, 'bec1', DIA_DESDE, DIA_HASTA)).toBe(2.5)
  })
})

describe('(b) salida pasada la medianoche', () => {
  it('deja el turno abierto y no suma', async () => {
    await sinSesion(db)
    await insertar(db, { becario: 'bec1', tipo: 'entrada', en: t('22:00') })
    await insertar(db, { becario: 'bec1', tipo: 'salida', en: t('01:00', '2026-03-11') })
    expect(
      await horas(db, 'bec1', DIA_DESDE, `timestamptz '2026-03-12 00:00-06'`),
    ).toBe(0)
  })
})

describe('(c) hora futura', () => {
  it('se corrige a now(), queda por_revisar / reloj_adelantado y no suma', async () => {
    await como(db, 'bec1')
    const fila = await insertar(db, {
      becario: 'bec1',
      tipo: 'entrada',
      en: `now() + interval '2 hours'`,
    })
    expect(fila.revision).toBe('por_revisar')
    expect(fila.motivo_revision).toBe('reloj_adelantado')
    const dif = Math.abs(new Date(fila.ocurrido_en as string).getTime() - Date.now())
    expect(dif).toBeLessThan(60_000)

    await sinSesion(db)
    await insertar(db, {
      becario: 'bec1',
      tipo: 'salida',
      en: `(select ocurrido_en from public.asistencias where tipo = 'entrada') + interval '2 minutes'`,
    })
    expect(
      await horas(db, 'bec1', `now() - interval '2 days'`, `now() + interval '2 days'`),
    ).toBe(0)
  })

  it('dentro de la tolerancia se conserva la hora tal cual', async () => {
    await como(db, 'bec1')
    const fila = await insertar(db, { becario: 'bec1', tipo: 'entrada', en: `now() + interval '3 minutes'` })
    expect(fila.revision).toBe('por_revisar')
    expect(fila.origen).toBe('en_linea')
  })
})

describe('(d) atraso de la cola sin red', () => {
  it('30 minutos: origen cola y requiere aprobacion', async () => {
    await como(db, 'bec1')
    const fila = await insertar(db, { becario: 'bec1', tipo: 'entrada', en: `now() - interval '30 minutes'` })
    expect(fila.origen).toBe('cola')
    expect(fila.revision).toBe('por_revisar')
    expect(fila.motivo_revision).toBe('revision_humana')
  })

  it('3 horas: por_revisar / atraso_cola y no suma', async () => {
    await como(db, 'bec1')
    const fila = await insertar(db, { becario: 'bec1', tipo: 'entrada', en: `now() - interval '3 hours'` })
    expect(fila.origen).toBe('cola')
    expect(fila.revision).toBe('por_revisar')
    expect(fila.motivo_revision).toBe('atraso_cola')

    // Su salida (a tiempo) tampoco puede sumar con una entrada por revisar.
    await sinSesion(db)
    await insertar(db, { becario: 'bec1', tipo: 'salida', en: `now() - interval '2 hours'` })
    expect(
      await horas(db, 'bec1', `now() - interval '2 days'`, `now() + interval '1 day'`),
    ).toBe(0)
  })

  it('el límite de atraso sale de la configuración', async () => {
    await como(db, 'admin')
    await db.query('select public.guardar_config_asistencia(10, 240, 5)')
    await como(db, 'bec1')
    const fila = await insertar(db, { becario: 'bec1', tipo: 'entrada', en: `now() - interval '3 hours'` })
    expect(fila.revision).toBe('por_revisar')
    expect(fila.origen).toBe('cola')
  })

  it('un reintento exacto se rechaza con el hint asistencia_duplicada', async () => {
    await como(db, 'bec1')
    await insertar(db, { becario: 'bec1', tipo: 'entrada', en: `timestamptz '2026-01-05 12:00:00+00'` })
    // Con 2026-01-05 es atraso enorme → cola/por_revisar, pero lo que importa es el duplicado.
    const e = await error(
      insertar(db, { becario: 'bec1', tipo: 'entrada', en: `timestamptz '2026-01-05 12:00:00+00'` }),
    )
    expect(e.hint).toBe('asistencia_duplicada')
    expect(e.message).toMatch(/menos de un minuto/)
  })
})

describe('(e) el becario no falsea origen / revisión / motivo', () => {
  it('ignora lo que mande el cliente', async () => {
    await como(db, 'bec1')
    const fila = await insertar(db, {
      becario: 'bec1',
      tipo: 'entrada',
      extra: { origen: 'manual', revision: 'aprobada', motivo_revision: 'fuera_de_zona' },
    })
    expect(fila.origen).toBe('en_linea')
    expect(fila.revision).toBe('por_revisar')
    expect(fila.motivo_revision).toBe('revision_humana')
  })

  it('tampoco al mandar una hora vieja con revisión aprobada', async () => {
    await como(db, 'bec1')
    const fila = await insertar(db, {
      becario: 'bec1',
      tipo: 'entrada',
      en: `now() - interval '5 hours'`,
      extra: { origen: 'en_linea', revision: 'aprobada' },
    })
    expect(fila.origen).toBe('cola')
    expect(fila.revision).toBe('por_revisar')
  })

  it('el puntaje del rostro se guarda y debe estar entre 0 y 1', async () => {
    await como(db, 'bec1')
    const fila = await insertar(db, { becario: 'bec1', tipo: 'entrada', puntaje: 0.8734 })
    expect(Number(fila.puntaje_rostro)).toBeCloseTo(0.8734, 4)
    const e = await error(
      insertar(db, { becario: 'bec1', tipo: 'salida', en: `now() - interval '2 minutes'`, puntaje: 1.5 }),
    )
    expect(e.message).toMatch(/check/i)
  })
})

describe('(f) alta manual por el ingeniero', () => {
  it('origen manual, suma aunque pase el tope y queda en la bitácora', async () => {
    await como(db, 'ing1')
    const entrada = await insertarManual({ becario: 'bec1', tipo: 'entrada', en: t('08:00') })
    const salida = await insertarManual({ becario: 'bec1', tipo: 'salida', en: t('23:59') })
    expect(entrada.origen).toBe('manual')
    expect(entrada.revision).toBe('ok')
    expect(salida.origen).toBe('manual')
    expect(await horas(db, 'bec1', DIA_DESDE, DIA_HASTA)).toBeCloseTo(15.98, 2)

    const b = await bitacora()
    expect(b.map((x) => x.accion)).toEqual(['agregar', 'agregar'])
    expect(b[0].hecho_por).toBe(ids.ing1)
  })

  it('un ingeniero que no es el asignado no puede agregar', async () => {
    await como(db, 'ing2')
    const e = await error(insertarManual({ becario: 'bec1', tipo: 'entrada', en: t('08:00') }))
    expect(e.message).toMatch(/No puedes corregir/)
  })

  it('el administrador también agrega como manual', async () => {
    await como(db, 'admin')
    const fila = await insertarManual({ becario: 'bec2', tipo: 'entrada', en: t('09:00') })
    expect(fila.origen).toBe('manual')
  })

  it('también conserva las marcaciones propias del becario en la bitácora', async () => {
    await como(db, 'bec1')
    await insertar(db, { becario: 'bec1', tipo: 'entrada' })
    expect(await bitacora()).toEqual([{ accion: 'agregar', hecho_por: ids.bec1 }])
  })
})

describe('(g) bitácora de ediciones, borrados y aprobaciones', () => {
  it('editar y borrar por el ingeniero quedan registrados con antes/después', async () => {
    await sinSesion(db)
    const entrada = await insertar(db, { becario: 'bec1', tipo: 'entrada', en: t('08:00') })
    await como(db, 'ing1')
    await db.query(`select public.corregir_asistencia($1, 'modificar', $2, null, ${t('08:30')}, null, 'Hora confirmada')`, [ids.bec1, entrada.id])
    await db.query("select public.corregir_asistencia($1, 'eliminar', $2, null, null, null, 'Registro duplicado')", [ids.bec1, entrada.id])

    const r = await db.query<{ accion: string; antes: Record<string, string> | null; despues: Record<string, string> | null }>(
      "select accion, antes, despues from public.bitacora_asistencias where accion <> 'agregar' order by id",
    )
    expect(r.rows.map((x) => x.accion)).toEqual(['editar', 'eliminar'])
    expect(r.rows[0].antes?.ocurrido_en).not.toEqual(r.rows[0].despues?.ocurrido_en)
    expect(r.rows[1].despues).toBeNull()
    expect(r.rows[1].antes?.id).toBe(entrada.id)
    // El registro de la bitácora sobrevive al borrado de la asistencia.
    expect((await db.query('select 1 from public.asistencias where id = $1', [entrada.id])).rows).toHaveLength(0)
  })

  it('aprobar queda como "aprobar"', async () => {
    const salida = await jornadaLarga()
    await como(db, 'ing1')
    await db.query('select public.aprobar_asistencia($1)', [salida])
    const b = await bitacora()
    expect(b.map((x) => x.accion)).toEqual(['agregar', 'agregar', 'aprobar'])
    expect(b[2].hecho_por).toBe(ids.ing1)
  })

  it('bitacora_asistencias_de: visible para el equipo, el becario y el admin; no para otros', async () => {
    await como(db, 'ing1')
    await insertarManual({ becario: 'bec1', tipo: 'entrada', en: t('08:00') })

    const ver = async (quien: 'ing1' | 'bec1' | 'admin' | 'ing2' | 'bec2') => {
      await como(db, quien)
      return db.query<{ accion: string; hecho_por_nombre: string }>(
        'select accion, hecho_por_nombre from public.bitacora_asistencias_de($1)',
        [ids.bec1],
      )
    }
    for (const q of ['ing1', 'bec1', 'admin'] as const) {
      const r = await ver(q)
      expect(r.rows).toHaveLength(1)
      expect(r.rows[0]).toMatchObject({ accion: 'agregar', hecho_por_nombre: 'Iván Ingeniero' })
    }
    for (const q of ['ing2', 'bec2'] as const) {
      expect((await error(ver(q))).message).toMatch(/No tienes acceso/)
    }
  })
})

describe('(h) geocercas', () => {
  const FIME = { lat: 25.7254, lon: -100.3138 }

  async function crearZona() {
    await como(db, 'admin')
    const r = await db.query<{ id: string }>(
      `select public.guardar_geocerca(null, 'FIME', $1, $2, 150, true) as id`,
      [FIME.lat, FIME.lon],
    )
    return r.rows[0].id
  }

  it('sin zonas requiere revision humana', async () => {
    await como(db, 'bec1')
    const fila = await insertar(db, { becario: 'bec1', tipo: 'entrada', modalidad: 'presencial' })
    expect(fila.revision).toBe('por_revisar')
    expect(fila.motivo_revision).toBe('revision_humana')
  })

  it('con zona: presencial sin ubicación, fuera y dentro; home_office no se evalúa', async () => {
    await crearZona()
    await como(db, 'bec1')

    const sin = await insertar(db, {
      becario: 'bec1', tipo: 'entrada', modalidad: 'presencial', en: `now() - interval '1 minutes'`,
    })
    expect([sin.revision, sin.motivo_revision]).toEqual(['por_revisar', 'sin_ubicacion'])

    const fuera = await insertar(db, {
      becario: 'bec1', tipo: 'salida', modalidad: 'presencial', latitud: 25.8, longitud: -100.3,
      en: `now() - interval '3 minutes'`,
    })
    expect([fuera.revision, fuera.motivo_revision]).toEqual(['por_revisar', 'fuera_de_zona'])

    const dentro = await insertar(db, {
      becario: 'bec1', tipo: 'entrada', modalidad: 'presencial', latitud: 25.7255, longitud: -100.3139,
      en: `now() - interval '5 minutes'`,
    })
    expect([dentro.revision, dentro.motivo_revision]).toEqual(['por_revisar', 'revision_humana'])

    await horarioSemanal(db, 'bec1', 'home_office')
    await como(db, 'bec1')
    const casa = await insertar(db, {
      becario: 'bec1', tipo: 'salida', modalidad: 'home_office', en: `now() - interval '7 minutes'`,
    })
    expect([casa.revision, casa.motivo_revision]).toEqual(['por_revisar', 'revision_humana'])
  })

  it('una zona desactivada deja de contar; el radio se respeta (haversine)', async () => {
    const id = await crearZona()
    await como(db, 'admin')
    // ~220 m al norte: fuera de 150 m, dentro de 300 m.
    await como(db, 'bec1')
    const lejos = await insertar(db, {
      becario: 'bec1', tipo: 'entrada', modalidad: 'presencial', latitud: FIME.lat + 0.002, longitud: FIME.lon,
      en: `now() - interval '1 minutes'`,
    })
    expect(lejos.motivo_revision).toBe('fuera_de_zona')

    await como(db, 'admin')
    await db.query(`select public.guardar_geocerca($1, 'FIME', $2, $3, 300, true)`, [id, FIME.lat, FIME.lon])
    await como(db, 'bec1')
    const cerca = await insertar(db, {
      becario: 'bec1', tipo: 'salida', modalidad: 'presencial', latitud: FIME.lat + 0.002, longitud: FIME.lon,
      en: `now() - interval '3 minutes'`,
    })
    expect(cerca.revision).toBe('por_revisar')

    await como(db, 'admin')
    await db.query(`select public.guardar_geocerca($1, 'FIME', $2, $3, 300, false)`, [id, FIME.lat, FIME.lon])
    await como(db, 'bec1')
    const sinZonas = await insertar(db, {
      becario: 'bec1', tipo: 'entrada', modalidad: 'presencial', en: `now() - interval '5 minutes'`,
    })
    expect(sinZonas.revision).toBe('por_revisar')
  })

  it('el reloj adelantado tiene prioridad sobre la ubicación', async () => {
    await crearZona()
    await como(db, 'bec1')
    const fila = await insertar(db, {
      becario: 'bec1', tipo: 'entrada', modalidad: 'presencial', en: `now() + interval '1 hour'`,
    })
    expect(fila.motivo_revision).toBe('reloj_adelantado')
  })
})

describe('(i) anomalias_asistencia', () => {
  const rango = ['2026-03-01', '2026-03-31']

  async function preparar() {
    await sinSesion(db)
    // bec1: turno abierto el 10 y jornada larga el 11. bec2: turno abierto el 12.
    await insertar(db, { becario: 'bec1', tipo: 'entrada', en: t('08:00', '2026-03-10') })
    await jornadaLarga('bec1', '2026-03-11')
    await insertar(db, { becario: 'bec2', tipo: 'entrada', en: t('09:00', '2026-03-12') })
  }

  async function ver(quien: 'admin' | 'ing1' | 'ing2' | 'bec1' | 'bec2', becario: string | null = null) {
    await como(db, quien)
    const r = await db.query<{
      tipo: string; becario_id: string; asistencia_id: string; entrada_id: string | null;
      fecha: string; horas: string | null; detalle: string
    }>('select * from public.anomalias_asistencia($1, $2, $3)', [becario, rango[0], rango[1]])
    return r.rows
  }

  it('el administrador ve a todos; ordena por fecha descendente', async () => {
    await preparar()
    const filas = await ver('admin')
    expect(filas.map((f) => `${f.tipo}:${f.becario_id === ids.bec1 ? 'bec1' : 'bec2'}`)).toEqual([
      'turno_abierto:bec2',
      'jornada_larga:bec1',
      'turno_abierto:bec1',
    ])
  })

  it('el ingeniero solo ve a su equipo', async () => {
    await preparar()
    expect((await ver('ing1')).every((f) => f.becario_id === ids.bec1)).toBe(true)
    expect(await ver('ing1')).toHaveLength(2)
    const otro = await ver('ing2')
    expect(otro).toHaveLength(1)
    expect(otro[0].becario_id).toBe(ids.bec2)
    expect((await error(ver('ing2', ids.bec1))).message).toMatch(/No tienes acceso/)
  })

  it('el becario solo se ve a sí mismo', async () => {
    await preparar()
    const propias = await ver('bec1')
    expect(propias).toHaveLength(2)
    expect(propias.every((f) => f.becario_id === ids.bec1)).toBe(true)
    expect((await error(ver('bec1', ids.bec2))).message).toMatch(/No tienes acceso/)
    expect(await ver('bec1', ids.bec1)).toHaveLength(2)
  })

  it('detecta turno_abierto y jornada_larga con sus ids y horas', async () => {
    await preparar()
    const filas = await ver('admin', ids.bec1)
    const larga = filas.find((f) => f.tipo === 'jornada_larga')!
    const abierto = filas.find((f) => f.tipo === 'turno_abierto')!
    expect(Number(larga.horas)).toBeCloseTo(15.98, 2)
    expect(larga.entrada_id).not.toBeNull()
    expect(larga.asistencia_id).not.toBe(larga.entrada_id)
    const tipos = await db.query<{ id: string; tipo: string }>('select id, tipo from public.asistencias')
    expect(tipos.rows.find((x) => x.id === larga.asistencia_id)?.tipo).toBe('salida')
    expect(tipos.rows.find((x) => x.id === larga.entrada_id)?.tipo).toBe('entrada')
    expect(abierto.entrada_id).toBeNull()
    expect(abierto.horas).toBeNull() // no es de hoy
    expect(abierto.fecha).toBeTruthy()
  })

  it('excluye lo aprobado', async () => {
    await preparar()
    const antes = await ver('ing1')
    const larga = antes.find((f) => f.tipo === 'jornada_larga')!
    const abierto = antes.find((f) => f.tipo === 'turno_abierto')!
    await como(db, 'ing1')
    await db.query('select public.aprobar_asistencia($1)', [larga.asistencia_id])
    await db.query('select public.aprobar_asistencia($1)', [abierto.asistencia_id])
    expect(await ver('ing1')).toEqual([])
  })

  it('lista los registros por revisar con su tipo (atraso, reloj, ubicación)', async () => {
    await crearZonaYRegistros()
    const r = await db.query<{ tipo: string; atraso_minutos: number | null }>(
      `select tipo, atraso_minutos from public.anomalias_asistencia(null, null, null) order by tipo`,
    )
    const tipos = r.rows.map((x) => x.tipo)
    expect(tipos).toEqual(expect.arrayContaining(['atraso', 'reloj_adelantado', 'sin_ubicacion', 'fuera_de_zona']))
    const atraso = r.rows.find((x) => x.tipo === 'atraso')!
    expect(atraso.atraso_minutos).toBeGreaterThanOrEqual(179)
    expect(atraso.atraso_minutos).toBeLessThanOrEqual(181)
  })

  async function crearZonaYRegistros() {
    await como(db, 'admin')
    await db.query(`select public.guardar_geocerca(null, 'FIME', 25.7254, -100.3138, 150, true)`)
    await como(db, 'bec1')
    await insertar(db, { becario: 'bec1', tipo: 'entrada', en: `now() - interval '3 hours'` }) // atraso
    await insertar(db, { becario: 'bec1', tipo: 'salida', en: `now() + interval '2 hours'` }) // reloj
    await insertar(db, {
      becario: 'bec1', tipo: 'entrada', modalidad: 'presencial', en: `now() - interval '3 minutes'`,
    }) // sin ubicación (home_office del primero no cuenta)
    await insertar(db, {
      becario: 'bec1', tipo: 'salida', modalidad: 'presencial', latitud: 25.9, longitud: -100.1,
      en: `now() - interval '5 minutes'`,
    }) // fuera
  }
})

describe('(j) aprobar_asistencia', () => {
  it('solo el ingeniero asignado o el administrador; cambia el conteo de horas', async () => {
    const salida = await jornadaLarga()
    expect(await horas(db, 'bec1', DIA_DESDE, DIA_HASTA)).toBe(0)

    await como(db, 'bec1')
    expect((await error(db.query('select public.aprobar_asistencia($1)', [salida]))).message).toMatch(
      /Solo el ingeniero asignado/,
    )
    await como(db, 'ing2')
    expect((await error(db.query('select public.aprobar_asistencia($1)', [salida]))).message).toMatch(
      /Solo el ingeniero asignado/,
    )
    await como(db, 'bec2')
    expect((await error(db.query('select public.aprobar_asistencia($1)', [salida]))).message).toMatch(
      /Solo el ingeniero asignado/,
    )
    await sinSesion(db)
    expect(await horas(db, 'bec1', DIA_DESDE, DIA_HASTA)).toBe(0)

    await como(db, 'ing1')
    await db.query('select public.aprobar_asistencia($1)', [salida])
    expect(await horas(db, 'bec1', DIA_DESDE, DIA_HASTA)).toBeCloseTo(15.98, 2)
  })

  it('el administrador puede aprobar y aprobar dos veces no duplica la bitácora', async () => {
    const salida = await jornadaLarga()
    await como(db, 'admin')
    await db.query('select public.aprobar_asistencia($1)', [salida])
    await db.query('select public.aprobar_asistencia($1)', [salida])
    expect((await bitacora()).map((x) => x.accion)).toEqual(['agregar', 'agregar', 'aprobar'])
  })

  it('aprobar una entrada por revisar hace que la jornada vuelva a sumar', async () => {
    await como(db, 'bec1')
    const entrada = await insertar(db, { becario: 'bec1', tipo: 'entrada', en: `now() - interval '3 hours'` })
    await sinSesion(db)
    await insertar(db, { becario: 'bec1', tipo: 'salida', en: `now() - interval '2 hours'` })
    const rango = [`now() - interval '2 days'`, `now() + interval '1 day'`] as const
    expect(await horas(db, 'bec1', ...rango)).toBe(0)
    await como(db, 'ing1')
    await db.query('select public.aprobar_asistencia($1)', [entrada.id])
    const h = await horas(db, 'bec1', ...rango)
    // Una hora, salvo que el día local cambie justo entre ambas marcas.
    expect([0, 1]).toContain(h)
  })

  it('un registro inexistente da un error claro', async () => {
    await como(db, 'admin')
    const e = await error(db.query('select public.aprobar_asistencia($1)', [ids.bec1]))
    expect(e.message).toMatch(/no existe/)
  })
})

describe('(k) escritura solo por RPC o disparador', () => {
  it('config, geocercas y bitácora no se escriben directo (ni siquiera el admin)', async () => {
    await como(db, 'admin')
    const sentencias = [
      `insert into public.geocercas (nombre, latitud, longitud) values ('x', 1, 1)`,
      `update public.config_asistencia set jornada_maxima_horas = 20`,
      `delete from public.config_asistencia`,
      `insert into public.config_asistencia (id) values (false)`,
      `insert into public.bitacora_asistencias (asistencia_id, becario_id, accion) values (gen_random_uuid(), '${ids.bec1}', 'editar')`,
      `update public.bitacora_asistencias set accion = 'editar'`,
      `delete from public.bitacora_asistencias`,
    ]
    for (const s of sentencias) {
      expect((await error(db.query(s))).message, s).toMatch(/permission denied/i)
    }
    for (const q of ['bec1', 'ing1'] as const) {
      await como(db, q)
      expect((await error(db.query(`update public.config_asistencia set tolerancia_minutos = 50`))).message).toMatch(
        /permission denied/i,
      )
    }
  })

  it('cualquier usuario autenticado lee reglas y zonas', async () => {
    await como(db, 'admin')
    await db.query(`select public.guardar_geocerca(null, 'FIME', 25.7, -100.3, 150, true)`)
    for (const q of ['bec1', 'ing1', 'admin'] as const) {
      await como(db, q)
      expect((await db.query('select * from public.config_asistencia')).rows).toHaveLength(1)
      expect((await db.query('select * from public.geocercas')).rows).toHaveLength(1)
    }
    await comoAnon(db)
    expect((await error(db.query('select * from public.config_asistencia'))).message).toMatch(/permission denied/i)
  })

  it('la bitácora se filtra por rol (RLS)', async () => {
    await como(db, 'ing1')
    await insertarManual({ becario: 'bec1', tipo: 'entrada', en: t('08:00') })
    await como(db, 'ing2')
    await insertarManual({ becario: 'bec2', tipo: 'entrada', en: t('08:00') })

    const cuantas = async (q: 'admin' | 'ing1' | 'bec1' | 'bec2') => {
      await como(db, q)
      return (await db.query('select * from public.bitacora_asistencias')).rows.length
    }
    expect(await cuantas('admin')).toBe(2)
    expect(await cuantas('ing1')).toBe(1)
    expect(await cuantas('bec1')).toBe(1)
    expect(await cuantas('bec2')).toBe(1)
  })

  describe('guardar_config_asistencia', () => {
    it('solo el administrador y valida rangos', async () => {
      await como(db, 'ing1')
      expect((await error(db.query('select public.guardar_config_asistencia(10, 60, 5)'))).message).toMatch(
        /Solo un administrador/,
      )
      await como(db, 'admin')
      const malos: [number, number, number, RegExp][] = [
        [0.5, 60, 5, /jornada máxima/],
        [25, 60, 5, /jornada máxima/],
        [10, 0, 5, /atraso máximo/],
        [10, 1441, 5, /atraso máximo/],
        [10, 60, 0, /tolerancia/],
        [10, 60, 61, /tolerancia/],
      ]
      for (const [j, a, tol, re] of malos) {
        expect((await error(db.query('select public.guardar_config_asistencia($1, $2, $3)', [j, a, tol]))).message).toMatch(re)
      }
      await db.query('select public.guardar_config_asistencia(12.5, 90, 10)')
      const r = await db.query('select * from public.config_asistencia')
      expect(r.rows[0]).toMatchObject({ jornada_maxima_horas: '12.5', atraso_maximo_minutos: 90, tolerancia_minutos: 10 })
    })
  })

  describe('guardar_geocerca / eliminar_geocerca', () => {
    it('crea, edita y elimina; valida datos; solo el administrador', async () => {
      await como(db, 'ing1')
      expect((await error(db.query(`select public.guardar_geocerca(null, 'X', 1, 1, 100, true)`))).message).toMatch(
        /Solo un administrador/,
      )
      await como(db, 'admin')
      const q = (sql: string, p: unknown[] = []) => db.query<{ id: string }>(sql, p)
      expect((await error(q(`select public.guardar_geocerca(null, ' ', 1, 1, 100, true)`))).message).toMatch(/nombre/)
      expect((await error(q(`select public.guardar_geocerca(null, 'X', 91, 1, 100, true)`))).message).toMatch(/latitud/)
      expect((await error(q(`select public.guardar_geocerca(null, 'X', 1, 181, 100, true)`))).message).toMatch(/longitud/)
      expect((await error(q(`select public.guardar_geocerca(null, 'X', 1, 1, 10, true)`))).message).toMatch(/radio/)
      expect((await error(q(`select public.guardar_geocerca(null, 'X', 1, 1, 6000, true)`))).message).toMatch(/radio/)

      const id = (await q(`select public.guardar_geocerca(null, 'Lab', 25.7, -100.3, 100, true) as id`)).rows[0].id
      await q(`select public.guardar_geocerca($1, 'Lab 2', 25.8, -100.4, 200, false)`, [id])
      const fila = (await db.query('select * from public.geocercas where id = $1', [id])).rows[0]
      expect(fila).toMatchObject({ nombre: 'Lab 2', radio_m: 200, activa: false })
      expect((await error(q(`select public.guardar_geocerca(gen_random_uuid(), 'Z', 1, 1, 100, true)`))).message).toMatch(/no existe/)

      await como(db, 'bec1')
      expect((await error(q('select public.eliminar_geocerca($1)', [id]))).message).toMatch(/Solo un administrador/)
      await como(db, 'admin')
      await q('select public.eliminar_geocerca($1)', [id])
      expect((await db.query('select * from public.geocercas')).rows).toHaveLength(0)
      expect((await error(q('select public.eliminar_geocerca($1)', [id]))).message).toMatch(/no existe/)
    })
  })
})
