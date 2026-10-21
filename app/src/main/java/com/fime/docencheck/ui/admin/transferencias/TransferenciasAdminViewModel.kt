package com.fime.docencheck.ui.admin.transferencias

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.session.SessionManager
import com.fime.docencheck.core.ui.CanalAvisos
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.data.model.EstadoTransferencia
import com.fime.docencheck.data.model.TransferenciaDetalle
import com.fime.docencheck.data.repository.AdminRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Aprobar/rechazar que espera confirmación en un diálogo (C-06). */
data class ResolucionPendiente(val detalle: TransferenciaDetalle, val aprobar: Boolean)

class TransferenciasAdminViewModel(
    @Suppress("unused") private val sessionManager: SessionManager,
    private val adminRepository: AdminRepository
) : ViewModel() {

    /** Con becario (nombre y matrícula), origen, destino y fecha (C-06). */
    private val _estado = MutableStateFlow<UiState<List<TransferenciaDetalle>>>(UiState.Cargando)
    val estado: StateFlow<UiState<List<TransferenciaDetalle>>> = _estado.asStateFlow()

    /** Ids con una resolución en curso: los DOS botones de esa tarjeta van deshabilitados. */
    private val _procesando = MutableStateFlow<Set<String>>(emptySet())
    val procesando: StateFlow<Set<String>> = _procesando.asStateFlow()

    private val _confirmacion = MutableStateFlow<ResolucionPendiente?>(null)
    val confirmacion: StateFlow<ResolucionPendiente?> = _confirmacion.asStateFlow()

    private val canal = CanalAvisos()
    val avisos = canal.avisos

    init {
        cargar()
    }

    fun cargar() {
        viewModelScope.launch {
            if (_estado.value !is UiState.Listo) _estado.value = UiState.Cargando
            intentar { adminRepository.transferenciasPendientes() }
                .onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudieron cargar las transferencias.")) }
        }
    }

    /** Paso 1: abre el diálogo. Nada se escribe todavía. */
    fun pedirResolver(detalle: TransferenciaDetalle, aprobar: Boolean) {
        val id = detalle.transferencia.id ?: return
        if (id in _procesando.value) return
        _confirmacion.value = ResolucionPendiente(detalle, aprobar)
    }

    fun cancelarResolver() {
        _confirmacion.value = null
    }

    /** Paso 2: la RPC transaccional aprueba (y reasigna) o rechaza, con bloqueo de fila en el servidor. */
    fun confirmarResolver() {
        val pendiente = _confirmacion.value ?: return
        _confirmacion.value = null
        val id = pendiente.detalle.transferencia.id ?: return
        if (id in _procesando.value) return
        _procesando.update { it + id }

        viewModelScope.launch {
            adminRepository.resolverTransferencia(id, pendiente.aprobar)
                .onSuccess { estado ->
                    val becario = pendiente.detalle.becario?.nombre ?: "el becario"
                    canal.exito(
                        if (estado == EstadoTransferencia.aprobada) {
                            "Transferencia aprobada: $becario ahora está con ${pendiente.detalle.destino?.nombre ?: "el nuevo ingeniero"}"
                        } else {
                            "Transferencia de $becario rechazada"
                        }
                    )
                }
                .onFailure { canal.error(it.mensajeAmigable("No se pudo resolver la transferencia.")) }
            _procesando.update { it - id }
            cargar()
        }
    }
}
