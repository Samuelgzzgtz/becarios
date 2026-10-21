package com.fime.docencheck.ui.ingeniero.becarios

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.session.SessionManager
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.data.model.BecarioConProgreso
import com.fime.docencheck.data.model.ProgresoBecario
import com.fime.docencheck.data.repository.EquipoRepository
import com.fime.docencheck.data.repository.ProgresoRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class MisBecariosViewModel(
    private val sessionManager: SessionManager,
    @Suppress("unused") private val equipoRepository: EquipoRepository,
    private val progresoRepository: ProgresoRepository
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<List<BecarioConProgreso>>>(UiState.Cargando)
    val estado: StateFlow<UiState<List<BecarioConProgreso>>> = _estado.asStateFlow()

    /** Fila completa por becario (ritmo esperado y riesgo) para las barras de la UI (B-06). */
    private val _detalle = MutableStateFlow<Map<String, ProgresoBecario>>(emptyMap())
    val detalle: StateFlow<Map<String, ProgresoBecario>> = _detalle.asStateFlow()

    private var carga: Job? = null

    init {
        cargar()
    }

    /** Una sola llamada para todo el equipo (M-09); solo becarios activos. */
    fun cargar() {
        if (carga?.isActive == true) return
        carga = viewModelScope.launch {
            if (_estado.value !is UiState.Listo) _estado.value = UiState.Cargando
            intentar {
                sessionManager.requerirUsuario()
                val filas = progresoRepository.progresoEquipo()
                _detalle.value = filas.associateBy { it.becario_id }
                filas.map(BecarioConProgreso::desde)
            }.onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudo cargar a tus becarios.")) }
        }
    }
}
