package com.fime.docencheck.ui.becario.consulta

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.session.SessionManager
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.data.model.AsistenciaUi
import com.fime.docencheck.data.repository.AsistenciaRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate

/** Rango de fechas LOCALES, ambas inclusivas. null = sin filtro (últimos 200). */
data class FiltroFechas(val desde: LocalDate, val hasta: LocalDate)

class ConsultaAsistenciasViewModel(
    private val sessionManager: SessionManager,
    private val asistenciaRepository: AsistenciaRepository
) : ViewModel() {

    /** Incluye lo que sigue en el teléfono sin subir, marcado con `sinSubir` (A-14). */
    private val _estado = MutableStateFlow<UiState<List<AsistenciaUi>>>(UiState.Cargando)
    val estado: StateFlow<UiState<List<AsistenciaUi>>> = _estado.asStateFlow()

    private val _filtro = MutableStateFlow<FiltroFechas?>(null)
    val filtro: StateFlow<FiltroFechas?> = _filtro.asStateFlow()

    init {
        recargar()
    }

    fun recargar() {
        viewModelScope.launch {
            if (_estado.value !is UiState.Listo) _estado.value = UiState.Cargando
            intentar {
                val usuario = sessionManager.requerirUsuario()
                val rango = _filtro.value
                val remotas = if (rango == null) {
                    asistenciaRepository.historial(usuario.id, limite = 200)
                } else {
                    asistenciaRepository.historialEntreFechas(usuario.id, rango.desde, rango.hasta)
                }
                val locales = asistenciaRepository.localesComoUi(usuario.id, rango?.desde, rango?.hasta)
                (locales + remotas.map { AsistenciaUi(it) })
                    .sortedByDescending { FechaUi.parsear(it.asistencia.ocurrido_en) }
            }.onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudo cargar tu historial.")) }
        }
    }

    /** Filtra por un rango de fechas locales, ambas inclusivas (para el DateRangePicker). */
    fun filtrarPorRango(desde: LocalDate, hasta: LocalDate) {
        if (hasta.isBefore(desde)) {
            _estado.value = UiState.Error("La fecha final no puede ser anterior a la inicial.")
            return
        }
        _filtro.value = FiltroFechas(desde, hasta)
        _estado.value = UiState.Cargando
        recargar()
    }

    /** Atajo: la semana local en curso (lunes a hoy). */
    fun filtrarSemanaActual() = filtrarPorRango(FechaUi.lunesDe(), FechaUi.hoy())

    /** Atajo: la semana pasada (lunes a domingo). */
    fun filtrarSemanaPasada() {
        val lunes = FechaUi.lunesDe().minusWeeks(1)
        filtrarPorRango(lunes, lunes.plusDays(6))
    }

    fun limpiarFiltro() {
        _filtro.value = null
        _estado.value = UiState.Cargando
        recargar()
    }
}
