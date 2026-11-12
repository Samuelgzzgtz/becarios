import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ usuario: vi.fn(), guardar: vi.fn(), q: vi.fn() }))
vi.mock('../lib/local', () => ({ cache: { usuario: mocks.usuario, guardarUsuario: mocks.guardar } }))
vi.mock('../lib/supabase', () => ({
  q: mocks.q,
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => null }) }) }) }
}))

const perfil = (id: string) => ({ id, clerk_id: id, perfil: 'becario', estado: 'activo' })

async function sesion(id: string) {
  const m = await import('./sesion')
  m.registrarClerk({ cargado: true, userId: id, cerrarSesion: async () => {}, abrirPerfil: () => {} })
  return m
}

describe('identidad de la copia sin conexión', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('navigator', { onLine: false })
    mocks.q.mockRejectedValue(new TypeError('Failed to fetch'))
  })

  it('usa el perfil local cuando pertenece a la sesión de Clerk', async () => {
    mocks.usuario.mockResolvedValue(perfil('A'))
    const m = await sesion('A')
    await expect(m.usuarioAutenticado()).resolves.toEqual(perfil('A'))
  })

  it('rechaza la copia de otra cuenta tras cambiar de sesión', async () => {
    mocks.usuario.mockResolvedValue(perfil('A'))
    const m = await sesion('A')
    await m.usuarioAutenticado()
    m.registrarClerk({ cargado: true, userId: 'B', cerrarSesion: async () => {}, abrirPerfil: () => {} })
    await expect(m.usuarioAutenticado()).rejects.toThrow()
    expect(m.usuarioEnMemoria()).toBeNull()
  })

  it('descarta un perfil remoto que termina después de cambiar de cuenta', async () => {
    let resolver!: (u: unknown) => void
    mocks.q.mockImplementation(() => new Promise((resolve) => { resolver = resolve }))
    const m = await sesion('A')
    const pendiente = m.usuarioAutenticado()
    await vi.waitFor(() => expect(mocks.q).toHaveBeenCalled())
    m.registrarClerk({ cargado: true, userId: 'B', cerrarSesion: async () => {}, abrirPerfil: () => {} })
    resolver(perfil('A'))
    await expect(pendiente).rejects.toThrow()
    expect(mocks.guardar).not.toHaveBeenCalled()
    expect(m.usuarioEnMemoria()).toBeNull()
  })
})


it('no restaura A si la sesi?n cambia durante la lectura de la copia', async () => {
  vi.resetModules()
  vi.stubGlobal('navigator', { onLine: false })
  mocks.q.mockRejectedValue(new TypeError('Failed to fetch'))
  let resolver!: (u: unknown) => void
  mocks.usuario.mockImplementation(() => new Promise((resolve) => { resolver = resolve }))
  const m = await sesion('A')
  const pendiente = m.usuarioAutenticado()
  await vi.waitFor(() => expect(resolver).toBeDefined())
  m.registrarClerk({ cargado: true, userId: 'B', cerrarSesion: async () => {}, abrirPerfil: () => {} })
  resolver(perfil('A'))
  await expect(pendiente).rejects.toThrow()
  expect(m.usuarioEnMemoria()).toBeNull()
})

it('no publica A si la sesi?n cambia mientras se guarda el perfil', async () => {
  vi.resetModules()
  vi.stubGlobal('navigator', { onLine: true })
  mocks.q.mockResolvedValue(perfil('A'))
  let resolver!: () => void
  mocks.guardar.mockImplementation(() => new Promise<void>((resolve) => { resolver = resolve }))
  const m = await sesion('A')
  const pendiente = m.usuarioAutenticado()
  await vi.waitFor(() => expect(resolver).toBeDefined())
  m.registrarClerk({ cargado: true, userId: 'B', cerrarSesion: async () => {}, abrirPerfil: () => {} })
  resolver()
  await expect(pendiente).rejects.toThrow()
  expect(m.usuarioEnMemoria()).toBeNull()
})
