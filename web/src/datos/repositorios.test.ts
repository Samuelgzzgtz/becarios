import { describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => ({ createSignedUrl: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: { storage: { from: () => storage } }, q: vi.fn(), ejecutar: vi.fn()
}))

import { campoCsv, esPdf, urlParaVer } from './repositorios'

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

describe('reporte SIASE', () => {
  it('solo acepta archivos que de verdad son PDF', async () => {
    expect(await esPdf(new Blob(['%PDF-1.7 resto del archivo'], { type: 'application/pdf' }))).toBe(true)
    // Una foto renombrada a .pdf trae otro contenido aunque diga application/pdf.
    expect(await esPdf(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00])], { type: 'application/pdf' }))).toBe(false)
    expect(await esPdf(new Blob([]))).toBe(false)
  })
})
