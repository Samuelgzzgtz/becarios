package com.fime.docencheck.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.data.model.Usuario
import com.fime.docencheck.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val cargando: Boolean = false,
    val error: String? = null,
    val usuarioAutenticado: Usuario? = null,
    /** true mientras se revisa si hay una sesión guardada (M-14): mostrar splash, no el formulario. */
    val verificandoSesion: Boolean = true
)

class LoginViewModel(private val authRepository: AuthRepository) : ViewModel() {

    private val _estado = MutableStateFlow(LoginUiState())
    val estado: StateFlow<LoginUiState> = _estado.asStateFlow()

    init {
        verificarSesionGuardada()
    }

    /**
     * Antes esto hacía red dentro de `init` sin atrapar nada: sin señal, la app se
     * cerraba al abrirla (A-11). Ahora cualquier fallo deja el formulario visible con
     * el motivo (cuenta inactiva, sin conexión...).
     */
    fun verificarSesionGuardada() {
        _estado.update { it.copy(verificandoSesion = true, error = null) }
        viewModelScope.launch {
            intentar { authRepository.sesionActiva() }
                .onSuccess { usuario ->
                    _estado.update { it.copy(verificandoSesion = false, usuarioAutenticado = usuario) }
                }
                .onFailure { e ->
                    _estado.update {
                        it.copy(verificandoSesion = false, error = e.mensajeAmigable("No se pudo verificar tu sesión."))
                    }
                }
        }
    }

    fun onEmailCambia(valor: String) {
        _estado.update { it.copy(email = valor, error = null) }
    }

    fun onPasswordCambia(valor: String) {
        _estado.update { it.copy(password = valor, error = null) }
    }

    fun iniciarSesion() {
        val actual = _estado.value
        if (actual.cargando || actual.verificandoSesion) return
        if (actual.email.isBlank() || actual.password.isBlank()) {
            _estado.update { it.copy(error = "Ingresa tu correo y contraseña") }
            return
        }

        _estado.update { it.copy(cargando = true, error = null) }
        viewModelScope.launch {
            authRepository.iniciarSesion(actual.email.trim(), actual.password)
                .onSuccess { usuario ->
                    _estado.update { it.copy(cargando = false, usuarioAutenticado = usuario) }
                }
                .onFailure { excepcion ->
                    _estado.update {
                        it.copy(cargando = false, error = excepcion.mensajeAmigable("No se pudo iniciar sesión."))
                    }
                }
        }
    }

    /** Tras navegar al grafo del perfil: evita que, al volver a esta pantalla, se redirija otra vez. */
    fun navegacionHecha() {
        _estado.update { it.copy(usuarioAutenticado = null, password = "") }
    }
}
