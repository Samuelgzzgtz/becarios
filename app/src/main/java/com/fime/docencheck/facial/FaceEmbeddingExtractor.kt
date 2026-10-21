package com.fime.docencheck.facial

import android.graphics.Bitmap
import android.graphics.Rect
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import kotlinx.coroutines.tasks.await

sealed class ResultadoDeteccion {
    data class Rostro(val embedding: FloatArray) : ResultadoDeteccion()
    data object SinRostro : ResultadoDeteccion()
    data object VariosRostros : ResultadoDeteccion()
    data object RostroDemasiadoPequeno : ResultadoDeteccion()
}

/**
 * Detecta el rostro en la foto (ML Kit), lo recorta, y le pide a
 * [FaceEmbeddingModel] el vector de características (TensorFlow Lite).
 * No decide si es la persona correcta: eso lo hace [FaceMatcher] comparando
 * contra el embedding guardado en enrolamientos_faciales.
 */
class FaceEmbeddingExtractor(private val modelo: FaceEmbeddingModel) {

    private val detector = FaceDetection.getClient(
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
            .build()
    )

    suspend fun procesar(foto: Bitmap): ResultadoDeteccion {
        val rostros = detector.process(InputImage.fromBitmap(foto, 0)).await()

        if (rostros.isEmpty()) return ResultadoDeteccion.SinRostro
        if (rostros.size > 1) return ResultadoDeteccion.VariosRostros

        val caja = rostros.first().boundingBox
        if (caja.width() < foto.width * 0.15) return ResultadoDeteccion.RostroDemasiadoPequeno

        val recorte = recortar(foto, caja)
        val embedding = modelo.inferir(recorte)
        return ResultadoDeteccion.Rostro(embedding)
    }

    private fun recortar(foto: Bitmap, caja: Rect): Bitmap {
        val left = caja.left.coerceIn(0, foto.width - 1)
        val top = caja.top.coerceIn(0, foto.height - 1)
        val right = caja.right.coerceIn(left + 1, foto.width)
        val bottom = caja.bottom.coerceIn(top + 1, foto.height)
        return Bitmap.createBitmap(foto, left, top, right - left, bottom - top)
    }

    fun cerrar() {
        detector.close()
        modelo.cerrar()
    }
}
