package com.fime.docencheck.ui.becario.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.session.SessionManager
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.data.model.EstadoVentanaSiase
import com.fime.docencheck.data.model.ModalidadTrabajo
import com.fime.docencheck.data.model.ProgresoHoras
import com.fime.docencheck.data.model.TipoAsistencia
import com.fime.docencheck.data.repository.AsistenciaRepository
import com.fime.docencheck.data.repository.HorarioRepository
import com.fime.docencheck.data.repository.ProgresoRepository
import com.fime.docencheck.data.repository.SiaseRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** [modalidadConfigurada] = false: el ingeniero no definió este día. */
data class TarjetaHoyUiState(
    val modalidad: ModalidadTrabajo,
    val proximoRegistro: TipoAsistencia,
    val modalidadConfigurada: Boolean = true
)

class HomeViewModel(
    private val sessionManager: SessionManager,
    private val progresoRepository: ProgresoRepository,
    private val asistenciaRepository: AsistenciaRepository,
    private val horarioRepository: HorarioRepository,
    private val siaseRepository: SiaseRepository? = null
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<ProgresoHoras>>(UiState.Cargando)
    val estado: StateFlow<UiState<ProgresoHoras>> = _estado.asStateFlow()

    private val _pendientesSinSubir = MutableStateFlow(0)
    val pendientesSinSubir: StateFlow<Int> = _pendientesSinSubir.asStateFlow()

    /** Registros que el servidor rechazó de forma permanente (A-12): hay que avisar al becario. */
    private val _rechazadas = MutableStateFlow(0)
    val rechazadas: StateFlow<Int> = _rechazadas.asStateFlow()

    private val _hoy = MutableStateFlow<TarjetaHoyUiState?>(null)
    val hoy: StateFlow<TarjetaHoyUiState?> = _hoy.asStateFlow()

    /** Error al calcular la tarjeta "Hoy" (antes simplemente no aparecía, A-08). */
    private val _errorHoy = MutableStateFlow<String?>(null)
    val errorHoy: StateFlow<String?> = _errorHoy.asStateFlow()

    /** Para la tarjeta "Reporte mensual (SIASE) — quedan N días" (B-04). */
    private val _ventanaSiase = MutableStateFlow<EstadoVentanaSiase?>(null)
    val ventanaSiase: StateFlow<EstadoVentanaSiase?> = _ventanaSiase.asStateFlow()

    /** Observable (antes era un `var` y el título podía quedarse en "Hola, becario", B-04). */
    private val _nombre = MutableStateFlow("")
    val nombre: StateFlow<String> = _nombre.asStateFlow()

    private var carga: Job? = null

    init {
        cargar()
    }

    /** Pública: la pantalla la llama al reanudarse (A-07) y desde "Reintentar" (M-02). */
    fun cargar() {
        if (carga?.isActive == true) return
        carga = viewModelScope.launch {
            if (_estado.value !is UiState.Listo) _estado.value = UiState.Cargando

            val usuario = intentar { sessionManager.requerirUsuario() }.getOrElse {
                _estado.value = UiState.Error(it.mensajeAmigable("No se pudo identificar la sesión."))
                return@launch
            }
            _nombre.value = usuario.nombre

            // Primero se intenta subir lo que esté en cola, para que los números ya lo incluyan.
            if (asistenciaRepository.pendientesSinSubir(usuario.id) > 0) {
                asistenciaRepository.sincronizarPendientes()
            }
            _pendientesSinSubir.value = asistenciaRepository.pendientesSinSubir(usuario.id)
            _rechazadas.value = asistenciaRepository.rechazadasSinSubir(usuario.id)

            intentar { progresoRepository.progresoDe(usuario.id) }
                .onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudo cargar tu progreso.")) }

            intentar {
                val modalidad = horarioRepository.modalidadDeHoy(usuario.id)
                TarjetaHoyUiState(
                    modalidad = modalidad.modalidad,
                    proximoRegistro = asistenciaRepository.siguienteTipo(usuario.id),
                    modalidadConfigurada = modalidad.configurada
                )
            }.onSuccess {
                _hoy.value = it
                _errorHoy.value = null
            }.onFailure {
                _errorHoy.value = it.mensajeAmigable("No se pudo cargar la información de hoy.")
            }

            siaseRepository?.let { repo ->
                intentar { repo.estadoVentana() }.onSuccess { _ventanaSiase.value = it }
            }
        }
    }

    /** El becario ya vio los registros rechazados: se quitan de la cola. */
    fun descartarRechazadas() {
        viewModelScope.launch {
            val usuario = sessionManager.usuarioEnMemoria() ?: return@launch
            asistenciaRepository.descartarRechazadas(usuario.id)
            _rechazadas.value = 0
        }
    }
}
