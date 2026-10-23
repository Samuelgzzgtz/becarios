import { useCallback, useEffect, useRef, useState } from 'react'
import { mensajeAmigable } from '../lib/errores'

/** Estado de una carga: lo mismo que UiState de la app Android. */
export type Estado<T> = { tipo: 'cargando' } | { tipo: 'error'; mensaje: string } | { tipo: 'listo'; datos: T }

/**
 * Carga datos al montar y cuando cambian [deps]. Al recargar conserva los datos
 * ya mostrados (no vuelve al esqueleto), y descarta respuestas viejas si se
 * pidió otra carga mientras tanto.
 */
export function useCarga<T>(cargar: () => Promise<T>, deps: readonly unknown[], mensajeError: string) {
  const [estado, setEstado] = useState<Estado<T>>({ tipo: 'cargando' })
  const turno = useRef(0)
  const cargarRef = useRef(cargar)
  cargarRef.current = cargar

  const recargar = useCallback(
    (reiniciar = false) => {
      const mio = ++turno.current
      setEstado((e) => (reiniciar || e.tipo !== 'listo' ? { tipo: 'cargando' } : e))
      cargarRef
        .current()
        .then((datos) => {
          if (turno.current === mio) setEstado({ tipo: 'listo', datos })
        })
        .catch((e) => {
          if (turno.current === mio) setEstado({ tipo: 'error', mensaje: mensajeAmigable(e, mensajeError) })
        })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mensajeError]
  )

  useEffect(() => {
    recargar(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  /** Cambia los datos ya cargados sin volver a pedirlos (p. ej. tras guardar un cambio). */
  const actualizar = useCallback((f: (datos: T) => T) => {
    setEstado((e) => (e.tipo === 'listo' ? { tipo: 'listo', datos: f(e.datos) } : e))
  }, [])

  const datos = estado.tipo === 'listo' ? estado.datos : undefined
  return { estado, datos, recargar: () => recargar(false), actualizar }
}

/** Vuelve a cargar al regresar a la app (equivalente a RecargarAlReanudar, auditoría A-07). */
export function useAlReanudar(accion: () => void) {
  const ref = useRef(accion)
  ref.current = accion
  useEffect(() => {
    const alCambiar = () => {
      if (document.visibilityState === 'visible') ref.current()
    }
    document.addEventListener('visibilitychange', alCambiar)
    return () => document.removeEventListener('visibilitychange', alCambiar)
  }, [])
}

/** Evita el doble toque: ejecuta la acción solo si no hay otra en curso (auditoría C-03). */
export function useUnaVez() {
  const [ocupado, setOcupado] = useState(false)
  const enCurso = useRef(false)
  const ejecutar = useCallback(async (accion: () => Promise<void>) => {
    if (enCurso.current) return
    enCurso.current = true
    setOcupado(true)
    try {
      await accion()
    } finally {
      enCurso.current = false
      setOcupado(false)
    }
  }, [])
  return { ocupado, ejecutar }
}

export function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine)
  useEffect(() => {
    const si = () => setEnLinea(true)
    const no = () => setEnLinea(false)
    window.addEventListener('online', si)
    window.addEventListener('offline', no)
    return () => {
      window.removeEventListener('online', si)
      window.removeEventListener('offline', no)
    }
  }, [])
  return enLinea
}
