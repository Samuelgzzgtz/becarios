package com.fime.docencheck.ui.ingeniero.modalidad

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.ui.CanalAvisos
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.data.model.ModalidadTrabajo
import com.fime.docencheck.data.repository.EquipoRepository
import com.fime.docencheck.data.repository.HorarioRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** dia_semana: 0 = domingo .. 6 = sábado, igual que la tabla horarios_modalidad. */
val DIAS_SEMANA = listOf(
    1 to "Lunes", 2 to "Martes", 3 to "Miércoles", 4 to "Jueves",
    5 to "Viernes", 6 to "Sábado", 0 to "Domingo"
)

private fun nombreDia(dia: Int): String = DIAS_SEMANA.firstOrNull { it.first == dia }?.second ?: "Día"

/**
 * El mapa solo trae los días CONFIGURADOS. Un día ausente es "Sin configurar / No
 * aplica" y la UI no debe pintarlo como Presencial seleccionado (M-07).
 */
class ConfigurarModalidadViewModel(
    private val becarioId: String,
    private val horarioRepository: HorarioRepository,
    private val equipoRepository: EquipoRepository? = null
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<Map<Int, ModalidadTrabajo>>>(UiState.Cargando)
    val estado: StateFlow<UiState<Map<Int, ModalidadTrabajo>>> = _estado.asStateFlow()

    /** Días que se están guardando ahora mismo (un spinner por día; bloquea doble toque en ese día). */
    private val _guardandoDias = MutableStateFlow<Set<Int>>(emptySet())
    val guardandoDias: StateFlow<Set<Int>> = _guardandoDias.asStateFlow()

    /** Compatibilidad: true si hay algún día guardándose. */
    private val _guardando = MutableStateFlow(false)
    val guardando: StateFlow<Boolean> = _guardando.asStateFlow()

    private val _nombreBecario = MutableStateFlow<String?>(null)
    val nombreBecario: StateFlow<String?> = _nombreBecario.asStateFlow()

    private val canal = CanalAvisos()
    val avisos = canal.avisos

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
                horarioRepository.semanaDe(becarioId).associate { it.dia_semana to it.modalidad }
            }.onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudo cargar el horario.")) }
        }
    }

    /** [modalidad] = null → "No aplica" (borra la fila). */
    fun cambiarDia(diaSemana: Int, modalidad: ModalidadTrabajo?) {
        if ((_estado.value as? UiState.Listo)?.datos == null) return
        if (diaSemana in _guardandoDias.value) return
        marcarGuardando(diaSemana, true)

        viewModelScope.launch {
            val resultado = if (modalidad == null) {
                horarioRepository.quitarDia(becarioId, diaSemana)
            } else {
                horarioRepository.configurarDia(becarioId, diaSemana, modalidad)
            }
            resultado
                .onSuccess {
                    // Se aplica sobre el estado VIGENTE, no sobre una copia tomada al tocar:
                    // así dos toques rápidos en días distintos no se pisan (M-07).
                    _estado.update { actual ->
                        if (actual !is UiState.Listo) actual
                        else UiState.Listo(
                            if (modalidad == null) actual.datos - diaSemana else actual.datos + (diaSemana to modalidad)
                        )
                    }
                    val texto = when (modalidad) {
                        null -> "No aplica"
                        ModalidadTrabajo.presencial -> "Presencial"
                        ModalidadTrabajo.home_office -> "Home office"
                    }
                    canal.exito("${nombreDia(diaSemana)}: $texto guardado")
                }
                .onFailure { canal.error(it.mensajeAmigable("No se pudo guardar ${nombreDia(diaSemana)}.")) }
            marcarGuardando(diaSemana, false)
        }
    }

    private fun marcarGuardando(dia: Int, guardando: Boolean) {
        _guardandoDias.update { if (guardando) it + dia else it - dia }
        _guardando.value = _guardandoDias.value.isNotEmpty()
    }
}
