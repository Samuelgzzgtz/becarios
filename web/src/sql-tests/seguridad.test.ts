// @vitest-environment node
/// <reference types="node" />
/*
 * Migración 0023 (seguridad) sobre PGlite con todas las migraciones cargadas.
 */
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { como, crearBase, horarioSemanal, ids, insertar, reiniciarAsistencias, sembrarUsuarios, sinSesion, sub } from './soporte'

let db: PGlite

beforeAll(async () => {
  db = await crearBase()
  await sembrarUsuarios(db)
}, 120_000)

afterAll(async () => {
  await db?.close()
})

async function error(promesa: Promise<unknown>) {
  try {
    await promesa
  } catch (e) {
    return e as Error
  }
  throw new Error('Se esperaba un error')
}

async function filas(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, params)).rows
}

describe('modalidad y rostro en el registro del becario', () => {
  beforeEach(async () => {
    await reiniciarAsistencias(db)
  })

  it('sin puntaje de rostro queda por revisar', async () => {
    await como(db, 'bec1')
    const fila = await insertar(db, { becario: 'bec1', tipo: 'entrada', puntaje: null })
    expect([fila.revision, fila.motivo_revision]).toEqual(['por_revisar', 'sin_rostro'])
  })

  it('sin horario se espera presencial', async () => {
    await como(db, 'bec1')
    const casa = await insertar(db, { becario: 'bec1', tipo: 'entrada', modalidad: 'home_office' })
    expect([casa.revision, casa.motivo_revision]).toEqual(['por_revisar', 'modalidad_distinta'])
    const oficina = await insertar(db, { becario: 'bec1', tipo: 'salida', modalidad: 'presencial', en: `now() - interval '2 minutes'` })
    expect([oficina.revision, oficina.motivo_revision]).toEqual(['por_revisar', 'revision_humana'])
  })

  it('con horario home_office, presencial queda por revisar y se libra de la geocerca', async () => {
    await horarioSemanal(db, 'bec1', 'home_office')
    await como(db, 'bec1')
    const presencial = await insertar(db, { becario: 'bec1', tipo: 'entrada', modalidad: 'presencial' })
    expect([presencial.revision, presencial.motivo_revision]).toEqual(['por_revisar', 'modalidad_distinta'])
    const casa = await insertar(db, { becario: 'bec1', tipo: 'salida', modalidad: 'home_office', en: `now() - interval '2 minutes'` })
    expect([casa.revision, casa.motivo_revision]).toEqual(['por_revisar', 'revision_humana'])
  })

  it('anomalias_asistencia los lista con su detalle', async () => {
    await como(db, 'bec1')
    await insertar(db, { becario: 'bec1', tipo: 'entrada', puntaje: null })
    await insertar(db, { becario: 'bec1', tipo: 'salida', modalidad: 'home_office', en: `now() - interval '2 minutes'` })
    await como(db, 'ing1')
    const r = await filas(`select tipo, detalle from public.anomalias_asistencia(null, null, null) order by tipo`)
    expect(r).toEqual([
      { tipo: 'modalidad_distinta', detalle: 'La modalidad no coincide con el horario de ese día.' },
      { tipo: 'sin_rostro', detalle: 'Registro sin verificación facial.' },
    ])
  })
})

