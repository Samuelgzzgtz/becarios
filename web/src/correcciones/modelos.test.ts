import { describe, expect, it } from 'vitest'
import { esMarcacionDiferida, validarPropuesta, type PropuestaCorreccion } from './modelos'

const propuesta: PropuestaCorreccion = { accion: 'agregar', asistenciaId: null, antes: null, tipo: 'salida', ocurridoEn: '2026-10-20T18:00:00Z', modalidad: 'presencial', motivo: 'Olvidé registrar mi salida.' }
const ahora = new Date('2026-10-21T18:00:00Z')

describe('solicitudes de corrección', () => {
  it('acepta una omisión pasada con motivo', () => expect(validarPropuesta(propuesta, ahora)).toBeNull())
  it('impide fechas futuras e inválidas antes de enviar', () => {
    expect(validarPropuesta({ ...propuesta, ocurridoEn: '2026-10-22T18:00:00Z' }, ahora)).toMatch(/futuro/)
    expect(validarPropuesta({ ...propuesta, ocurridoEn: '' }, ahora)).toMatch(/válidas/)
  })
  it('exige identificar el registro para modificarlo o eliminarlo', () => {
    expect(validarPropuesta({ ...propuesta, accion: 'modificar' }, ahora)).toMatch(/Elige el registro/)
    expect(validarPropuesta({ ...propuesta, accion: 'eliminar' }, ahora)).toMatch(/Elige el registro/)
  })
  it('permite solicitar eliminación sin introducir otra fecha', () => {
    expect(validarPropuesta({ ...propuesta, accion: 'eliminar', asistenciaId: 'registro', ocurridoEn: '' }, ahora)).toBeNull()
  })
  it('rechaza motivos vacíos o superiores al límite del servidor', () => {
    expect(validarPropuesta({ ...propuesta, motivo: '     ' }, ahora)).toMatch(/motivo/)
    expect(validarPropuesta({ ...propuesta, motivo: 'x'.repeat(501) }, ahora)).toMatch(/500/)
  })
  it('distingue recepción diferida sin asumir su causa', () => {
    expect(esMarcacionDiferida({ ocurrido_en: '2026-10-20T18:00:00Z', created_at: '2026-10-20T18:10:00Z' })).toBe(true)
    expect(esMarcacionDiferida({ ocurrido_en: '2026-10-20T18:00:00Z', created_at: '2026-10-20T18:00:30Z' })).toBe(false)
    expect(esMarcacionDiferida(null)).toBe(false)
  })
})
