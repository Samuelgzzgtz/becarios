package com.fime.docencheck.facial

import kotlin.math.sqrt

/**
 * Umbral sin calibrar: 0.75 es un punto de partida razonable para embeddings
 * tipo MobileFaceNet normalizados, pero hay que ajustarlo con fotos reales del
 * equipo antes de usarlo en producción (falsos positivos/negativos dependen
 * del modelo exacto que se copie a assets/).
 */
const val UMBRAL_COINCIDENCIA = 0.75f

object FaceMatcher {

    /**
     * Si el modelo cambió de dimensión desde que se enroló al becario, los vectores
     * no son comparables: antes esto lanzaba (require) y tumbaba la app (A-11).
     * Quien llama debe revisarlo antes y pedir un re-enrolamiento.
     */
    fun dimensionesCompatibles(a: FloatArray, b: List<Float>): Boolean = a.isNotEmpty() && a.size == b.size

    fun similitudCoseno(a: FloatArray, b: List<Float>): Float {
        if (!dimensionesCompatibles(a, b)) return 0f

        var puntoPunto = 0f
        var normaA = 0f
        var normaB = 0f
        for (i in a.indices) {
            val vb = b[i]
            puntoPunto += a[i] * vb
            normaA += a[i] * a[i]
            normaB += vb * vb
        }
        if (normaA == 0f || normaB == 0f) return 0f
        return puntoPunto / (sqrt(normaA) * sqrt(normaB))
    }

    fun coincide(capturado: FloatArray, guardado: List<Float>): Boolean =
        similitudCoseno(capturado, guardado) >= UMBRAL_COINCIDENCIA
}
