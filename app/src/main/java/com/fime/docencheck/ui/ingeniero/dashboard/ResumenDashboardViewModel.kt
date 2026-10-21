package com.fime.docencheck.ui.ingeniero.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.data.model.AsistenciaUi
import com.fime.docencheck.data.model.EstadoVentanaSiase
import com.fime.docencheck.data.repository.AsistenciaRepository
import com.fime.docencheck.data.repository.ProgresoRepository
import com.fime.docencheck.data.repository.SiaseRepository
import com.fime.docencheck.ui.ingeniero.asistencias.cargarAsistenciasEquipo
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Un evento de "Actividad reciente": registro + nombre del becario. */
data class EventoEquipo(val asistencia: AsistenciaUi, val nombre: String)

/**
 * Lo que el dashboard muestra además de los indicadores de DashboardViewModel
 * (auditoría M-09: "Asistencias hoy", "Ventana reporte mensual", "Actividad
 * reciente"). Solo lectura; si algo falla, esa tarjeta no se muestra.
 */
data class ResumenDashboard(
    val conRegistroHoy: Int? = null,
    val actividad: List<EventoEquipo> = emptyList(),
    val ventana: EstadoVentanaSiase? = null
)

class ResumenDashboardViewModel(
    private val progresoRepository: ProgresoRepository,
    private val asistenciaRepository: AsistenciaRepository,
    private val siaseRepository: SiaseRepository
) : ViewModel() {

    private val _resumen = MutableStateFlow(ResumenDashboard())
    val resumen: StateFlow<ResumenDashboard> = _resumen.asStateFlow()

    private var carga: Job? = null

    init {
        cargar()
    }

    fun cargar() {
        if (carga?.isActive == true) return
        carga = viewModelScope.launch {
            val ventana = intentar { siaseRepository.estadoVentana() }.getOrNull()
            val equipo = intentar { progresoRepository.progresoEquipo() }.getOrNull()
            if (equipo == null) {
                _resumen.value = _resumen.value.copy(ventana = ventana)
                return@launch
            }
            val nombres = equipo.associate { it.becario_id to it.nombre }
            val hoy = FechaUi.hoy()
            val registros = intentar {
                cargarAsistenciasEquipo(asistenciaRepository, equipo.map { it.becario_id }, hoy.minusDays(6), hoy)
            }.getOrNull()
            _resumen.value = ResumenDashboard(
                conRegistroHoy = registros?.filter { FechaUi.fechaLocal(it.asistencia.ocurrido_en) == hoy }
                    ?.map { it.asistencia.becario_id }?.distinct()?.size,
                actividad = registros.orEmpty().take(6).map { EventoEquipo(it, nombres[it.asistencia.becario_id] ?: "Becario") },
                ventana = ventana
            )
        }
    }
}
