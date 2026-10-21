package com.fime.docencheck.ui.becario.reportehoras

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.session.SessionManager
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.data.model.ModalidadTrabajo
import com.fime.docencheck.data.model.ProgresoHoras
import com.fime.docencheck.data.model.horasPorDia
import com.fime.docencheck.data.repository.AsistenciaRepository
import com.fime.docencheck.data.repository.HorarioRepository
import com.fime.docencheck.data.repository.ProgresoRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate

/** Vista que elige el segmentado Semana/Mes/Semestre (A-15). */
enum class PeriodoReporte { SEMANA, MES, SEMESTRE }

/**
 * Un día de la cuadrícula L–D de la semana LOCAL en curso (A-15).
 * [modalidad] = null: ese día no está configurado (no aplica / sin configurar).
 */
data class DiaReporte(
    val fecha: LocalDate,
    val horas: Double,
    val modalidad: ModalidadTrabajo?,
    val esHoy: Boolean,
    val esFuturo: Boolean
)

class ReporteHorasViewModel(
    private val sessionManager: SessionManager,
    private val progresoRepository: ProgresoRepository,
    private val asistenciaRepository: AsistenciaRepository,
    private val horarioRepository: HorarioRepository
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<ProgresoHoras>>(UiState.Cargando)
    val estado: StateFlow<UiState<ProgresoHoras>> = _estado.asStateFlow()

    private val _periodo = MutableStateFlow(PeriodoReporte.SEMANA)
    val periodo: StateFlow<PeriodoReporte> = _periodo.asStateFlow()

    /** Siempre 7 elementos, de lunes a domingo de la semana local actual. */
    private val _semana = MutableStateFlow<List<DiaReporte>>(emptyList())
    val semana: StateFlow<List<DiaReporte>> = _semana.asStateFlow()

    private val _horasPorDia = MutableStateFlow<Map<LocalDate, Double>>(emptyMap())
    val horasPorDia: StateFlow<Map<LocalDate, Double>> = _horasPorDia.asStateFlow()

    /** dia_semana en la tabla: 0 = domingo ... 6 = sábado (extract(dow) de Postgres). */
    private val _modalidadPorDiaSemana = MutableStateFlow<Map<Int, ModalidadTrabajo>>(emptyMap())
    val modalidadPorDiaSemana: StateFlow<Map<Int, ModalidadTrabajo>> = _modalidadPorDiaSemana.asStateFlow()

    init {
        recargar()
    }

    fun seleccionarPeriodo(periodo: PeriodoReporte) {
        _periodo.value = periodo
    }

    fun recargar() {
        viewModelScope.launch {
            if (_estado.value !is UiState.Listo) _estado.value = UiState.Cargando
            val usuario = intentar { sessionManager.requerirUsuario() }.getOrElse {
                _estado.value = UiState.Error(it.mensajeAmigable("No se pudo identificar la sesión."))
                return@launch
            }

            intentar { progresoRepository.progresoDe(usuario.id) }
                .onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudo cargar tu progreso.")) }

            val lunes = FechaUi.lunesDe()
            val domingo = lunes.plusDays(6)
            val horas = intentar { asistenciaRepository.historialEntreFechas(usuario.id, lunes, domingo) }
                .map { horasPorDia(it) }
                .getOrDefault(emptyMap())
            _horasPorDia.value = horas

            val modalidades = intentar { horarioRepository.semanaConRespaldo(usuario.id) }
                .map { dias -> dias.associate { it.dia_semana to it.modalidad } }
                .getOrDefault(emptyMap())
            _modalidadPorDiaSemana.value = modalidades

            val hoy = FechaUi.hoy()
            _semana.value = (0L..6L).map { desplazamiento ->
                val fecha = lunes.plusDays(desplazamiento)
                DiaReporte(
                    fecha = fecha,
                    horas = horas[fecha] ?: 0.0,
                    modalidad = modalidades[FechaUi.diaSemanaTabla(fecha)],
                    esHoy = fecha == hoy,
                    esFuturo = fecha.isAfter(hoy)
                )
            }
        }
    }
}
