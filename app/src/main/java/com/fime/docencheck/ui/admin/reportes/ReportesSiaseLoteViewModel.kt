package com.fime.docencheck.ui.admin.reportes

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
import com.fime.docencheck.data.repository.AdminRepository
import com.fime.docencheck.data.repository.ReportePorFirmar
import com.fime.docencheck.data.repository.SiaseRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate

/** Una fila del mes con su estado EFECTIVO (con o sin fila en la base, A-04/M-04). */
data class FilaReporteLote(val fila: ReporteSiaseMes, val seleccionado: Boolean = false) {
    val firmable: Boolean get() = fila.estado == EstadoReporteSiase.subido && fila.reporte_id != null
}

data class LoteUiState(
    val mes: LocalDate,
    val filas: List<FilaReporteLote>,
    /** 'subido' de meses anteriores que siguen esperando firma (A-03). */
    val anterioresPorFirmar: List<ReportePorFirmar> = emptyList(),
    val firmando: Boolean = false,
    /** Diálogo de confirmación de la firma en lote abierto. */
    val confirmando: Boolean = false
) {
    val mesNombre: String get() = FechaUi.mesLargo(mes)
    val seleccionados: List<String> get() = filas.filter { it.seleccionado && it.firmable }.mapNotNull { it.fila.reporte_id }
    val firmables: Int get() = filas.count { it.firmable }
}

class ReportesSiaseLoteViewModel(
    @Suppress("unused") private val sessionManager: SessionManager,
    @Suppress("unused") private val adminRepository: AdminRepository,
    private val siaseRepository: SiaseRepository
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<LoteUiState>>(UiState.Cargando)
    val estado: StateFlow<UiState<LoteUiState>> = _estado.asStateFlow()

    private val _urlParaAbrir = MutableStateFlow<String?>(null)
    val urlParaAbrir: StateFlow<String?> = _urlParaAbrir.asStateFlow()

    private val canal = CanalAvisos()
    val avisos = canal.avisos

    private var mes: LocalDate = FechaUi.mesActual()

    init {
        cargar()
    }

    fun cargar() {
        if ((_estado.value as? UiState.Listo)?.datos?.firmando == true) return
        viewModelScope.launch {
            if (_estado.value !is UiState.Listo) _estado.value = UiState.Cargando
            val mesCarga = mes
            intentar {
                LoteUiState(
                    mes = mesCarga,
                    filas = siaseRepository.reportesDelMes(mesCarga).map { FilaReporteLote(it) },
                    anterioresPorFirmar = siaseRepository.porFirmarAntesDe(mesCarga)
                )
            }.onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudieron cargar los reportes.")) }
        }
    }

    /** Selector de mes (A-03). */
    fun cambiarMes(desplazamiento: Long) {
        val nuevo = mes.plusMonths(desplazamiento)
        if (nuevo.isAfter(FechaUi.mesActual())) return
        mes = nuevo
        _estado.value = UiState.Cargando
        cargar()
    }

    fun alternarSeleccion(becarioId: String) = actualizar { actual ->
        actual.copy(filas = actual.filas.map {
            if (it.fila.becario_id == becarioId && it.firmable) it.copy(seleccionado = !it.seleccionado) else it
        })
    }

    /** "Seleccionar todos (N)" / quitar selección (M-16). */
    fun seleccionarTodos(seleccionar: Boolean = true) = actualizar { actual ->
        actual.copy(filas = actual.filas.map { if (it.firmable) it.copy(seleccionado = seleccionar) else it })
    }

    /** Abre la confirmación; con 0 seleccionados avisa en vez de no hacer nada (M-16). */
    fun pedirFirma() {
        val actual = (_estado.value as? UiState.Listo)?.datos ?: return
        if (actual.firmando) return
        if (actual.seleccionados.isEmpty()) {
            canal.info("Selecciona al menos un reporte subido para firmar.")
            return
        }
        actualizar { it.copy(confirmando = true) }
    }

    fun cancelarFirma() = actualizar { it.copy(confirmando = false) }

    /** Compatibilidad con la pantalla actual: firma con confirmación. */
    fun firmarSeleccionados() = pedirFirma()

    fun confirmarFirma() {
        val actual = (_estado.value as? UiState.Listo)?.datos ?: return
        val ids = actual.seleccionados
        if (actual.firmando || ids.isEmpty()) return
        actualizar { it.copy(firmando = true, confirmando = false) }
        firmar(ids)
    }

    /** Firmar un pendiente de un mes anterior (A-03). */
    fun firmarAnterior(reporteId: String) {
        val actual = (_estado.value as? UiState.Listo)?.datos ?: return
        if (actual.firmando) return
        actualizar { it.copy(firmando = true) }
        firmar(listOf(reporteId))
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

    /** El resultado se informa siempre (A-08: antes se ignoraba y solo se recargaba la lista). */
    private fun firmar(ids: List<String>) {
        viewModelScope.launch {
            siaseRepository.firmar(ids)
                .onSuccess { n ->
                    if (n < ids.size) canal.info("Se firmaron $n de ${ids.size}; los demás ya habían sido revisados.")
                    else canal.exito("$n reporte(s) firmados")
                }
                .onFailure { canal.error(it.mensajeAmigable("No se pudieron firmar los reportes.")) }
            actualizar { it.copy(firmando = false) }
            cargar()
        }
    }

    private fun actualizar(transformar: (LoteUiState) -> LoteUiState) {
        _estado.update { actual -> if (actual is UiState.Listo) UiState.Listo(transformar(actual.datos)) else actual }
    }
}
