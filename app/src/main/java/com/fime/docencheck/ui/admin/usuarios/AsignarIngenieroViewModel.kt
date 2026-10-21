package com.fime.docencheck.ui.admin.usuarios

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.data.model.Perfil
import com.fime.docencheck.data.model.Usuario
import com.fime.docencheck.data.repository.AdminRepository
import com.fime.docencheck.data.repository.EquipoRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * A-10: tocar un nombre ya no reasigna; solo lo selecciona. Se muestra quién está
 * asignado hoy, se confirma, y la reasignación es atómica en el servidor.
 */
data class AsignacionUiState(
    val ingenieros: List<Usuario>,
    val actualId: String? = null,
    val seleccionadoId: String? = null,
    val confirmando: Boolean = false,
    val guardando: Boolean = false,
    val guardado: Boolean = false,
    val error: String? = null
) {
    val actual: Usuario? get() = ingenieros.firstOrNull { it.id == actualId }
    val seleccionado: Usuario? get() = ingenieros.firstOrNull { it.id == seleccionadoId }
    val puedeGuardar: Boolean get() = !guardando && seleccionadoId != null && seleccionadoId != actualId
}

class AsignarIngenieroViewModel(
    private val becarioId: String,
    private val adminRepository: AdminRepository,
    /** Opcional: solo para mostrar a quién se asigna en el encabezado. */
    private val equipoRepository: EquipoRepository? = null
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<AsignacionUiState>>(UiState.Cargando)
    val estado: StateFlow<UiState<AsignacionUiState>> = _estado.asStateFlow()

    private val _nombreBecario = MutableStateFlow<String?>(null)
    val nombreBecario: StateFlow<String?> = _nombreBecario.asStateFlow()

    init {
        viewModelScope.launch {
            equipoRepository?.let { repo -> intentar { repo.usuario(becarioId) }.onSuccess { _nombreBecario.value = it?.nombre } }
        }
        cargar()
    }

    fun cargar() {
        viewModelScope.launch {
            _estado.value = UiState.Cargando
            intentar {
                val ingenieros = adminRepository.listarPorPerfil(Perfil.ingeniero)
                val actual = adminRepository.ingenieroAsignadoDe(becarioId)
                AsignacionUiState(ingenieros = ingenieros, actualId = actual, seleccionadoId = actual)
            }.onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudieron cargar los ingenieros.")) }
        }
    }

    fun seleccionar(ingenieroId: String) = actualizar { it.copy(seleccionadoId = ingenieroId, error = null) }

    /** Si ya había ingeniero, pide confirmación; si no, asigna directo. */
    fun guardar() {
        val actual = (_estado.value as? UiState.Listo)?.datos ?: return
        if (!actual.puedeGuardar) return
        if (actual.actualId != null) {
            actualizar { it.copy(confirmando = true) }
        } else {
            ejecutar()
        }
    }

    fun confirmar() {
        actualizar { it.copy(confirmando = false) }
        ejecutar()
    }

    fun cancelar() = actualizar { it.copy(confirmando = false) }

    private fun ejecutar() {
        val actual = (_estado.value as? UiState.Listo)?.datos ?: return
        val destino = actual.seleccionadoId ?: return
        if (actual.guardando) return
        actualizar { it.copy(guardando = true, error = null) }
        viewModelScope.launch {
            adminRepository.asignarBecario(becarioId, destino)
                .onSuccess { actualizar { it.copy(guardando = false, guardado = true) } }
                .onFailure { e -> actualizar { it.copy(guardando = false, error = e.mensajeAmigable("No se pudo asignar el ingeniero.")) } }
        }
    }

    private fun actualizar(transformar: (AsignacionUiState) -> AsignacionUiState) {
        _estado.update { actual -> if (actual is UiState.Listo) UiState.Listo(transformar(actual.datos)) else actual }
    }
}
