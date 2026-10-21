package com.fime.docencheck.ui.admin.panel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.data.repository.AdminRepository
import com.fime.docencheck.data.repository.IndicadoresSistema
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class PanelGeneralViewModel(private val adminRepository: AdminRepository) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<IndicadoresSistema>>(UiState.Cargando)
    val estado: StateFlow<UiState<IndicadoresSistema>> = _estado.asStateFlow()

    private var carga: Job? = null

    init {
        cargar()
    }

    /** Pública: la pantalla la llama al reanudarse (A-07) y desde "Reintentar". */
    fun cargar() {
        if (carga?.isActive == true) return
        carga = viewModelScope.launch {
            if (_estado.value !is UiState.Listo) _estado.value = UiState.Cargando
            intentar { adminRepository.indicadores() }
                .onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudieron cargar los indicadores.")) }
        }
    }
}
