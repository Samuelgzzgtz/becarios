package com.fime.docencheck.ui.admin.reportes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.data.model.BecarioConProgreso
import com.fime.docencheck.data.model.Perfil
import com.fime.docencheck.data.model.ProgresoBecario
import com.fime.docencheck.data.repository.AdminRepository
import com.fime.docencheck.data.repository.ProgresoRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ReporteHorasGlobalViewModel(
    private val adminRepository: AdminRepository,
    private val progresoRepository: ProgresoRepository
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<List<BecarioConProgreso>>>(UiState.Cargando)
    val estado: StateFlow<UiState<List<BecarioConProgreso>>> = _estado.asStateFlow()

    /** Filas completas (ingeniero, ritmo esperado, riesgo) para agrupar y marcar "Ritmo bajo" (UI). */
    private val _detalle = MutableStateFlow<List<ProgresoBecario>>(emptyList())
    val detalle: StateFlow<List<ProgresoBecario>> = _detalle.asStateFlow()

    /** ingenieroId → nombre, para los encabezados de grupo. */
    private val _nombresIngenieros = MutableStateFlow<Map<String, String>>(emptyMap())
    val nombresIngenieros: StateFlow<Map<String, String>> = _nombresIngenieros.asStateFlow()

    init {
        cargar()
    }

    /** Una sola llamada para todos los becarios activos (M-09: antes era una RPC por becario). */
    fun cargar() {
        viewModelScope.launch {
            if (_estado.value !is UiState.Listo) _estado.value = UiState.Cargando
            intentar {
                val filas = progresoRepository.progresoEquipo()
                _detalle.value = filas
                filas.map(BecarioConProgreso::desde)
            }.onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudo cargar el reporte global.")) }
            intentar { adminRepository.listarPorPerfil(Perfil.ingeniero, incluirInactivos = true) }
                .onSuccess { lista -> _nombresIngenieros.value = lista.associate { it.id to it.nombre } }
        }
    }
}
