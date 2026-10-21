package com.fime.docencheck.facial

import android.content.Context
import android.graphics.Bitmap
import org.tensorflow.lite.Interpreter
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

/**
 * Envuelve el interprete de TensorFlow Lite que convierte una foto de rostro
 * ya recortada en un vector de características (embedding).
 *
 * IMPORTANTE: este proyecto no incluye el archivo del modelo. Hay que copiar
 * un .tflite de reconocimiento facial (p. ej. MobileFaceNet, entrada 112x112,
 * salida de 192 floats) a app/src/main/assets/mobilefacenet.tflite. Sin ese
 * archivo la app compila pero el enrolamiento/verificación truena al abrir
 * la cámara.
 */
class FaceEmbeddingModel(
    context: Context,
    private val nombreModelo: String = "mobilefacenet.tflite",
    val entradaAncho: Int = 112,
    val entradaAlto: Int = 112,
    val dimensionSalida: Int = 192
) {
    private val interprete = Interpreter(cargarModelo(context, nombreModelo))

    fun inferir(rostro: Bitmap): FloatArray {
        val entrada = prepararEntrada(rostro)
        val salida = Array(1) { FloatArray(dimensionSalida) }
        interprete.run(entrada, salida)
        return salida[0]
    }

    fun cerrar() = interprete.close()

    private fun prepararEntrada(rostro: Bitmap): ByteBuffer {
        val redimensionado = Bitmap.createScaledBitmap(rostro, entradaAncho, entradaAlto, true)
        val buffer = ByteBuffer.allocateDirect(4 * entradaAncho * entradaAlto * 3)
        buffer.order(ByteOrder.nativeOrder())

        val pixeles = IntArray(entradaAncho * entradaAlto)
        redimensionado.getPixels(pixeles, 0, entradaAncho, 0, 0, entradaAncho, entradaAlto)

        for (pixel in pixeles) {
            // Normalizado a [-1, 1], convención común en modelos tipo MobileFaceNet.
            buffer.putFloat((((pixel shr 16) and 0xFF) - 127.5f) / 127.5f)
            buffer.putFloat((((pixel shr 8) and 0xFF) - 127.5f) / 127.5f)
            buffer.putFloat(((pixel and 0xFF) - 127.5f) / 127.5f)
        }
        buffer.rewind()
        return buffer
    }

    private fun cargarModelo(context: Context, nombreArchivo: String): MappedByteBuffer {
        val descriptor = context.assets.openFd(nombreArchivo)
        val entrada = descriptor.createInputStream()
        val canal = (entrada as java.io.FileInputStream).channel
        return canal.map(FileChannel.MapMode.READ_ONLY, descriptor.startOffset, descriptor.declaredLength)
    }
}
