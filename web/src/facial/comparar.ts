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

/** Promedio de los embeddings de las fotos de enrolamiento. */
export function promediar(embeddings: ArrayLike<number>[]): number[] {
  const dimension = embeddings[0].length
  const promedio = new Array<number>(dimension).fill(0)
  for (const e of embeddings) for (let i = 0; i < dimension; i++) promedio[i] += e[i]
  return promedio.map((v) => v / embeddings.length)
}

/** Debajo del umbral pero cerca: casi siempre es luz, ángulo o lentes, no otra persona. */
export const MARGEN_CASI = 0.1

/** Lo mínimo de rostro.ts que necesita verificar (sin cargar MediaPipe). */
export type Deteccion = { tipo: 'rostro'; embedding: ArrayLike<number> } | { tipo: 'sin_rostro' | 'varios_rostros' | 'demasiado_pequeno' }

export type Verificacion =
  | { tipo: 'coincide' | 'no_coincide'; similitud: number }
  | { tipo: 'sin_rostro' | 'varios_rostros' | 'demasiado_pequeno' | 'incompatible' }

/**
 * Analiza hasta [intentos] cuadros seguidos y se queda con el mejor: un parpadeo o
 * una foto movida ya no rechazan al becario. [analizar] toma un cuadro nuevo y
 * devuelve sus variantes (rostro.ts: derecho y girado). Para en cuanto una coincide.
 */
export async function verificar(
  analizar: () => Promise<Deteccion[]>,
  guardado: ArrayLike<number>,
  intentos = 3,
  pausa: () => Promise<void> = () => new Promise((r) => setTimeout(r, 250))
): Promise<Verificacion> {
  let mejor: number | null = null
  let fallo: Verificacion = { tipo: 'sin_rostro' }
  for (let i = 0; i < intentos; i++) {
    if (i > 0) await pausa()
    for (const r of await analizar()) {
      if (r.tipo !== 'rostro') {
        fallo = { tipo: r.tipo }
        continue
      }
      if (!dimensionesCompatibles(r.embedding, guardado)) return { tipo: 'incompatible' }
      const s = similitudCoseno(r.embedding, guardado)
      if (s >= UMBRAL_COINCIDENCIA) return { tipo: 'coincide', similitud: s }
      mejor = Math.max(mejor ?? s, s)
    }
  }
  return mejor != null ? { tipo: 'no_coincide', similitud: mejor } : fallo
}
