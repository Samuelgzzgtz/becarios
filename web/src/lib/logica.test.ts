import { describe, expect, it } from 'vitest'
import { coincide, similitudCoseno } from '../facial/comparar'
import { ErrorDeNegocio, MENSAJE_SIN_CONEXION, mensajeAmigable } from './errores'
import { aInstante, diaSemana, fechaLocal, inicioDia, lunesDe, mesLargo, parsear, sumarMeses } from './fechas'
import { enRiesgo, horasPorDia, permiteSubir, siguienteTipoSegun, type Asistencia, type ProgresoBecario, type TipoAsistencia } from './modelos'

/* Mismos casos que app/src/test/.../LogicaNegocioTest.kt de la versión Android. */

const local = (fecha: string, hora: string) => aInstante(fecha, hora).toISOString()
const registro = (tipo: TipoAsistencia, iso: string): Asistencia => ({ becario_id: 'b', tipo, ocurrido_en: iso, modalidad: 'presencial' })

describe('horasPorDia', () => {
  it('C-04: una entrada olvidada no se empareja con la salida del día siguiente', () => {
    expect(horasPorDia([registro('entrada', local('2026-10-19', '09:00')), registro('salida', local('2026-10-20', '09:00'))]).size).toBe(0)
  })

  it('un turno normal suma sus horas en el día local', () => {
    const h = horasPorDia([registro('entrada', local('2026-10-20', '09:00')), registro('salida', local('2026-10-20', '13:30'))])
    expect(h.get('2026-10-20')).toBeCloseTo(4.5)
  })

  it('A-06: un turno nocturno local (día siguiente en UTC) cuenta en su día local', () => {
    const h = horasPorDia([registro('entrada', local('2026-10-20', '19:00')), registro('salida', local('2026-10-20', '22:00'))])
    expect(h.get('2026-10-20')).toBeCloseTo(3)
  })
})

describe('fechas en hora de Monterrey', () => {
  it('B-09: lee el formato de Postgres y el ISO con Z', () => {
    expect(parsear('2026-10-20T15:03:12.123456+00:00')).not.toBeNull()
    expect(parsear('2026-10-20T15:03:12Z')).not.toBeNull()
    expect(parsear('no es fecha')).toBeNull()
  })

  it('la medianoche local es 06:00 UTC (Monterrey, UTC-6)', () => {
    expect(inicioDia('2026-10-20').toISOString()).toBe('2026-10-20T06:00:00.000Z')
    expect(fechaLocal('2026-10-21T05:59:00Z')).toBe('2026-10-20')
  })

  it('semana de lunes a domingo y día de la semana como Postgres (0 = domingo)', () => {
    expect(lunesDe('2026-10-25')).toBe('2026-10-19')
    expect(lunesDe('2026-10-19')).toBe('2026-10-19')
    expect(diaSemana('2026-10-25')).toBe(0)
    expect(sumarMeses('2026-12-15', 1)).toBe('2027-01-01')
    expect(mesLargo('2026-10-01')).toBe('Octubre 2026')
  })
})

describe('reglas de negocio', () => {
  it('C-04: el siguiente registro se decide por día local', () => {
    const hoy = '2026-10-20'
    expect(siguienteTipoSegun('entrada', parsear(local('2026-10-19', '09:00')), hoy)).toBe('entrada')
    expect(siguienteTipoSegun('entrada', parsear(local('2026-10-20', '09:00')), hoy)).toBe('salida')
    expect(siguienteTipoSegun('salida', parsear(local('2026-10-20', '09:00')), hoy)).toBe('entrada')
    expect(siguienteTipoSegun(null, null, hoy)).toBe('entrada')
  })

  it('M-09: el lunes temprano (0 días laborales terminados) nadie está en riesgo', () => {
    const lunes: ProgresoBecario = {
      becario_id: 'b',
      nombre: 'N',
      matricula: 'M',
      horas_semana: 0,
      horas_mes: 0,
      horas_semestre: 0,
      meta_semanal: 20,
      meta_mensual: 80,
      meta_semestral: 480,
      dias_laborales_semana: 5,
      dias_laborales_transcurridos: 0
    }
    expect(enRiesgo(lunes)).toBe(false)
    const jueves = { ...lunes, dias_laborales_transcurridos: 3, horas_semana: 4 } // esperadas 12 h
    expect(enRiesgo(jueves)).toBe(true)
    expect(enRiesgo({ ...jueves, horas_semana: 11 })).toBe(false)
  })

  it('A-01: solo pendiente/subido admiten re-subida', () => {
    expect(permiteSubir('pendiente')).toBe(true)
    expect(permiteSubir('subido')).toBe(true)
    expect(permiteSubir('confirmado')).toBe(false)
    expect(permiteSubir('excluido')).toBe(false)
    expect(permiteSubir('sin_reporte')).toBe(false)
  })

  it('M-01: mensajes sin texto técnico', () => {
    expect(mensajeAmigable(new ErrorDeNegocio('Texto de negocio'))).toBe('Texto de negocio')
    expect(mensajeAmigable(new TypeError('Failed to fetch'))).toBe(MENSAJE_SIN_CONEXION)
    expect(mensajeAmigable(new Error('NullPointer at x.y'), 'predeterminado')).toBe('predeterminado')
  })
})

describe('comparación facial', () => {
  it('coseno: vectores iguales coinciden, ortogonales no, dimensiones distintas dan 0', () => {
    expect(similitudCoseno([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
    expect(coincide([1, 0], [0, 1])).toBe(false)
    expect(similitudCoseno([1, 2], [1, 2, 3])).toBe(0)
  })
})
