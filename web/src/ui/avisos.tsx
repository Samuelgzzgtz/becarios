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

const TONOS: Record<TipoAviso, string> = { exito: 'tono-exito', error: 'tono-peligro', info: 'tono-info' }

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
      <div className="avisos" role="status" aria-live="polite">
        {lista.map((a) => (
          <div key={a.id} className={`aviso ${TONOS[a.tipo]}`}>
            {a.tipo === 'exito' ? <CheckCircle2 size={20} /> : a.tipo === 'error' ? <CircleAlert size={20} /> : <Info size={20} />}
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
