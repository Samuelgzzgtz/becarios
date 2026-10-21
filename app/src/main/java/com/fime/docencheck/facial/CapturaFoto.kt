package com.fime.docencheck.facial

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.concurrent.Executor
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Toma una foto en memoria (JPEG) y la entrega como Bitmap ya rotado a vertical. */
suspend fun ImageCapture.tomarFotoComoBitmap(executor: Executor): Bitmap =
    suspendCancellableCoroutine { continuacion ->
        takePicture(executor, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                // Si decodificar falla, hay que reanudar con el error: si no, la
                // corrutina se queda colgada para siempre en "Procesando".
                val bitmap = try {
                    image.aBitmap()
                } catch (e: Throwable) {
                    continuacion.resumeWithException(e)
                    return
                } finally {
                    image.close()
                }
                continuacion.resume(bitmap)
            }

            override fun onError(exception: ImageCaptureException) {
                continuacion.resumeWithException(exception)
            }
        })
    }

private fun ImageProxy.aBitmap(): Bitmap {
    val bytes = ByteArray(planes[0].buffer.remaining())
    planes[0].buffer.get(bytes)
    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)

    val rotacion = imageInfo.rotationDegrees
    if (rotacion == 0) return bitmap

    val matriz = Matrix().apply { postRotate(rotacion.toFloat()) }
    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matriz, true)
}
