package com.fime.docencheck.ui.ingeniero.enrolamiento

import android.content.Context
import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.data.repository.EnrolamientoRepository
import com.fime.docencheck.data.repository.EquipoRepository
import com.fime.docencheck.facial.FaceEmbeddingExtractor
import com.fime.docencheck.facial.FaceEmbeddingModel
import com.fime.docencheck.facial.ResultadoDeteccion
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicBoolean

const val CAPTURAS_REQUERIDAS = 5
private const val NOMBRE_MODELO = "mobilefacenet.tflite"

sealed interface EstadoEnrolamiento {
    /** [fotosListas] nunca pasa de [meta] (antes podía mostrar "Foto 6 de 5", M-08). */
    data class Capturando(val fotosListas: Int, val meta: Int = CAPTURAS_REQUERIDAS) : EstadoEnrolamiento
    data object Procesando : EstadoEnrolamiento

    /** Ya hay 5 fotos y el becario tenía biometría: falta que el ingeniero confirme el reemplazo. */
    data object ConfirmarReemplazo : EstadoEnrolamiento
    data object Guardando : EstadoEnrolamiento
    data class Guardado(val reemplazo: Boolean) : EstadoEnrolamiento

    /**
     * [puedeReintentarGuardado] = las 5 fotos ya están; solo falló el guardado
     * (p. ej. sin red) y se puede reintentar sin volver a tomar fotos.
     */
    data class Error(val mensaje: String, val puedeReintentarGuardado: Boolean = false) : EstadoEnrolamiento
}

class EnrolamientoFacialViewModel(
    context: Context,
    private val becarioId: String,
    private val enrolamientoRepository: EnrolamientoRepository,
    private val equipoRepository: EquipoRepository
) : ViewModel() {

    private val extractor = FaceEmbeddingExtractor(FaceEmbeddingModel(context, NOMBRE_MODELO))
    private val embeddingsCapturados = mutableListOf<FloatArray>()
    private val enCurso = AtomicBoolean(false)

    private val _estado = MutableStateFlow<EstadoEnrolamiento>(EstadoEnrolamiento.Capturando(0))
    val estado: StateFlow<EstadoEnrolamiento> = _estado.asStateFlow()

    /** Para el subtítulo "Enrolando a: ..." (M-08). */
    private val _nombreBecario = MutableStateFlow<String?>(null)
    val nombreBecario: StateFlow<String?> = _nombreBecario.asStateFlow()

    /** true si el becario ya tiene biometría activa (se reemplazará). null = no se pudo saber. */
    private val _tieneBiometria = MutableStateFlow<Boolean?>(null)
    val tieneBiometria: StateFlow<Boolean?> = _tieneBiometria.asStateFlow()

    /** Fotos válidas acumuladas, para el indicador 1–5 en cualquier estado (también tras un error). */
    private val _fotosValidas = MutableStateFlow(0)
    val fotosValidas: StateFlow<Int> = _fotosValidas.asStateFlow()

    init {
        viewModelScope.launch {
            intentar { equipoRepository.usuario(becarioId) }.onSuccess { _nombreBecario.value = it?.nombre }
            intentar { enrolamientoRepository.tieneEnrolamiento(becarioId) }.onSuccess { _tieneBiometria.value = it }
        }
    }

    /** Toma y procesa una foto. Los toques mientras hay una en curso se ignoran (doble toque, M-08). */
    fun capturarYProcesar(capturar: suspend () -> Bitmap) {
        if (embeddingsCapturados.size >= CAPTURAS_REQUERIDAS) return
        if (!enCurso.compareAndSet(false, true)) return
        _estado.value = EstadoEnrolamiento.Procesando

        viewModelScope.launch {
            try {
                val resultado = intentar {
                    val foto = capturar()
                    withContext(Dispatchers.Default) { extractor.procesar(foto) }
                }.getOrElse {
                    _estado.value = EstadoEnrolamiento.Error(it.mensajeAmigable("No se pudo tomar la foto. Intenta de nuevo."))
                    return@launch
                }

                when (resultado) {
                    is ResultadoDeteccion.SinRostro ->
                        _estado.value = EstadoEnrolamiento.Error("No se detectó un rostro. Intenta de nuevo.")

                    is ResultadoDeteccion.VariosRostros ->
                        _estado.value = EstadoEnrolamiento.Error("Se detectó más de un rostro; solo debe estar el becario.")

                    is ResultadoDeteccion.RostroDemasiadoPequeno ->
                        _estado.value = EstadoEnrolamiento.Error("Acércate más a la cámara.")

                    is ResultadoDeteccion.Rostro -> {
                        embeddingsCapturados.add(resultado.embedding)
                        _fotosValidas.value = embeddingsCapturados.size
                        if (embeddingsCapturados.size < CAPTURAS_REQUERIDAS) {
                            _estado.value = EstadoEnrolamiento.Capturando(embeddingsCapturados.size)
                        } else if (_tieneBiometria.value == true) {
                            _estado.value = EstadoEnrolamiento.ConfirmarReemplazo
                        } else {
                            guardar()
                        }
                    }
                }
            } finally {
                enCurso.set(false)
            }
        }
    }

    /** Tras un error de foto: volver a capturar (conserva las fotos buenas ya tomadas). */
    fun reintentarCaptura() {
        if (enCurso.get()) return
        if (embeddingsCapturados.size >= CAPTURAS_REQUERIDAS) {
            reintentarGuardado()
            return
        }
        _estado.value = EstadoEnrolamiento.Capturando(embeddingsCapturados.size)
    }

    /** Tras un error al guardar: reintentar sin volver a tomar las 5 fotos (M-08). */
    fun reintentarGuardado() {
        if (embeddingsCapturados.size < CAPTURAS_REQUERIDAS) return
        if (!enCurso.compareAndSet(false, true)) return
        viewModelScope.launch {
            try { guardar() } finally { enCurso.set(false) }
        }
    }

    fun confirmarReemplazo() = reintentarGuardado()

    /** El ingeniero no quiso reemplazar: se descartan las fotos. */
    fun cancelarReemplazo() {
        embeddingsCapturados.clear()
        _fotosValidas.value = 0
        _estado.value = EstadoEnrolamiento.Capturando(0)
    }

    private suspend fun guardar() {
        _estado.value = EstadoEnrolamiento.Guardando
        val promedio = promediar(embeddingsCapturados)
        enrolamientoRepository.enrolar(
            becarioId = becarioId,
            embedding = promedio.toList(),
            modelo = NOMBRE_MODELO,
            dimension = promedio.size
        ).onSuccess { reemplazo ->
            _tieneBiometria.value = true
            _estado.value = EstadoEnrolamiento.Guardado(reemplazo)
        }.onFailure {
            _estado.value = EstadoEnrolamiento.Error(
                it.mensajeAmigable("No se pudo guardar el enrolamiento."),
                puedeReintentarGuardado = true
            )
        }
    }

    private fun promediar(embeddings: List<FloatArray>): FloatArray {
        val dimension = embeddings.first().size
        val promedio = FloatArray(dimension)
        for (embedding in embeddings) {
            for (i in 0 until dimension) promedio[i] += embedding[i]
        }
        for (i in 0 until dimension) promedio[i] /= embeddings.size
        return promedio
    }

    override fun onCleared() {
        extractor.cerrar()
    }
}
