import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, Info } from 'lucide-react'

/*
 * Avisos breves ("Registro agregado", "No se pudo guardar"…), equivalentes al
 * Snackbar de Android. Viven a nivel de app, así que una pantalla puede avisar
 * y regresar a la anterior y el aviso sigue visible (auditoría B-07).
 */

type TipoAviso = 'exito' | 'error' | 'info'

interface Aviso {
  id: number
  texto: string
  tipo: TipoAviso
}

interface Avisos {
  exito: (texto: string) => void
  error: (texto: string) => void
  info: (texto: string) => void
}

const Contexto = createContext<Avisos | null>(null)

let siguienteId = 1

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Aviso[]>([])

  const mostrar = useCallback((texto: string, tipo: TipoAviso) => {
    const id = siguienteId++
    setLista((l) => [...l.slice(-2), { id, texto, tipo }])
    window.setTimeout(() => setLista((l) => l.filter((a) => a.id !== id)), tipo === 'error' ? 5000 : 3500)
  }, [])

  const valor = useMemo<Avisos>(
    () => ({
      exito: (t) => mostrar(t, 'exito'),
      error: (t) => mostrar(t, 'error'),
      info: (t) => mostrar(t, 'info')
    }),
    [mostrar]
  )

  return (
    <Contexto.Provider value={valor}>
      {children}
      {/* Flotan sobre la barra inferior: en tinta (invertidos en oscuro), con el ícono en el color del resultado. */}
      <div
        className="pointer-events-none fixed bottom-[calc(var(--barra-nav)+16px+var(--seguro-abajo))] left-1/2 z-[60] flex w-[min(92vw,480px)] -translate-x-1/2 flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {lista.map((a) => (
          <div
            key={a.id}
            className="pointer-events-auto flex items-center gap-2.5 rounded-lg bg-tinta px-4 py-3 text-sobre-tinta shadow-[0_6px_20px_rgba(0,0,0,0.18)] motion-safe:animate-[subir_var(--toast-open)_var(--ease-smooth-out)]"
          >
            {a.tipo === 'exito' ? (
              <CheckCircle2 className="size-[18px] shrink-0 text-[#7fd3a2] dark:text-[#1e7145]" aria-hidden />
            ) : a.tipo === 'error' ? (
              <CircleAlert className="size-[18px] shrink-0 text-[#f87171] dark:text-[#b91c1c]" aria-hidden />
            ) : (
              <Info className="size-[18px] shrink-0" aria-hidden />
            )}
            <span>{a.texto}</span>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  )
}

export function useAvisos(): Avisos {
  const c = useContext(Contexto)
  if (!c) throw new Error('useAvisos fuera de ProveedorAvisos')
  return c
}
