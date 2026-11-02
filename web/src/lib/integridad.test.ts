import { describe, expect, it } from 'vitest'
import { aInstante } from './fechas'
import {
  JORNADA_MAXIMA_POR_OMISION,
  horasPorDia,
  normalizarPuntaje,
  totalHoras,
  type Asistencia,
  type OrigenAsistencia,
  type RevisionAsistencia,
  type TipoAsistencia
} from './modelos'
import { validarReglas, validarZona } from './validacion'

/* Mismas reglas que horas_trabajadas() de la migración 0021 (docs/integridad-horas.md). */

const local = (fecha: string, hora: string) => aInstante(fecha, hora).toISOString()
const reg = (tipo: TipoAsistencia, fecha: string, hora: string, extra: { revision?: RevisionAsistencia; origen?: OrigenAsistencia } = {}): Asistencia => ({
  becario_id: 'b',
  tipo,
  ocurrido_en: local(fecha, hora),
  modalidad: 'presencial',
  ...extra
})
const dia = '2026-10-20'

describe('horasPorDia con las reglas de integridad (0021)', () => {
  it('por omisión el tope es 10 h', () => {
    expect(JORNADA_MAXIMA_POR_OMISION).toBe(10)
    expect(horasPorDia([reg('entrada', dia, '08:00'), reg('salida', dia, '18:00')]).get(dia)).toBeCloseTo(10)
    expect(horasPorDia([reg('entrada', dia, '07:00'), reg('salida', dia, '18:00')]).size).toBe(0)
  })

  it('una jornada que pasa el tope no suma', () => {
    expect(horasPorDia([reg('entrada', dia, '06:00'), reg('salida', dia, '20:00')], 10).size).toBe(0)
  })

  it('el tope viene de la configuración', () => {
    const par = [reg('entrada', dia, '06:00'), reg('salida', dia, '20:00')]
    expect(horasPorDia(par, 14).get(dia)).toBeCloseTo(14)
    expect(horasPorDia(par, 12).size).toBe(0)
    expect(totalHoras(par, 14)).toBeCloseTo(14)
    expect(totalHoras(par, 12)).toBe(0)
  })

  it('una salida aprobada suma aunque pase el tope', () => {
    const h = horasPorDia([reg('entrada', dia, '06:00'), reg('salida', dia, '20:00', { revision: 'aprobada' })])
    expect(h.get(dia)).toBeCloseTo(14)
  })

  it('una salida manual (agregada por ingeniero) suma aunque pase el tope', () => {
    const h = horasPorDia([reg('entrada', dia, '06:00'), reg('salida', dia, '20:00', { origen: 'manual' })])
    expect(h.get(dia)).toBeCloseTo(14)
  })

  it('que la ENTRADA sea manual o aprobada no basta: manda la salida', () => {
    expect(horasPorDia([reg('entrada', dia, '06:00', { origen: 'manual' }), reg('salida', dia, '20:00')]).size).toBe(0)
    expect(horasPorDia([reg('entrada', dia, '06:00', { revision: 'aprobada' }), reg('salida', dia, '20:00')]).size).toBe(0)
  })

  it('omite el par si la entrada o la salida están por revisar', () => {
    expect(horasPorDia([reg('entrada', dia, '09:00', { revision: 'por_revisar' }), reg('salida', dia, '13:00')]).size).toBe(0)
    expect(horasPorDia([reg('entrada', dia, '09:00'), reg('salida', dia, '13:00', { revision: 'por_revisar' })]).size).toBe(0)
  })

  it('por revisar gana sobre manual', () => {
    const h = horasPorDia([reg('entrada', dia, '09:00'), reg('salida', dia, '13:00', { origen: 'manual', revision: 'por_revisar' })])
    expect(h.size).toBe(0)
  })

  it('un par omitido no arrastra a los demás: el emparejamiento sigue siendo con la salida inmediata', () => {
    const h = horasPorDia([
      reg('entrada', dia, '08:00', { revision: 'por_revisar' }),
      reg('salida', dia, '10:00'),
      reg('entrada', dia, '11:00'),
      reg('salida', dia, '13:00')
    ])
    expect(h.get(dia)).toBeCloseTo(2)
  })

  it('mantiene la regla del mismo día local', () => {
    expect(horasPorDia([reg('entrada', '2026-10-19', '20:00'), reg('salida', dia, '02:00', { origen: 'manual' })]).size).toBe(0)
  })

  it('suma varios turnos del mismo día y no depende del orden de la lista', () => {
    const h = horasPorDia([reg('salida', dia, '17:00'), reg('entrada', dia, '14:00'), reg('salida', dia, '12:00'), reg('entrada', dia, '09:00')])
    expect(h.get(dia)).toBeCloseTo(6)
  })

  it('sin campos nuevos (registros viejos o de la cola) se comporta como antes', () => {
    expect(horasPorDia([reg('entrada', dia, '09:00'), reg('salida', dia, '13:30')]).get(dia)).toBeCloseTo(4.5)
  })
})

describe('normalizarPuntaje', () => {
  it('limita a 0..1 y a 4 decimales (numeric(5,4))', () => {
    expect(normalizarPuntaje(0.123456)).toBe(0.1235)
    expect(normalizarPuntaje(1.2)).toBe(1)
    expect(normalizarPuntaje(-0.3)).toBe(0)
  })
  it('sin valor o no numérico es null', () => {
    expect(normalizarPuntaje(null)).toBeNull()
    expect(normalizarPuntaje(undefined)).toBeNull()
    expect(normalizarPuntaje(Number.NaN)).toBeNull()
  })
})

describe('validación de reglas y zonas', () => {
  it('reglas válidas', () => {
    const r = validarReglas({ jornada: '9,5', atraso: '60', tolerancia: '5' })
    expect(r.errores).toEqual({})
    expect(r.jornada).toBe(9.5)
  })
  it('marca cada campo fuera de rango', () => {
    const r = validarReglas({ jornada: '25', atraso: '0', tolerancia: '61' })
    expect(Object.keys(r.errores).sort()).toEqual(['atraso', 'jornada', 'tolerancia'])
  })
  it('rechaza decimales de más y texto', () => {
    expect(validarReglas({ jornada: '9.55', atraso: '60', tolerancia: '5' }).errores.jornada).toBeDefined()
    expect(validarReglas({ jornada: 'abc', atraso: '6.5', tolerancia: '' }).errores).toHaveProperty('tolerancia')
  })
  it('zona válida y límites del radio y de las coordenadas', () => {
    expect(validarZona({ nombre: 'FIME', radio: '150', latitud: '25.725', longitud: '-100.313' }).errores).toEqual({})
    const e = validarZona({ nombre: ' ', radio: '10', latitud: '91', longitud: '-181' }).errores
    expect(Object.keys(e).sort()).toEqual(['latitud', 'longitud', 'nombre', 'radio'])
    expect(validarZona({ nombre: 'x', radio: '5001', latitud: '0', longitud: '0' }).errores.radio).toBeDefined()
  })
})
