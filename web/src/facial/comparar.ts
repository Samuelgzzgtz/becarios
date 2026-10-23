/**
 * Calibrado con retratos reales y el recorte de rostro.ts (web/README.md):
 * la misma persona dio ≥ 0.62 aun con fotos de años distintos y personas
 * diferentes ≤ 0.35 (0.55 queda a la mitad). Android usaba 0.75 con el recorte de ML Kit; con el de
 * MediaPipe ese valor rechazaría a becarios legítimos. Conviene revisarlo con
 * fotos del equipo después de las primeras semanas de uso.
 */
export const UMBRAL_COINCIDENCIA = 0.55

/** Si el modelo cambió de dimensión desde el enrolamiento, los vectores no son comparables (A-11). */
export function dimensionesCompatibles(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  return a.length > 0 && a.length === b.length
}

export function similitudCoseno(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (!dimensionesCompatibles(a, b)) return 0
  let punto = 0
  let normaA = 0
  let normaB = 0
  for (let i = 0; i < a.length; i++) {
    punto += a[i] * b[i]
    normaA += a[i] * a[i]
    normaB += b[i] * b[i]
  }
  if (normaA === 0 || normaB === 0) return 0
  return punto / (Math.sqrt(normaA) * Math.sqrt(normaB))
}

export function coincide(capturado: ArrayLike<number>, guardado: ArrayLike<number>): boolean {
  return similitudCoseno(capturado, guardado) >= UMBRAL_COINCIDENCIA
}