describe('alta desde Supabase Auth', () => {
  it('ya no existe el disparador de auth.users', async () => {
    await sinSesion(db)
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'nuevo@x.test', '{"perfil":"administrador"}')`)
    expect(await filas(`select 1 from public.usuarios where email = 'nuevo@x.test' or nombre = 'nuevo'`)).toHaveLength(0)
    expect(await filas(`select 1 from pg_proc where proname = 'manejar_nuevo_usuario'`)).toHaveLength(0)
  })
})

describe('campos protegidos de usuarios', () => {
  const original = async () => {
    await sinSesion(db)
    await db.query(
      `update public.usuarios set estado = 'activo', nombre = 'Beto Becario', coordinacion = null, email = 'bec1@fime.test', clerk_id = $2
       where id = $1`,
      [ids.bec1, sub.bec1],
    )
  }
  beforeEach(original)

  it('el usuario no cambia su clerk_id, correo ni nombre, aunque fuerce el ajuste de sincronización', async () => {
    await como(db, 'bec1')
    for (const set of [`clerk_id = 'user_otro'`, `email = 'otro@x.test'`]) {
      expect((await error(db.query(`update public.usuarios set ${set} where id = $1`, [ids.bec1]))).message).toMatch(/desde Clerk/)
    }
    expect((await error(db.query(`update public.usuarios set nombre = 'Otro' where id = $1`, [ids.bec1]))).message).toMatch(
      /Solo un administrador/,
    )
    await db.exec(`select set_config('docencheck.sincronizando_clerk', 'on', false)`)
    expect((await error(db.query(`update public.usuarios set email = 'otro@x.test' where id = $1`, [ids.bec1]))).message).toMatch(/desde Clerk/)
    await db.exec(`select set_config('docencheck.sincronizando_clerk', '', false)`)
  })

  it('un usuario activo edita lo demás; uno inactivo no edita nada', async () => {
    await como(db, 'bec1')
    expect(await filas(`update public.usuarios set coordinacion = 'Sistemas' where id = $1 returning id`, [ids.bec1])).toHaveLength(1)
    await sinSesion(db)
    await db.query(`update public.usuarios set estado = 'inactivo' where id = $1`, [ids.bec1])
    await como(db, 'bec1')
    expect(await filas(`update public.usuarios set coordinacion = 'Otra' where id = $1 returning id`, [ids.bec1])).toHaveLength(0)
  })

  it('el administrador cambia el nombre pero no el correo', async () => {
    await como(db, 'admin')
    expect(await filas(`update public.usuarios set nombre = 'Beto B.' where id = $1 returning id`, [ids.bec1])).toHaveLength(1)
    expect((await error(db.query(`update public.usuarios set email = 'otro@x.test' where id = $1`, [ids.bec1]))).message).toMatch(/desde Clerk/)
  })

  it('la sincronización de Clerk (service_role) sí actualiza correo y nombre', async () => {
    await db.exec('reset role')
    await db.exec('set role service_role')
    await db.query(
      `select public.sincronizar_usuario_clerk($1, 'nuevo.bec1@fime.test', 'Beto Nuevo', 'becario', null, null, false, null, 100, true)`,
      [sub.bec1],
    )
    await sinSesion(db)
    expect(await filas(`select email, nombre from public.usuarios where id = $1`, [ids.bec1])).toEqual([
      { email: 'nuevo.bec1@fime.test', nombre: 'Beto Nuevo' },
    ])
  })
})

describe('enlace por correo desde Clerk', () => {
  it('solo enlaza una cuenta existente si el correo está verificado', async () => {
    await sinSesion(db)
    await db.query(
      `insert into public.usuarios (email, nombre, matricula, perfil, estado) values ('legado@fime.test', 'Legado', '1999999', 'becario', 'activo')`,
    )
    const sincronizar = async (clerk: string, verificado: boolean, en: number) => {
      await db.exec('set role service_role')
      const r = await filas(
        `select public.sincronizar_usuario_clerk($1, 'Legado@fime.test', 'X', null, null, null, false, null, $2, $3) as id`,
        [clerk, en, verificado],
      )
      await sinSesion(db)
      return r[0].id as string | null
    }

    expect(await sincronizar('user_intruso', false, 100)).toBeNull()
    expect(await filas(`select 1 from public.usuarios where clerk_id = 'user_intruso'`)).toHaveLength(0)
    expect(await filas(`select clerk_id from public.usuarios where email = 'legado@fime.test'`)).toEqual([{ clerk_id: null }])

    const id = await sincronizar('user_legado', true, 100)
    expect(await filas(`select clerk_id, estado from public.usuarios where id = $1`, [id])).toEqual([
      { clerk_id: 'user_legado', estado: 'activo' },
    ])

    // Sin cuenta previa con ese correo, uno sin verificar crea una cuenta nueva sin correo y sin acceso.
    const nuevo = await sincronizar('user_nuevo', false, 100)
    expect(await filas(`select email, estado from public.usuarios where id = $1`, [nuevo])).toEqual([{ email: null, estado: 'inactivo' }])
  })
})

describe('reportes SIASE', () => {
  let mes: string

  beforeAll(async () => {
    await sinSesion(db)
    await db.exec(`update public.ventana_siase set dia_apertura = 1, dia_cierre = 31`)
    mes = (await filas(`select date_trunc('month', public.hoy_local())::date::text as mes`))[0].mes as string
  })

  it('el ingeniero y el admin no firman ni desconfirman por la API; la RPC sí firma', async () => {
    await como(db, 'bec1')
    await db.query(`insert into storage.objects (bucket_id, name) values ('siase', $1)`, [`${ids.bec1}/${mes}/ruta.pdf`])
    const [rep] = await filas(
      `insert into public.reportes_siase (becario_id, periodo_id, mes, archivo_url, estado)
       select $1, p.id, $2::date, $3, 'subido' from public.periodos_academicos p where p.activo
       returning id`,
      [ids.bec1, mes, `${ids.bec1}/${mes}/ruta.pdf`],
    )

    await como(db, 'ing1')
    const firmaFalsa = `update public.reportes_siase set estado = 'confirmado', firmado_por = $2, fecha_firma = now() where id = $1 returning id`
    expect(await filas(firmaFalsa, [rep.id, ids.ing2])).toHaveLength(0)
    expect(await filas(`select public.firmar_reportes_siase(array[$1]::uuid[]) as n`, [rep.id])).toEqual([{ n: 1 }])
    expect(await filas(`update public.reportes_siase set estado = 'subido' where id = $1 returning id`, [rep.id])).toHaveLength(0)

    await como(db, 'admin')
    expect(await filas(`update public.reportes_siase set estado = 'subido' where id = $1 returning id`, [rep.id])).toHaveLength(0)

    await sinSesion(db)
    expect(await filas(`select estado, firmado_por from public.reportes_siase where id = $1`, [rep.id])).toEqual([
      { estado: 'confirmado', firmado_por: ids.ing1 },
    ])
  })

  it('el bucket limita tamaño y tipo de archivo', async () => {
    await sinSesion(db)
    expect(await filas(`select file_size_limit, allowed_mime_types from storage.buckets where id = 'siase'`)).toEqual([
      { file_size_limit: 10485760, allowed_mime_types: ['application/pdf', 'image/*'] },
    ])
  })

  it('Storage solo acepta el mes en curso con la ventana abierta', async () => {
    const subir = async (ruta: string) => {
      await como(db, 'bec2')
      return db.query(`insert into storage.objects (bucket_id, name) values ('siase', $1)`, [ruta])
    }
    await subir(`${ids.bec2}/${mes}/reporte.pdf`)
    expect((await error(subir(`${ids.bec2}/2026-01-01/reporte.pdf`))).message).toMatch(/row-level security/)
    expect((await error(subir(`${ids.bec1}/${mes}/reporte.pdf`))).message).toMatch(/row-level security/)

    await sinSesion(db)
    // Ventana de un solo día que no es hoy.
    await db.exec(`
      update public.ventana_siase
      set dia_apertura = extract(day from public.hoy_local())::int % 28 + 1,
          dia_cierre = extract(day from public.hoy_local())::int % 28 + 1`)
    expect((await error(subir(`${ids.bec2}/${mes}/otro.pdf`))).message).toMatch(/row-level security/)
    await sinSesion(db)
    await db.exec(`update public.ventana_siase set dia_apertura = 1, dia_cierre = 31`)
  })
})

describe('ingenieros visibles', () => {
  it('un ingeniero inactivo ya no lista a los demás ingenieros', async () => {
    const ver = async () => {
      await como(db, 'ing1')
      return (await filas(`select id from public.usuarios where perfil = 'ingeniero' order by id`)).map((f) => f.id)
    }
    expect(await ver()).toEqual([ids.ing1, ids.ing2])
    await sinSesion(db)
    await db.query(`update public.usuarios set estado = 'inactivo' where id = $1`, [ids.ing1])
    expect(await ver()).toEqual([ids.ing1])
    await sinSesion(db)
    await db.query(`update public.usuarios set estado = 'activo' where id = $1`, [ids.ing1])
  })
})
