package com.fime.docencheck.ui.ingeniero.asistencias

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.session.SessionManager
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.data.model.AsistenciaUi
import com.fime.docencheck.data.model.ProgresoBecario
import com.fime.docencheck.data.model.TipoAsistencia
import com.fime.docencheck.data.repository.AsistenciaRepository
import com.fime.docencheck.data.repository.ProgresoRepository
import com.fime.docencheck.ui.becario.consulta.FiltroFechas
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate

/** Un becario del equipo para el filtro (id + nombre). */
data class BecarioFiltro(val id: String, val nombre: String, val matricula: String)

/**
 * Historial de varios becarios en un rango de fechas locales, en paralelo y
 * ordenado del más reciente al más antiguo. Solo lectura con los repositorios
 * existentes (capa de UI, auditoría M-17).
 */
suspend fun cargarAsistenciasEquipo(
    repositorio: AsistenciaRepository,
    becarioIds: List<String>,
    desde: LocalDate,
    hasta: LocalDate
): List<AsistenciaUi> = coroutineScope {
    becarioIds
        .map { id -> async { repositorio.historialEntreFechas(id, desde, hasta) } }
        .awaitAll()
        .flatten()
        .map { AsistenciaUi(it) }
        .sortedByDescending { FechaUi.parsear(it.asistencia.ocurrido_en) }
}

/** Consulta de asistencias de TODO el equipo, con filtros de becario, fechas y tipo (M-17). */
class ConsultaEquipoViewModel(
    private val sessionManager: SessionManager,
    private val progresoRepository: ProgresoRepository,
    private val asistenciaRepository: AsistenciaRepository
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<List<AsistenciaUi>>>(UiState.Cargando)
    val estado: StateFlow<UiState<List<AsistenciaUi>>> = _estado.asStateFlow()

    private val _becarios = MutableStateFlow<List<BecarioFiltro>>(emptyList())
    val becarios: StateFlow<List<BecarioFiltro>> = _becarios.asStateFlow()

    /** null = todo el equipo. */
    private val _becario = MutableStateFlow<BecarioFiltro?>(null)
    val becario: StateFlow<BecarioFiltro?> = _becario.asStateFlow()

    /** Siempre hay rango (consultar a todo el equipo sin límite sería muy pesado). */
    private val _filtro = MutableStateFlow(FiltroFechas(FechaUi.lunesDe(), FechaUi.hoy()))
    val filtro: StateFlow<FiltroFechas> = _filtro.asStateFlow()

    private val _tipo = MutableStateFlow<TipoAsistencia?>(null)
    val tipo: StateFlow<TipoAsistencia?> = _tipo.asStateFlow()

    private var carga: Job? = null

    init {
        recargar()
    }

    fun recargar() {
        carga?.cancel()
        carga = viewModelScope.launch {
            if (_estado.value !is UiState.Listo) _estado.value = UiState.Cargando
            intentar {
                sessionManager.requerirUsuario()
                if (_becarios.value.isEmpty()) {
                    _becarios.value = progresoRepository.progresoEquipo().map(ProgresoBecario::aFiltro).sortedBy { it.nombre }
                }
                val ids = _becario.value?.let { listOf(it.id) } ?: _becarios.value.map { it.id }
                val rango = _filtro.value
                cargarAsistenciasEquipo(asistenciaRepository, ids, rango.desde, rango.hasta)
                    .filter { _tipo.value == null || it.asistencia.tipo == _tipo.value }
            }.onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudieron cargar las asistencias del equipo.")) }
        }
    }

    fun elegirBecario(becario: BecarioFiltro?) {
        _becario.value = becario
        _estado.value = UiState.Cargando
        recargar()
    }

    fun filtrarPorRango(desde: LocalDate, hasta: LocalDate) {
        _filtro.value = if (hasta.isBefore(desde)) FiltroFechas(hasta, desde) else FiltroFechas(desde, hasta)
        _estado.value = UiState.Cargando
        recargar()
    }

    fun filtrarSemanaActual() = filtrarPorRango(FechaUi.lunesDe(), FechaUi.hoy())

    fun filtrarSemanaPasada() {
        val lunes = FechaUi.lunesDe().minusWeeks(1)
        filtrarPorRango(lunes, lunes.plusDays(6))
    }

    fun filtrarPorTipo(tipo: TipoAsistencia?) {
        _tipo.value = tipo
        recargar()
    }

    fun nombreDe(becarioId: String): String? = _becarios.value.firstOrNull { it.id == becarioId }?.nombre
}

private fun ProgresoBecario.aFiltro() = BecarioFiltro(becario_id, nombre, matricula)
