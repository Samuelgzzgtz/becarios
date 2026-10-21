package com.fime.docencheck.ui.becario.asistencia

import android.content.Context
import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.ErrorDeNegocio
import com.fime.docencheck.core.error.MENSAJE_SIN_CONEXION
import com.fime.docencheck.core.error.esErrorDeRed
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.session.SessionManager
import com.fime.docencheck.data.model.ModalidadTrabajo
import com.fime.docencheck.data.model.TipoAsistencia
import com.fime.docencheck.data.repository.AsistenciaRepository
import com.fime.docencheck.data.repository.EnrolamientoRepository
import com.fime.docencheck.data.repository.HorarioRepository
import com.fime.docencheck.data.repository.ResultadoRegistro
import com.fime.docencheck.facial.FaceEmbeddingExtractor
import com.fime.docencheck.facial.FaceEmbeddingModel
import com.fime.docencheck.facial.FaceMatcher
import com.fime.docencheck.facial.ResultadoDeteccion
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicBoolean

sealed interface EstadoRegistro {
    data object ListoParaCapturar : EstadoRegistro
    data object Procesando : EstadoRegistro

    /** [enCola] = sin red: quedó guardado en el teléfono y se sube solo después (C-01). */
    data class Exito(val tipo: TipoAsistencia, val enCola: Boolean) : EstadoRegistro {
        val mensaje: String
            get() {
                val que = if (tipo == TipoAsistencia.entrada) "Entrada" else "Salida"
                return if (enCola) "$que guardada en el teléfono; se subirá cuando haya conexión."
                else "$que registrada."
            }
    }

    data class Error(val mensaje: String) : EstadoRegistro
}

/** [modalidadConfigurada] = false: el ingeniero no definió este día (se registra como presencial). */
data class InfoHoy(
    val modalidad: ModalidadTrabajo,
    val proximoTipo: TipoAsistencia,
    val modalidadConfigurada: Boolean = true
)

class RegistrarAsistenciaViewModel(
    context: Context,
    private val sessionManager: SessionManager,
    private val enrolamientoRepository: EnrolamientoRepository,
    private val horarioRepository: HorarioRepository,
    private val asistenciaRepository: AsistenciaRepository
) : ViewModel() {

    private val extractor = FaceEmbeddingExtractor(FaceEmbeddingModel(context))

    private val _estado = MutableStateFlow<EstadoRegistro>(EstadoRegistro.ListoParaCapturar)
    val estado: StateFlow<EstadoRegistro> = _estado.asStateFlow()

    private val _infoHoy = MutableStateFlow<InfoHoy?>(null)
    val infoHoy: StateFlow<InfoHoy?> = _infoHoy.asStateFlow()

    /** Un registro a la vez: el doble toque se ignora (auditoría C-03). */
    private val enCurso = AtomicBoolean(false)

    init {
        cargarInfoHoy()
    }

    /**
     * También precarga (y guarda en el teléfono) la biometría y el patrón semanal,
     * para que el registro funcione aunque se caiga la red después (C-02).
     */
    fun cargarInfoHoy() {
        viewModelScope.launch {
            intentar {
                val usuario = sessionManager.requerirUsuario()
                val modalidad = horarioRepository.modalidadDeHoy(usuario.id)
                val info = InfoHoy(
                    modalidad = modalidad.modalidad,
                    proximoTipo = asistenciaRepository.siguienteTipo(usuario.id),
                    modalidadConfigurada = modalidad.configurada
                )
                _infoHoy.value = info
                intentar { enrolamientoRepository.propio(usuario.id) }
            }
        }
    }

    fun reiniciar() {
        if (enCurso.get()) return
        _estado.value = EstadoRegistro.ListoParaCapturar
    }

    /**
     * Toma la foto y registra. El estado pasa a Procesando ANTES de capturar y los
     * toques mientras hay una captura en curso se ignoran (C-03). La captura se
     * recibe como función para que su error (cámara no lista) también se atrape (A-11).
     */
    fun capturarYRegistrar(capturar: suspend () -> Bitmap) {
        if (!enCurso.compareAndSet(false, true)) return
        _estado.value = EstadoRegistro.Procesando

        viewModelScope.launch {
            try {
                _estado.value = intentar { registrar(capturar()) }
                    .getOrElse { EstadoRegistro.Error(mensajeDeFallo(it)) }
                if (_estado.value is EstadoRegistro.Exito) cargarInfoHoy()
            } finally {
                enCurso.set(false)
            }
        }
    }

    private suspend fun registrar(foto: Bitmap): EstadoRegistro {
        val usuario = sessionManager.requerirUsuario()

        val enrolamiento = enrolamientoRepository.propio(usuario.id)
            ?: return EstadoRegistro.Error(
                "Todavía no tienes biometría facial registrada. Pide a tu ingeniero que te enrole."
            )

        val resultado = withContext(Dispatchers.Default) { extractor.procesar(foto) }

        return when (resultado) {
            is ResultadoDeteccion.SinRostro ->
                EstadoRegistro.Error("No se detectó tu rostro. Intenta de nuevo con buena luz.")

            is ResultadoDeteccion.VariosRostros ->
                EstadoRegistro.Error("Se detectó más de un rostro en la foto.")

            is ResultadoDeteccion.RostroDemasiadoPequeno ->
                EstadoRegistro.Error("Acércate más a la cámara.")

            is ResultadoDeteccion.Rostro -> {
                if (!FaceMatcher.dimensionesCompatibles(resultado.embedding, enrolamiento.embedding_vector)) {
                    return EstadoRegistro.Error(
                        "Tu biometría se registró con otra versión de la app. Pide a tu ingeniero que te vuelva a enrolar."
                    )
                }
                if (!FaceMatcher.coincide(resultado.embedding, enrolamiento.embedding_vector)) {
                    return EstadoRegistro.Error("El rostro no coincide con tu registro biométrico.")
                }

                val tipo = asistenciaRepository.siguienteTipo(usuario.id)
                val modalidad = horarioRepository.modalidadDeHoy(usuario.id).modalidad
                val subida = asistenciaRepository
                    .registrar(usuario.id, tipo, modalidad, latitud = null, longitud = null)
                    .getOrThrow()
                EstadoRegistro.Exito(tipo, enCola = subida == ResultadoRegistro.EN_COLA)
            }
        }
    }

    private fun mensajeDeFallo(error: Throwable): String = when {
        error is ErrorDeNegocio -> error.message ?: "No se pudo registrar tu asistencia."
        // Sin red y sin copia local de la biometría/patrón: no hay con qué verificar.
        error.esErrorDeRed() -> "$MENSAJE_SIN_CONEXION Todavía no hay datos guardados en este teléfono para registrar sin red."
        else -> error.mensajeAmigable("No se pudo registrar tu asistencia. Intenta de nuevo.")
    }

    override fun onCleared() {
        extractor.cerrar()
    }
}
