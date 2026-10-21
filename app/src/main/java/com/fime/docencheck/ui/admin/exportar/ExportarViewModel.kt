package com.fime.docencheck.ui.admin.exportar

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.ErrorDeNegocio
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.data.repository.AdminRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.time.LocalDate

/** Archivo listo para compartir y cuántos registros trae (A-16: "1,284 registros"). */
data class ArchivoExportado(val archivo: File, val registros: Int)

data class ExportarUiState(
    /** Fechas LOCALES, ambas inclusivas (antes "hasta" era exclusivo y en UTC). */
    val desde: String = FechaUi.mesActual().toString(),
    val hasta: String = FechaUi.hoy().toString(),
    val generando: Boolean = false,
    val archivo: ArchivoExportado? = null,
    val error: String? = null,
    /** Último resultado, para mostrarlo tras compartir. */
    val resumen: String? = null
)

class ExportarViewModel(private val adminRepository: AdminRepository) : ViewModel() {

    private val _estado = MutableStateFlow(ExportarUiState())
    val estado: StateFlow<ExportarUiState> = _estado.asStateFlow()

    fun cambiarDesde(v: String) = _estado.update { it.copy(desde = v, error = null) }

    fun cambiarHasta(v: String) = _estado.update { it.copy(hasta = v, error = null) }

    /**
     * Genera el CSV y lo escribe en [directorio] (cacheDir) FUERA del hilo
     * principal. Antes se escribía en un LaunchedEffect de la pantalla.
     */
    fun generar(directorio: File) {
        val actual = _estado.value
        if (actual.generando) return
        _estado.update { it.copy(generando = true, error = null, archivo = null, resumen = null) }
        viewModelScope.launch {
            intentar {
                val desde = parsear(actual.desde, "inicial")
                val hasta = parsear(actual.hasta, "final")
                val exportacion = adminRepository.exportarAsistenciasCsv(desde, hasta)
                val archivo = withContext(Dispatchers.IO) {
                    File(directorio, "asistencias_${desde}_a_${hasta}.csv").apply { writeText(exportacion.contenido, Charsets.UTF_8) }
                }
                ArchivoExportado(archivo, exportacion.registros)
            }.onSuccess { exportado ->
                _estado.update {
                    it.copy(
                        generando = false,
                        archivo = exportado,
                        resumen = if (exportado.registros == 0) "No hay asistencias en ese rango."
                        else "%,d registros exportados".format(exportado.registros)
                    )
                }
            }.onFailure { e ->
                _estado.update { it.copy(generando = false, error = e.mensajeAmigable("No se pudo generar el archivo.")) }
            }
        }
    }

    fun archivoCompartido() = _estado.update { it.copy(archivo = null) }

    private fun parsear(texto: String, cual: String): LocalDate =
        runCatching { LocalDate.parse(texto.trim()) }.getOrElse {
            throw ErrorDeNegocio("La fecha $cual debe tener el formato aaaa-mm-dd.")
        }
}
