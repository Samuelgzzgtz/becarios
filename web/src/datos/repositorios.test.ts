import { describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => ({ createSignedUrl: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: { storage: { from: () => storage } }, q: vi.fn(), ejecutar: vi.fn()
}))

import { campoCsv, urlParaVer } from './repositorios'

describe('salidas hacia aplicaciones externas', () => {
  it.each(['=1+1', '+cmd', '-1+1', '@SUM(A1)', ' \t\u0000=1', '\r=1', '\n=1'])('neutraliza la fórmula %j', (valor) => {
    const campo = campoCsv(valor)
    expect(campo.startsWith("'") || campo.startsWith('"\'')).toBe(true)
  })

  it('conserva texto y escapa comillas, comas y saltos', () => {
    expect(campoCsv('Samuel')).toBe('Samuel')
    expect(campoCsv('A,"B"\nC')).toBe('"A,""B""\nC"')
  })

  it('rechaza enlaces externos antes de pedir una firma de Storage', async () => {
    await expect(urlParaVer('https://attacker.invalid/login')).rejects.toThrow(/ruta/)
    expect(storage.createSignedUrl).not.toHaveBeenCalled()
  })
})
