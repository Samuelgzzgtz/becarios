package com.fime.docencheck.ui.becario.siase

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.ErrorDeNegocio
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.session.SessionManager
import com.fime.docencheck.core.ui.CanalAvisos
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.data.model.EstadoReporteSiase
import com.fime.docencheck.data.model.EstadoVentanaSiase
import com.fime.docencheck.data.model.ReporteSiase
import com.fime.docencheck.data.model.ReporteSiaseMes
import com.fime.docencheck.data.model.permiteSubir
import com.fime.docencheck.data.repository.SiaseRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Tamaño máximo de archivo (M-12): se lee completo en memoria para subirlo. */
const val TAMANO_MAXIMO_REPORTE = 10L * 1024 * 1024

data class SiaseUiState(
    val ventana: EstadoVentanaSiase? = null,
    /** Estado EFECTIVO del mes (misma regla que ve el ingeniero, M-04). */
    val estadoDelMes: ReporteSiaseMes? = null,
    val historial: List<ReporteSiase> = emptyList(),
    val periodoNombre: String? = null,
    val mesNombre: String = FechaUi.mesLargo(FechaUi.mesActual()),
    val subiendo: Boolean = false,
    /** Nombre real del último archivo elegido (M-12), para confirmar cuál se subió. */
    val archivoElegido: String? = null,
    val mensaje: String? = null
) {
    val estado: EstadoReporteSiase get() = estadoDelMes?.estado ?: EstadoReporteSiase.pendiente

    /** A-01: solo con la ventana abierta y mientras el reporte no haya sido revisado. */
    val puedeSubir: Boolean get() = !subiendo && ventana?.abierta == true && estado.permiteSubir

    /** Por qué el botón de subir está deshabilitado, para explicarlo en pantalla. */
    val motivoNoPuedeSubir: String?
        get() = when {
            subiendo -> null
            !estado.permiteSubir -> when (estado) {
                EstadoReporteSiase.confirmado -> "Tu ingeniero ya confirmó el reporte de este mes."
                EstadoReporteSiase.excluido -> "Este mes estás exento de entregar reporte."
                EstadoReporteSiase.sin_reporte -> "La ventana de este mes ya cerró sin que se entregara el reporte."
                else -> null
            }
            ventana?.abierta != true -> ventana?.let { "La ventana abre el ${it.fecha_apertura.takeLast(2).trimStart('0')} de cada mes." }
                ?: "La ventana SIASE está cerrada."
            else -> null
        }
}

