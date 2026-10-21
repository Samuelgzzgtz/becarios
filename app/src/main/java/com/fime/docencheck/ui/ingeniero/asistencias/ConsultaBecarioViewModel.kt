package com.fime.docencheck.ui.ingeniero.asistencias

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.session.SessionManager
import com.fime.docencheck.core.ui.CanalAvisos
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.data.model.AsistenciaUi
import com.fime.docencheck.data.model.ModalidadTrabajo
import com.fime.docencheck.data.model.TipoAsistencia
import com.fime.docencheck.data.repository.AsistenciaRepository
import com.fime.docencheck.data.repository.EquipoRepository
import com.fime.docencheck.ui.becario.consulta.FiltroFechas
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate

class ConsultaBecarioViewModel(
    private val becarioId: String,
    private val asistenciaRepository: AsistenciaRepository,
    private val equipoRepository: EquipoRepository? = null,
    private val sessionManager: SessionManager? = null
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<List<AsistenciaUi>>>(UiState.Cargando)
    val estado: StateFlow<UiState<List<AsistenciaUi>>> = _estado.asStateFlow()

    /** Nombre del becario para el encabezado (M-17). */
    private val _nombreBecario = MutableStateFlow<String?>(null)
    val nombreBecario: StateFlow<String?> = _nombreBecario.asStateFlow()

    private val _filtro = MutableStateFlow<FiltroFechas?>(null)
    val filtro: StateFlow<FiltroFechas?> = _filtro.asStateFlow()

    private val _tipoFiltro = MutableStateFlow<TipoAsistencia?>(null)
    val tipoFiltro: StateFlow<TipoAsistencia?> = _tipoFiltro.asStateFlow()

    /** Hay una corrección guardándose (bloquea el doble toque). */
    private val _guardando = MutableStateFlow(false)
    val guardando: StateFlow<Boolean> = _guardando.asStateFlow()

    private val canal = CanalAvisos()
    val avisos = canal.avisos

    init {
        viewModelScope.launch {
            equipoRepository?.let { repo -> intentar { repo.usuario(becarioId) }.onSuccess { _nombreBecario.value = it?.nombre } }
        }
        recargar()
    }

    fun recargar() {
        viewModelScope.launch {
            if (_estado.value !is UiState.Listo) _estado.value = UiState.Cargando
            intentar {
                val rango = _filtro.value
                val lista = if (rango == null) {
                    asistenciaRepository.historial(becarioId, limite = 200)
                } else {
                    asistenciaRepository.historialEntreFechas(becarioId, rango.desde, rango.hasta)
                }
                lista.filter { _tipoFiltro.value == null || it.tipo == _tipoFiltro.value }.map { AsistenciaUi(it) }
            }.onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudo cargar el historial.")) }
        }
    }

    fun filtrarPorRango(desde: LocalDate, hasta: LocalDate) {
        if (hasta.isBefore(desde)) {
            canal.error("La fecha final no puede ser anterior a la inicial.")
            return
        }
        _filtro.value = FiltroFechas(desde, hasta)
        recargar()
    }

    fun filtrarSemanaActual() = filtrarPorRango(FechaUi.lunesDe(), FechaUi.hoy())

    fun filtrarPorTipo(tipo: TipoAsistencia?) {
        _tipoFiltro.value = tipo
        recargar()
    }

    fun limpiarFiltros() {
        _filtro.value = null
        _tipoFiltro.value = null
        recargar()
    }

    /**
     * Corrección manual del ingeniero (C-04): p. ej. agregar la salida que el
     * becario olvidó. [ocurridoEn] es el instante elegido en la UI.
     */
    fun agregarRegistroManual(tipo: TipoAsistencia, ocurridoEn: Instant, modalidad: ModalidadTrabajo) {
        val sesion = sessionManager ?: return
        if (_guardando.value) return
        _guardando.value = true
        viewModelScope.launch {
            intentar {
                val ingeniero = sesion.requerirUsuario()
                asistenciaRepository.agregarManual(becarioId, tipo, ocurridoEn, modalidad, ingeniero.id).getOrThrow()
            }.onSuccess {
                canal.exito("Registro agregado.")
                recargar()
            }.onFailure { canal.error(it.mensajeAmigable("No se pudo agregar el registro.")) }
            _guardando.value = false
        }
    }

    /** Borra un registro equivocado (C-04). La UI debe confirmar antes con DialogoConfirmacion. */
    fun eliminarRegistro(asistenciaId: String) {
        if (_guardando.value) return
        _guardando.value = true
        viewModelScope.launch {
            asistenciaRepository.eliminar(asistenciaId)
                .onSuccess {
                    canal.exito("Registro eliminado.")
                    recargar()
                }
                .onFailure { canal.error(it.mensajeAmigable("No se pudo eliminar el registro.")) }
            _guardando.value = false
        }
    }
}
