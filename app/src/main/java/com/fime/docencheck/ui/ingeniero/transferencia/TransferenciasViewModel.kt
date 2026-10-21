package com.fime.docencheck.ui.ingeniero.transferencia

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.session.SessionManager
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.data.model.TransferenciaDetalle
import com.fime.docencheck.data.repository.TransferenciaRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class TransferenciasViewModel(
    private val sessionManager: SessionManager,
    private val transferenciaRepository: TransferenciaRepository
) : ViewModel() {

    /** Con becario, origen y destino resueltos (M-06). */
    private val _estado = MutableStateFlow<UiState<List<TransferenciaDetalle>>>(UiState.Cargando)
    val estado: StateFlow<UiState<List<TransferenciaDetalle>>> = _estado.asStateFlow()

    init {
        cargar()
    }

    fun cargar() {
        viewModelScope.launch {
            if (_estado.value !is UiState.Listo) _estado.value = UiState.Cargando
            intentar {
                val usuario = sessionManager.requerirUsuario()
                transferenciaRepository.delEquipoConDetalle(usuario.id)
            }.onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudieron cargar las transferencias.")) }
        }
    }
}
