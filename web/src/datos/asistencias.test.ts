import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: {}, q: vi.fn(), ejecutar: vi.fn() }))
vi.mock('./sesion', () => ({ usuarioAutenticado: vi.fn() }))

import { nuevoId } from './asistencias'

describe('nuevoId', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sin crypto.randomUUID (Safari < 15.4) arma un UUID v4 con getRandomValues', () => {
    vi.stubGlobal('crypto', { getRandomValues: (b: Uint8Array) => b.fill(0xff) })
    expect(nuevoId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
  })
})
