/**
 * Ubicación del navegador (navigator.geolocation). Se usa en dos lugares:
 *  - al registrar asistencia: es OPCIONAL, nunca bloquea ni falla el registro;
 *  - en Configuración, para llenar una zona con "Usar mi ubicación actual".
 */

export interface Coordenadas {
  latitud: number
  longitud: number
}

/** Espera máxima al registrar asistencia (el aviso de permiso del navegador también cuenta). */
export const ESPERA_UBICACION_MS = 8000

export type MotivoSinUbicacion = 'no_disponible' | 'denegada' | 'tiempo' | 'error'

export class ErrorUbicacion extends Error {
  readonly motivo: MotivoSinUbicacion
  constructor(motivo: MotivoSinUbicacion) {
    super(textoMotivo(motivo))
    this.name = 'ErrorUbicacion'
    this.motivo = motivo
  }
}

function textoMotivo(m: MotivoSinUbicacion): string {
  switch (m) {
    case 'no_disponible':
      return 'Este dispositivo o navegador no permite obtener la ubicación.'
    case 'denegada':
      return 'No diste permiso para usar tu ubicación. Actívalo en los permisos del navegador e intenta de nuevo.'
    case 'tiempo':
      return 'No se pudo obtener tu ubicación a tiempo. Revisa que el GPS esté activo e intenta de nuevo.'
    default:
      return 'No se pudo obtener tu ubicación.'
  }
}

/** Los grados con 6 decimales (~10 cm) son lo que guarda la base (numeric(9,6)). */
export const redondearGrados = (g: number) => Math.round(g * 1e6) / 1e6

/**
 * Pide la ubicación con precisión normal. Rechaza con ErrorUbicacion; además de
 * la espera del navegador (que no cuenta el tiempo del aviso de permiso) pone su
 * propio reloj, para no quedarse esperando indefinidamente.
 */
export function leerUbicacion(esperaMs = ESPERA_UBICACION_MS): Promise<Coordenadas> {
  return new Promise((resolver, rechazar) => {
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined
    if (!geo) {
      rechazar(new ErrorUbicacion('no_disponible'))
      return
    }
    let listo = false
    const terminar = (f: () => void) => {
      if (listo) return
      listo = true
      window.clearTimeout(reloj)
      f()
    }
    const reloj = window.setTimeout(() => terminar(() => rechazar(new ErrorUbicacion('tiempo'))), esperaMs)
    try {
      geo.getCurrentPosition(
        (p) =>
          terminar(() =>
            resolver({ latitud: redondearGrados(p.coords.latitude), longitud: redondearGrados(p.coords.longitude) })
          ),
        (e) =>
          terminar(() =>
            rechazar(new ErrorUbicacion(e.code === e.PERMISSION_DENIED ? 'denegada' : e.code === e.TIMEOUT ? 'tiempo' : 'error'))
          ),
        { enableHighAccuracy: false, timeout: esperaMs, maximumAge: 60_000 }
      )
    } catch {
      terminar(() => rechazar(new ErrorUbicacion('error')))
    }
  })
}

/** Como [leerUbicacion], pero sin fallar nunca: null si se negó, tardó o no hay GPS. */
export async function ubicacionOpcional(esperaMs = ESPERA_UBICACION_MS): Promise<Coordenadas | null> {
  try {
    return await leerUbicacion(esperaMs)
  } catch {
    return null
  }
}
