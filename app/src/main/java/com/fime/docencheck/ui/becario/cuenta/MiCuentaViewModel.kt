package com.fime.docencheck.ui.becario.cuenta

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.data.model.Perfil
import com.fime.docencheck.data.model.Usuario
import com.fime.docencheck.data.repository.AsistenciaRepository
import com.fime.docencheck.data.repository.AuthRepository
import com.fime.docencheck.data.repository.EquipoRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** [ingenieroNoDisponible]: falló la consulta (p. ej. sin red); no es lo mismo que "Sin asignar". */
data class MiCuentaUiState(
    val usuario: Usuario,
    val ingenieroAsignado: Usuario? = null,
    val ingenieroNoDisponible: Boolean = false
)

/** Estado del flujo de cierre de sesión (A-12, B-08). */
sealed interface CierreSesion {
    data object Inactivo : CierreSesion
    data object EnCurso : CierreSesion

    /** Hay registros sin subir que se perderían: la pantalla debe pedir confirmación. */
    data class ConfirmarConPendientes(val pendientes: Int) : CierreSesion
    data object Cerrada : CierreSesion
}

class MiCuentaViewModel(
    private val authRepository: AuthRepository,
    private val equipoRepository: EquipoRepository,
    private val asistenciaRepository: AsistenciaRepository? = null
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<MiCuentaUiState>>(UiState.Cargando)
    val estado: StateFlow<UiState<MiCuentaUiState>> = _estado.asStateFlow()

    private val _cierre = MutableStateFlow<CierreSesion>(CierreSesion.Inactivo)
    val cierre: StateFlow<CierreSesion> = _cierre.asStateFlow()

    /** Compatibilidad con la pantalla actual: true cuando ya se cerró la sesión. */
    private val _sesionCerrada = MutableStateFlow(false)
    val sesionCerrada: StateFlow<Boolean> = _sesionCerrada.asStateFlow()

    private var usuarioId: String? = null

    init {
        cargar()
    }

    fun cargar() {
        viewModelScope.launch {
            _estado.value = UiState.Cargando
            intentar {
                val usuario = authRepository.sesionActiva()
                    ?: throw IllegalStateException("sin sesión")
                usuarioId = usuario.id
                val consulta = if (usuario.perfil == Perfil.becario) {
                    intentar { equipoRepository.ingenieroDe(usuario.id) }
                } else {
                    null
                }
                MiCuentaUiState(
                    usuario,
                    ingenieroAsignado = consulta?.getOrNull(),
                    ingenieroNoDisponible = consulta?.isFailure == true
                )
            }.onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudo cargar tu cuenta.")) }
        }
    }

    /**
     * Cerrar sesión funciona en cualquier estado de la pantalla, incluso si la
     * cuenta no cargó o no hay red (A-11/A-12). Antes de borrar algo, intenta subir
     * la cola offline; si aún quedan registros, pide confirmación.
     */
    fun cerrarSesion() {
        if (_cierre.value == CierreSesion.EnCurso || _cierre.value == CierreSesion.Cerrada) return
        _cierre.value = CierreSesion.EnCurso
        viewModelScope.launch {
            val repo = asistenciaRepository
            val id = usuarioId
            if (repo != null && id != null && repo.pendientesSinSubir(id) > 0) {
                repo.sincronizarPendientes()
                val restantes = repo.pendientesSinSubir(id)
                if (restantes > 0) {
                    _cierre.value = CierreSesion.ConfirmarConPendientes(restantes)
                    return@launch
                }
            }
            terminarCierre()
        }
    }

    /** El usuario aceptó perder los registros que no se pudieron subir. */
    fun confirmarCierreConPendientes() {
        if (_cierre.value !is CierreSesion.ConfirmarConPendientes) return
        _cierre.value = CierreSesion.EnCurso
        viewModelScope.launch { terminarCierre() }
    }

    fun cancelarCierre() {
        if (_cierre.value is CierreSesion.ConfirmarConPendientes) _cierre.value = CierreSesion.Inactivo
    }

    private suspend fun terminarCierre() {
        // La cola es del usuario que se va: no debe pasar al siguiente que entre en este teléfono (A-12).
        usuarioId?.let { id -> asistenciaRepository?.let { intentar { it.descartarPendientes(id) } } }
        authRepository.cerrarSesion()
        _cierre.value = CierreSesion.Cerrada
        _sesionCerrada.value = true
    }
}
