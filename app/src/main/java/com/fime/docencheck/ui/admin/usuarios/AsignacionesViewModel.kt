package com.fime.docencheck.ui.admin.usuarios

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.data.model.Perfil
import com.fime.docencheck.data.model.Usuario
import com.fime.docencheck.data.repository.AdminRepository
import com.fime.docencheck.data.repository.ProgresoRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Quién supervisa a quién, para filtrar becarios por ingeniero y mostrar
 * "N becarios" en cada ingeniero. Solo lectura (progreso_equipo trae el
 * ingeniero_id de cada becario activo). Si falla, las listas siguen funcionando
 * sin esa información.
 */
data class Asignaciones(
    val ingenieros: List<Usuario> = emptyList(),
    /** becarioId → ingenieroId (null = sin asignar). Solo becarios activos. */
    val ingenieroDe: Map<String, String?> = emptyMap()
) {
    fun nombreIngeniero(becarioId: String): String? =
        ingenieroDe[becarioId]?.let { id -> ingenieros.firstOrNull { it.id == id }?.nombre }

    fun becariosDe(ingenieroId: String): Int = ingenieroDe.values.count { it == ingenieroId }

    val conocida: Boolean get() = ingenieroDe.isNotEmpty()
}

class AsignacionesViewModel(
    private val adminRepository: AdminRepository,
    private val progresoRepository: ProgresoRepository
) : ViewModel() {

    private val _asignaciones = MutableStateFlow(Asignaciones())
    val asignaciones: StateFlow<Asignaciones> = _asignaciones.asStateFlow()

    init {
        cargar()
    }

    fun cargar() {
        viewModelScope.launch {
            val ingenieros = intentar { adminRepository.listarPorPerfil(Perfil.ingeniero) }.getOrNull()
            val equipo = intentar { progresoRepository.progresoEquipo() }.getOrNull()
            _asignaciones.value = Asignaciones(
                ingenieros = ingenieros ?: _asignaciones.value.ingenieros,
                ingenieroDe = equipo?.associate { it.becario_id to it.ingeniero_id } ?: _asignaciones.value.ingenieroDe
            )
        }
    }
}