class ReporteSiaseViewModel(
    private val sessionManager: SessionManager,
    private val siaseRepository: SiaseRepository
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<SiaseUiState>>(UiState.Cargando)
    val estado: StateFlow<UiState<SiaseUiState>> = _estado.asStateFlow()

    private val canal = CanalAvisos()
    val avisos = canal.avisos

    /** URL firmada recién generada para abrir el archivo (la pantalla lanza el Intent y llama a [urlAbierta]). */
    private val _urlParaAbrir = MutableStateFlow<String?>(null)
    val urlParaAbrir: StateFlow<String?> = _urlParaAbrir.asStateFlow()

    private val mesActual: String = FechaUi.mesActual().toString()
    private var becarioId: String? = null
    private var periodoId: String? = null

    init {
        cargar()
    }

    fun cargar() {
        // Al volver del selector de archivos la pantalla se reanuda: no pisar una subida en curso.
        if ((_estado.value as? UiState.Listo)?.datos?.subiendo == true) return
        viewModelScope.launch {
            if (_estado.value !is UiState.Listo) _estado.value = UiState.Cargando
            intentar {
                val usuario = sessionManager.requerirUsuario()
                becarioId = usuario.id
                val ventana = siaseRepository.estadoVentana()
                val periodo = siaseRepository.periodoActivo()
                periodoId = periodo?.id
                val delMes = siaseRepository.reportesDelMes(FechaUi.mesActual()).firstOrNull { it.becario_id == usuario.id }
                val historial = siaseRepository.historialDe(usuario.id)
                val anterior = (_estado.value as? UiState.Listo)?.datos
                SiaseUiState(
                    ventana = ventana,
                    estadoDelMes = delMes,
                    historial = historial,
                    periodoNombre = periodo?.nombre,
                    archivoElegido = anterior?.archivoElegido
                )
            }.onSuccess { nuevo ->
                // Si mientras tanto empezó una subida, se conserva la bandera para no rehabilitar el botón.
                _estado.update { previo ->
                    UiState.Listo(nuevo.copy(subiendo = (previo as? UiState.Listo)?.datos?.subiendo == true))
                }
            }.onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudo cargar tu reporte SIASE.")) }
        }
    }

    /**
     * Lee el archivo elegido FUERA del hilo principal, con su nombre real
     * (OpenableColumns.DISPLAY_NAME) y un límite de tamaño (M-12, A-11), y lo sube.
     */
    fun subirDesdeUri(resolver: ContentResolver, uri: Uri) {
        val actual = (_estado.value as? UiState.Listo)?.datos ?: return
        if (!actual.puedeSubir) {
            actual.motivoNoPuedeSubir?.let(canal::error)
            return
        }
        val idBecario = becarioId ?: return
        val idPeriodo = periodoId
        if (idPeriodo == null) {
            canal.error("No hay un periodo académico activo; avisa a la coordinación.")
            return
        }

        actualizarListo { it.copy(subiendo = true, mensaje = null) }
        viewModelScope.launch {
            intentar {
                val (nombre, bytes) = withContext(Dispatchers.IO) { leerArchivo(resolver, uri) }
                actualizarListo { it.copy(archivoElegido = nombre) }
                siaseRepository.subirReporte(idBecario, idPeriodo, mesActual, bytes, nombre).getOrThrow()
                nombre
            }.onSuccess { nombre ->
                actualizarListo { it.copy(subiendo = false) }
                canal.exito("Reporte \"$nombre\" subido. Tu ingeniero lo revisará.")
                cargar()
            }.onFailure { e ->
                val texto = e.mensajeAmigable("No se pudo subir el archivo.")
                actualizarListo { it.copy(subiendo = false, mensaje = texto) }
                canal.error(texto)
            }
        }
    }

    /** Genera una URL temporal para ver el archivo subido (A-02). */
    fun verArchivo(rutaOUrl: String) {
        viewModelScope.launch {
            siaseRepository.urlParaVer(rutaOUrl)
                .onSuccess { _urlParaAbrir.value = it }
                .onFailure { canal.error(it.mensajeAmigable("No se pudo abrir el archivo.")) }
        }
    }

    fun urlAbierta() {
        _urlParaAbrir.value = null
    }

    private fun leerArchivo(resolver: ContentResolver, uri: Uri): Pair<String, ByteArray> {
        var nombre: String? = null
        var tamano: Long? = null
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val iNombre = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val iTamano = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (iNombre >= 0 && !cursor.isNull(iNombre)) nombre = cursor.getString(iNombre)
                if (iTamano >= 0 && !cursor.isNull(iTamano)) tamano = cursor.getLong(iTamano)
            }
        }
        if ((tamano ?: 0L) > TAMANO_MAXIMO_REPORTE) {
            throw ErrorDeNegocio("El archivo pesa más de 10 MB. Reduce su tamaño e intenta de nuevo.")
        }
        val bytes = resolver.openInputStream(uri)?.use { entrada ->
            val salida = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(64 * 1024)
            var total = 0L
            while (true) {
                val leidos = entrada.read(buffer)
                if (leidos < 0) break
                total += leidos
                if (total > TAMANO_MAXIMO_REPORTE) {
                    throw ErrorDeNegocio("El archivo pesa más de 10 MB. Reduce su tamaño e intenta de nuevo.")
                }
                salida.write(buffer, 0, leidos)
            }
            salida.toByteArray()
        } ?: throw ErrorDeNegocio("No se pudo leer el archivo elegido.")
        if (bytes.isEmpty()) throw ErrorDeNegocio("El archivo elegido está vacío.")
        return (nombre ?: "reporte_siase") to bytes
    }

    private fun actualizarListo(transformar: (SiaseUiState) -> SiaseUiState) {
        _estado.update { actual -> if (actual is UiState.Listo) UiState.Listo(transformar(actual.datos)) else actual }
    }
}
