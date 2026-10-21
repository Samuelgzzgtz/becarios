package com.fime.docencheck.ui.ingeniero.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.session.SessionManager
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.data.model.Perfil
import com.fime.docencheck.data.model.Usuario
import com.fime.docencheck.data.repository.EquipoRepository
import com.fime.docencheck.data.repository.ProgresoRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class BecarioEnRiesgo(
    val becario: Usuario,
    val horasSemana: Double,
    val metaSemanal: Double,
    /** Lo que ya debería llevar a esta altura de la semana (días laborales terminados). */
    val horasEsperadas: Double = 0.0
)

data class DashboardUiState(
    val totalBecarios: Int,
    val enRiesgo: List<BecarioEnRiesgo>
)

class DashboardViewModel(
    private val sessionManager: SessionManager,
    @Suppress("unused") private val equipoRepository: EquipoRepository,
    private val progresoRepository: ProgresoRepository
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<DashboardUiState>>(UiState.Cargando)
    val estado: StateFlow<UiState<DashboardUiState>> = _estado.asStateFlow()

    private var carga: Job? = null

    init {
        cargar()
    }

    /**
     * Una sola llamada (progreso_equipo, M-09). "En riesgo" ya no exige horas el
     * lunes a primera hora: compara contra los días laborales configurados YA
     * TERMINADOS (de lunes a ayer) y solo cuenta becarios activos.
     */
    fun cargar() {
        if (carga?.isActive == true) return
        carga = viewModelScope.launch {
            if (_estado.value !is UiState.Listo) _estado.value = UiState.Cargando
            intentar {
                sessionManager.requerirUsuario()
                val equipo = progresoRepository.progresoEquipo()
                val enRiesgo = equipo
                    .filter { it.enRiesgo }
                    .map {
                        BecarioEnRiesgo(
                            becario = Usuario(it.becario_id, it.matricula, it.nombre, Perfil.becario),
                            horasSemana = it.horas_semana,
                            metaSemanal = it.meta_semanal ?: 0.0,
                            horasEsperadas = it.horasEsperadasSemana
                        )
                    }
                DashboardUiState(totalBecarios = equipo.size, enRiesgo = enRiesgo)
            }.onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudo cargar el panel.")) }
        }
    }
}
