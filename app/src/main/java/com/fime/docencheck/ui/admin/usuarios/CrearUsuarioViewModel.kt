package com.fime.docencheck.ui.admin.usuarios

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.data.model.Perfil
import com.fime.docencheck.data.repository.AdminRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FormularioNuevoUsuario(
    val nombre: String = "",
    val matricula: String = "",
    val email: String = "",
    val password: String = "",
    val coordinacion: String = "",
    val guardando: Boolean = false,
    val guardado: Boolean = false,
    val error: String? = null
)

private val FORMATO_CORREO = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

class CrearUsuarioViewModel(
    private val perfil: Perfil,
    private val adminRepository: AdminRepository
) : ViewModel() {

    private val _estado = MutableStateFlow(FormularioNuevoUsuario())
    val estado: StateFlow<FormularioNuevoUsuario> = _estado.asStateFlow()

    fun cambiarNombre(v: String) = _estado.update { it.copy(nombre = v, error = null) }
    fun cambiarMatricula(v: String) = _estado.update { it.copy(matricula = v, error = null) }
    fun cambiarEmail(v: String) = _estado.update { it.copy(email = v, error = null) }
    fun cambiarPassword(v: String) = _estado.update { it.copy(password = v, error = null) }
    fun cambiarCoordinacion(v: String) = _estado.update { it.copy(coordinacion = v, error = null) }

    fun guardar() {
        val actual = _estado.value
        if (actual.guardando || actual.guardado) return
        val error = when {
            actual.nombre.isBlank() || actual.matricula.isBlank() || actual.email.isBlank() ->
                "Completa nombre, matrícula y correo."
            !FORMATO_CORREO.matches(actual.email.trim()) -> "El correo no tiene un formato válido."
            actual.password.length < 6 -> "La contraseña temporal necesita al menos 6 caracteres."
            else -> null
        }
        if (error != null) {
            _estado.update { it.copy(error = error) }
            return
        }

        _estado.update { it.copy(guardando = true, error = null) }
        viewModelScope.launch {
            adminRepository.crearUsuario(
                email = actual.email,
                password = actual.password,
                perfil = perfil,
                nombre = actual.nombre,
                matricula = actual.matricula,
                coordinacion = actual.coordinacion.ifBlank { null }
            ).onSuccess { _estado.update { it.copy(guardando = false, guardado = true) } }
                .onFailure { e -> _estado.update { it.copy(guardando = false, error = e.mensajeAmigable("No se pudo crear la cuenta.")) } }
        }
    }
}
