package com.fime.docencheck.ui.admin.usuarios

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.ui.CanalAvisos
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.data.model.EstadoUsuario
import com.fime.docencheck.data.model.Perfil
import com.fime.docencheck.data.model.Usuario
import com.fime.docencheck.data.repository.AdminRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Cambio de estado (baja/reactivación) que espera confirmación (A-13). */
data class CambioEstadoPendiente(val usuario: Usuario, val nuevoEstado: EstadoUsuario)

class ListaUsuariosViewModel(
    private val perfil: Perfil,
    private val adminRepository: AdminRepository
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<List<Usuario>>>(UiState.Cargando)
    val estado: StateFlow<UiState<List<Usuario>>> = _estado.asStateFlow()

    /** Filtro por estado; null = todos. Por omisión solo activos. */
    private val _filtroEstado = MutableStateFlow<EstadoUsuario?>(EstadoUsuario.activo)
    val filtroEstado: StateFlow<EstadoUsuario?> = _filtroEstado.asStateFlow()

    private val _procesando = MutableStateFlow<Set<String>>(emptySet())
    val procesando: StateFlow<Set<String>> = _procesando.asStateFlow()

    private val _cambioPendiente = MutableStateFlow<CambioEstadoPendiente?>(null)
    val cambioPendiente: StateFlow<CambioEstadoPendiente?> = _cambioPendiente.asStateFlow()

    private val canal = CanalAvisos()
    val avisos = canal.avisos

    init {
        cargar()
    }

    fun cargar() {
        viewModelScope.launch {
            if (_estado.value !is UiState.Listo) _estado.value = UiState.Cargando
            intentar {
                val filtro = _filtroEstado.value
                adminRepository.listarPorPerfil(perfil, incluirInactivos = filtro != EstadoUsuario.activo)
                    .filter { filtro == null || it.estado == filtro }
            }.onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudo cargar la lista.")) }
        }
    }

    fun filtrarPorEstado(estado: EstadoUsuario?) {
        _filtroEstado.value = estado
        _estado.value = UiState.Cargando
        cargar()
    }

    fun pedirBaja(usuario: Usuario) {
        _cambioPendiente.value = CambioEstadoPendiente(usuario, EstadoUsuario.inactivo)
    }

    fun pedirReactivar(usuario: Usuario) {
        _cambioPendiente.value = CambioEstadoPendiente(usuario, EstadoUsuario.activo)
    }

    fun cancelarCambio() {
        _cambioPendiente.value = null
    }

    fun confirmarCambio() {
        val cambio = _cambioPendiente.value ?: return
        _cambioPendiente.value = null
        val id = cambio.usuario.id
        if (id in _procesando.value) return
        _procesando.update { it + id }
        viewModelScope.launch {
            adminRepository.cambiarEstadoUsuario(id, cambio.nuevoEstado)
                .onSuccess {
                    canal.exito(
                        if (cambio.nuevoEstado == EstadoUsuario.activo) "${cambio.usuario.nombre} reactivado"
                        else "${cambio.usuario.nombre} dado de baja"
                    )
                    cargar()
                }
                .onFailure { canal.error(it.mensajeAmigable("No se pudo cambiar el estado de la cuenta.")) }
            _procesando.update { it - id }
        }
    }

    /** Edición de datos (A-13: "Editar"). La UI de edición la arma el rediseño. */
    fun editar(usuario: Usuario, nombre: String, matricula: String, coordinacion: String?) {
        if (usuario.id in _procesando.value) return
        _procesando.update { it + usuario.id }
        viewModelScope.launch {
            adminRepository.actualizarUsuario(usuario.id, nombre, matricula, coordinacion)
                .onSuccess {
                    canal.exito("Datos de $nombre guardados")
                    cargar()
                }
                .onFailure { canal.error(it.mensajeAmigable("No se pudieron guardar los cambios.")) }
            _procesando.update { it - usuario.id }
        }
    }
}
