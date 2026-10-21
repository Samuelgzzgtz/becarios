package com.fime.docencheck.ui.ingeniero.siase

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.session.SessionManager
import com.fime.docencheck.core.ui.CanalAvisos
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.data.model.EstadoReporteSiase
import com.fime.docencheck.data.model.ReporteSiaseMes
import com.fime.docencheck.data.repository.ReportePorFirmar
import com.fime.docencheck.data.repository.SiaseRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate

/**
 * [delMes]: estado efectivo de cada becario del equipo en el mes elegido (M-04).
 * [anterioresPorFirmar]: reportes 'subido' de meses previos que siguen esperando
 * firma (A-03; antes desaparecían al cambiar de mes).
 */
data class SiaseEquipoUiState(
    val mes: LocalDate,
    val delMes: List<ReporteSiaseMes>,
    val anterioresPorFirmar: List<ReportePorFirmar> = emptyList()
) {
    val mesNombre: String get() = FechaUi.mesLargo(mes)
    val idsPorFirmarDelMes: List<String>
        get() = delMes.filter { it.estado == EstadoReporteSiase.subido }.mapNotNull { it.reporte_id }
}

/** Acción que espera confirmación en un diálogo (M-16: excluir y firmar en lote no son de un toque). */
sealed interface AccionSiasePendiente {
    data class Excluir(val reporteId: String, val nombreBecario: String) : AccionSiasePendiente
    data class ConfirmarTodos(val ids: List<String>) : AccionSiasePendiente
}

class ReportesSiaseEquipoViewModel(
    private val sessionManager: SessionManager,
    @Suppress("unused") private val equipoRepository: com.fime.docencheck.data.repository.EquipoRepository,
    private val siaseRepository: SiaseRepository
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<SiaseEquipoUiState>>(UiState.Cargando)
    val estado: StateFlow<UiState<SiaseEquipoUiState>> = _estado.asStateFlow()

    /** Reportes con una acción en curso: sus botones van deshabilitados (doble toque, A-08). */
    private val _procesando = MutableStateFlow<Set<String>>(emptySet())
    val procesando: StateFlow<Set<String>> = _procesando.asStateFlow()

    private val _accionPendiente = MutableStateFlow<AccionSiasePendiente?>(null)
    val accionPendiente: StateFlow<AccionSiasePendiente?> = _accionPendiente.asStateFlow()

    /** URL firmada para "Ver reporte" (A-02); la pantalla la abre y llama a [urlAbierta]. */
    private val _urlParaAbrir = MutableStateFlow<String?>(null)
    val urlParaAbrir: StateFlow<String?> = _urlParaAbrir.asStateFlow()

    private val canal = CanalAvisos()
    val avisos = canal.avisos

    private val _mes = MutableStateFlow(FechaUi.mesActual())
    val mes: StateFlow<LocalDate> = _mes.asStateFlow()

    init {
        cargar()
    }

    fun cargar() {
        viewModelScope.launch {
            if (_estado.value !is UiState.Listo) _estado.value = UiState.Cargando
            val mes = _mes.value
            intentar {
                sessionManager.requerirUsuario()
                SiaseEquipoUiState(
                    mes = mes,
                    delMes = siaseRepository.reportesDelMes(mes),
                    anterioresPorFirmar = siaseRepository.porFirmarAntesDe(mes)
                )
            }.onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudieron cargar los reportes.")) }
        }
    }

    /** Selector de mes (A-03): -1 = mes anterior, +1 = siguiente (no más allá del actual). */
    fun cambiarMes(desplazamiento: Long) {
        val nuevo = _mes.value.plusMonths(desplazamiento)
        if (nuevo.isAfter(FechaUi.mesActual())) return
        _mes.value = nuevo
        _estado.value = UiState.Cargando
        cargar()
    }

    fun aprobar(reporteId: String) = ejecutar(listOf(reporteId), EstadoReporteSiase.confirmado, "Reporte confirmado")

    fun pedirExcluir(reporteId: String, nombreBecario: String) {
        _accionPendiente.value = AccionSiasePendiente.Excluir(reporteId, nombreBecario)
    }

    fun pedirConfirmarTodos() {
        val ids = (_estado.value as? UiState.Listo)?.datos?.idsPorFirmarDelMes.orEmpty()
        if (ids.isEmpty()) {
            canal.info("No hay reportes por confirmar en este mes.")
            return
        }
        _accionPendiente.value = AccionSiasePendiente.ConfirmarTodos(ids)
    }

    fun confirmarAccion() {
        when (val accion = _accionPendiente.value ?: return) {
            is AccionSiasePendiente.Excluir ->
                ejecutar(listOf(accion.reporteId), EstadoReporteSiase.excluido, "Reporte de ${accion.nombreBecario} excluido")
            is AccionSiasePendiente.ConfirmarTodos ->
                ejecutar(accion.ids, EstadoReporteSiase.confirmado, null)
        }
        _accionPendiente.value = null
    }

    fun cancelarAccion() {
        _accionPendiente.value = null
    }

    fun verArchivo(ruta: String) {
        viewModelScope.launch {
            siaseRepository.urlParaVer(ruta)
                .onSuccess { _urlParaAbrir.value = it }
                .onFailure { canal.error(it.mensajeAmigable("No se pudo abrir el archivo.")) }
        }
    }

    fun urlAbierta() {
        _urlParaAbrir.value = null
    }

    private fun ejecutar(ids: List<String>, estado: EstadoReporteSiase, textoExito: String?) {
        if (ids.isEmpty() || ids.any { it in _procesando.value }) return
        _procesando.update { it + ids }
        viewModelScope.launch {
            siaseRepository.firmar(ids, estado)
                .onSuccess { cambiados ->
                    when {
                        cambiados == 0 -> canal.info("Ese reporte ya había sido revisado.")
                        textoExito != null -> canal.exito(textoExito)
                        else -> canal.exito("$cambiados reporte(s) confirmados")
                    }
                    cargar()
                }
                .onFailure { canal.error(it.mensajeAmigable("No se pudo actualizar el reporte.")) }
            _procesando.update { it - ids.toSet() }
        }
    }
}
