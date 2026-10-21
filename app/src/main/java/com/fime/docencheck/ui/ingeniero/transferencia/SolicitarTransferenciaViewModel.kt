package com.fime.docencheck.ui.ingeniero.transferencia

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.session.SessionManager
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.data.model.Usuario
import com.fime.docencheck.data.repository.EquipoRepository
import com.fime.docencheck.data.repository.TransferenciaRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FormularioTransferencia(
    val ingenieros: List<Usuario>,
    val destinoSeleccionado: Usuario? = null,
    val motivo: String = "",
    val enviando: Boolean = false,
    val enviada: Boolean = false,
    val error: String? = null,
    /** A quién se transfiere, para el encabezado (M-06). */
    val becario: Usuario? = null,
    /** Si ya hay una solicitud pendiente: "Ya hay una solicitud pendiente desde dd/mm"; el formulario va deshabilitado. */
    val avisoPendiente: String? = null
) {
    val puedeEnviar: Boolean get() = !enviando && !enviada && avisoPendiente == null
}

class SolicitarTransferenciaViewModel(
    private val becarioId: String,
    private val sessionManager: SessionManager,
    private val equipoRepository: EquipoRepository,
    private val transferenciaRepository: TransferenciaRepository
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<FormularioTransferencia>>(UiState.Cargando)
    val estado: StateFlow<UiState<FormularioTransferencia>> = _estado.asStateFlow()

    private var propioId: String? = null

    init {
        cargar()
    }

    fun cargar() {
        viewModelScope.launch {
            _estado.value = UiState.Cargando
            intentar {
                val usuario = sessionManager.requerirUsuario()
                propioId = usuario.id
                val ingenieros = equipoRepository.otrosIngenieros(usuario.id)
                val becario = intentar { equipoRepository.usuario(becarioId) }.getOrNull()
                val pendiente = transferenciaRepository.pendienteDe(becarioId)
                FormularioTransferencia(
                    ingenieros = ingenieros,
                    becario = becario,
                    avisoPendiente = pendiente?.let { p ->
                        val desde = FechaUi.fechaLocal(p.created_at)?.let { " desde el ${FechaUi.diaMes(it)}" } ?: ""
                        "Ya hay una solicitud de transferencia pendiente$desde; espera a que la coordinación la resuelva."
                    }
                )
            }.onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudieron cargar los ingenieros.")) }
        }
    }

    fun seleccionarDestino(destino: Usuario) {
        actualizar { it.copy(destinoSeleccionado = destino, error = null) }
    }

    fun cambiarMotivo(motivo: String) {
        actualizar { it.copy(motivo = motivo, error = null) }
    }

    fun enviar() {
        val idIngeniero = propioId ?: return
        val formulario = (_estado.value as? UiState.Listo)?.datos ?: return
        if (!formulario.puedeEnviar) return
        val destino = formulario.destinoSeleccionado
        if (destino == null || formulario.motivo.isBlank()) {
            actualizar { it.copy(error = "Elige un ingeniero destino y escribe el motivo") }
            return
        }

        // Se marca "enviando" ANTES de lanzar la corrutina: el segundo toque ya lo ve (doble envío).
        actualizar { it.copy(enviando = true, error = null) }
        viewModelScope.launch {
            transferenciaRepository.solicitar(becarioId, idIngeniero, destino.id, formulario.motivo)
                .onSuccess { actualizar { f -> f.copy(enviando = false, enviada = true) } }
                .onFailure { e ->
                    actualizar { f -> f.copy(enviando = false, error = e.mensajeAmigable("No se pudo enviar la solicitud.")) }
                }
        }
    }

    private fun actualizar(transformar: (FormularioTransferencia) -> FormularioTransferencia) {
        _estado.update { actual -> if (actual is UiState.Listo) UiState.Listo(transformar(actual.datos)) else actual }
    }
}
