// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { como, crearBase, ids, insertar, leerMigraciones, sembrarUsuarios, sinSesion, sub } from './soporte'

let db: PGlite
beforeAll(async () => { db = await crearBase(); await sembrarUsuarios(db) }, 120_000)
afterAll(async () => { await db?.close() })

it('0024 conserva las bajas históricas hasta reactivarlas explícitamente por RPC', async () => {
  const historica = await crearBase('0023')
  try {
    await sembrarUsuarios(historica)
    await como(historica, 'admin')
    await historica.query(`select public.cambiar_estado_usuario($1, 'inactivo')`, [ids.bec1])
    await historica.query(`select public.cambiar_estado_usuario($1, 'egresado')`, [ids.bec2])
    await sinSesion(historica)
    for (const m of leerMigraciones().filter((m) => m.archivo.startsWith('0024_'))) {
      await historica.exec(m.sql)
    }

    for (const [quien, estado] of [['bec1', 'inactivo'], ['bec2', 'egresado']] as const) {
      await sinSesion(historica)
      await historica.query(`select public.sincronizar_usuario_clerk($1, null, 'Actualizado', 'becario', null, null, false, null, 100, true)`, [sub[quien]])
      expect((await historica.query(`select estado, estado_local from public.usuarios where id=$1`, [ids[quien]])).rows)
        .toEqual([{ estado, estado_local: estado }])
      await como(historica, quien)
      expect((await historica.query(`select public.usuario_activo() as activo`)).rows).toEqual([{ activo: false }])
      await expect(insertar(historica, { becario: quien, tipo: 'entrada' })).rejects.toThrow()

      await como(historica, 'admin')
      await historica.query(`select public.cambiar_estado_usuario($1, 'activo')`, [ids[quien]])
      await sinSesion(historica)
      await historica.query(`select public.sincronizar_usuario_clerk($1, null, 'Actualizado', 'becario', null, null, false, null, 200, true)`, [sub[quien]])
      expect((await historica.query(`select estado, estado_local from public.usuarios where id=$1`, [ids[quien]])).rows)
        .toEqual([{ estado: 'activo', estado_local: null }])
      await como(historica, quien)
      expect((await historica.query(`select public.usuario_activo() as activo`)).rows).toEqual([{ activo: true }])
      expect(await insertar(historica, { becario: quien, tipo: 'entrada' })).toMatchObject({ becario_id: ids[quien] })
    }
  } finally {
    await historica.close()
  }
}, 120_000)

it('puntajes inventados y columnas de confianza no eluden la aprobación humana', async () => {
  await como(db, 'bec1')
  const entrada = await insertar(db, { becario: 'bec1', tipo: 'entrada', puntaje: 0, en: "now() - interval '2 minutes'", extra: { revision: 'aprobada', origen: 'manual' } })
  const salida = await insertar(db, { becario: 'bec1', tipo: 'salida', puntaje: 1 })
  expect([entrada.revision, salida.revision]).toEqual(['por_revisar', 'por_revisar'])
  expect(entrada.motivo_revision).toBe('revision_humana')
  expect((await db.query(`select public.horas_trabajadas($1, now() - interval '1 day', now() + interval '1 day') as h`, [ids.bec1])).rows).toEqual([{ h: '0.00' }])
  await como(db, 'ing1')
  await db.query(`select public.aprobar_asistencia($1)`, [entrada.id])
  await db.query(`select public.aprobar_asistencia($1)`, [salida.id])
  expect(Number((await db.query<{ h: string }>(`select public.horas_trabajadas($1, now() - interval '1 day', now() + interval '1 day') as h`, [ids.bec1])).rows[0].h)).toBeGreaterThan(0)
})

it('la baja local sobrevive al webhook; Ban y Unban siguen funcionando sin baja local', async () => {
  await como(db, 'admin')
  await db.query(`select public.cambiar_estado_usuario($1, 'inactivo')`, [ids.bec1])
  const sincronizar = async (bloqueado: boolean, en: number) => {
    await sinSesion(db)
    await db.query(`select public.sincronizar_usuario_clerk($1, null, 'Actualizado', 'becario', null, null, $2, null, $3, true)`, [sub.bec1, bloqueado, en])
    return (await db.query<{ estado: string }>(`select estado from public.usuarios where id=$1`, [ids.bec1])).rows[0].estado
  }
  expect(await sincronizar(false, 100)).toBe('inactivo')
  await como(db, 'admin')
  await db.query(`select public.cambiar_estado_usuario($1, 'activo')`, [ids.bec1])
  expect(await sincronizar(true, 200)).toBe('inactivo')
  expect(await sincronizar(false, 300)).toBe('activo')
})

it('solo permite crear transferencias pendientes sin atribuir resolución y resolver mediante RPC', async () => {
  await como(db, 'ing1')
  const sql = `insert into public.transferencias (becario_id, ingeniero_origen, ingeniero_destino, motivo, estado, resuelta_por) values ($1,$2,$3,'Solicitud de prueba',$4,$5) returning id`
  for (const [estado, resolutor] of [['aprobada', ids.admin], ['pendiente', ids.admin]]) {
    await expect(db.query(sql, [ids.bec1, ids.ing1, ids.ing2, estado, resolutor])).rejects.toThrow(/row-level security/)
  }
  const solicitud = (await db.query<{ id: string }>(sql, [ids.bec1, ids.ing1, ids.ing2, 'pendiente', null])).rows[0]
  await como(db, 'admin')
  expect((await db.query(`update public.transferencias set estado='aprobada' where id=$1 returning id`, [solicitud.id])).rows).toHaveLength(0)
  await db.query(`select public.resolver_transferencia($1, false)`, [solicitud.id])
  expect((await db.query(`select estado, resuelta_por from public.transferencias where id=$1`, [solicitud.id])).rows).toEqual([{ estado: 'rechazada', resuelta_por: ids.admin }])
})

it('SIASE exige ruta propia del mes y objeto existente; no permite sobrescribir objetos', async () => {
  await sinSesion(db)
  await db.exec(`update public.ventana_siase set dia_apertura=1, dia_cierre=31`)
  const mes = (await db.query<{ mes: string }>(`select date_trunc('month',public.hoy_local())::date::text as mes`)).rows[0].mes
  await como(db, 'bec1')
  const crear = (ruta: string) => db.query(`insert into public.reportes_siase (becario_id, periodo_id, mes, archivo_url, estado) select $1,id,$2::date,$3,'subido' from public.periodos_academicos where activo`, [ids.bec1, mes, ruta])
  for (const ruta of ['https://attacker.invalid/a', `${ids.bec2}/${mes}/a.pdf`, `${ids.bec1}/2020-01-01/a.pdf`, `${ids.bec1}/${mes}/../a.pdf`]) {
    await expect(crear(ruta)).rejects.toThrow(/pertenecer/)
  }
  const ruta = `${ids.bec1}/${mes}/a.pdf`
  await expect(crear(ruta)).rejects.toThrow(/no existe/)
  await db.query(`insert into storage.objects (bucket_id,name) values ('siase',$1)`, [ruta])
  await crear(ruta)
  expect((await db.query(`update storage.objects set name=$1 where name=$1 returning id`, [ruta])).rows).toHaveLength(0)
})
