package com.fime.docencheck.ui.admin.semestres

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.data.model.PeriodoAcademico
import com.fime.docencheck.data.repository.AdminRepository
import com.fime.docencheck.data.repository.ResultadoCierre
import com.fime.docencheck.data.repository.SiaseRepository
import com.fime.docencheck.data.repository.VistaPreviaCierre
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate

val TIPOS_PERIODO = listOf("AD", "EJ")

data class FormularioSemestre(
    val periodoActivo: PeriodoAcademico?,
    val nombre: String = "",
    val tipo: String = "AD",
    val inicio: String = "",
    val fin: String = "",
    val procesando: Boolean = false,
    val mensaje: String? = null,
    /** Resumen del periodo que se va a cerrar (C-05): se muestra en el diálogo. */
    val vistaPrevia: VistaPreviaCierre? = null,
    /** El diálogo de confirmación está abierto. */
    val confirmando: Boolean = false,
    /** Lo que el admin escribe para confirmar: debe coincidir con el nombre del periodo activo. */
    val textoConfirmacion: String = "",
    /** Resultado del cierre: se muestra ANTES de salir de la pantalla (C-05). */
    val resultado: ResultadoCierre? = null,
    /** Se abrió el primer periodo (no había uno activo, M-11). */
    val periodoAbierto: Boolean = false,
    val cerrado: Boolean = false
) {
    val hayPeriodoActivo: Boolean get() = periodoActivo != null
    val confirmacionValida: Boolean
        get() = periodoActivo != null && textoConfirmacion.trim().equals(periodoActivo.nombre.trim(), ignoreCase = true)
}

class GestionSemestresViewModel(
    private val adminRepository: AdminRepository,
    private val siaseRepository: SiaseRepository
) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<FormularioSemestre>>(UiState.Cargando)
    val estado: StateFlow<UiState<FormularioSemestre>> = _estado.asStateFlow()

    init {
        cargar()
    }

    fun cargar() {
        viewModelScope.launch {
            _estado.value = UiState.Cargando
            intentar {
                val periodo = siaseRepository.periodoActivo()
                val vista = if (periodo != null) intentar { adminRepository.vistaPreviaCierre() }.getOrNull() else null
                FormularioSemestre(periodoActivo = periodo, vistaPrevia = vista)
            }.onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudo cargar el periodo activo.")) }
        }
    }

    fun cambiarNombre(v: String) = actualizar { it.copy(nombre = v, mensaje = null) }

    /** Solo AD o EJ (M-11: antes era texto libre y "ad" fallaba con el error crudo del enum). */
    fun cambiarTipo(v: String) = actualizar { it.copy(tipo = v.trim().uppercase(), mensaje = null) }
    fun cambiarInicio(v: String) = actualizar { it.copy(inicio = v, mensaje = null) }
    fun cambiarFin(v: String) = actualizar { it.copy(fin = v, mensaje = null) }
    fun cambiarTextoConfirmacion(v: String) = actualizar { it.copy(textoConfirmacion = v) }

    /** Valida el formulario y abre el diálogo de confirmación (no cierra nada todavía). */
    fun pedirCierre() {
        val formulario = (_estado.value as? UiState.Listo)?.datos ?: return
        if (formulario.procesando) return
        if (formulario.periodoActivo == null) {
            actualizar { it.copy(mensaje = "No hay un periodo activo que cerrar. Usa \"Abrir periodo\".") }
            return
        }
        val error = validar(formulario)
        if (error != null) {
            actualizar { it.copy(mensaje = error) }
            return
        }
        actualizar { it.copy(confirmando = true, textoConfirmacion = "", mensaje = null) }
        // Refresca el resumen justo antes de confirmar.
        viewModelScope.launch {
            intentar { adminRepository.vistaPreviaCierre() }.onSuccess { vista -> actualizar { it.copy(vistaPrevia = vista) } }
        }
    }

    fun cancelarCierre() = actualizar { it.copy(confirmando = false, textoConfirmacion = "") }

    /** Ejecuta el cierre. Exige haber escrito el nombre del periodo (C-05). */
    fun confirmarCierre() {
        val formulario = (_estado.value as? UiState.Listo)?.datos ?: return
        val periodo = formulario.periodoActivo ?: return
        if (formulario.procesando || !formulario.confirmacionValida) return
        val inicio = LocalDate.parse(formulario.inicio.trim())
        val fin = LocalDate.parse(formulario.fin.trim())

        actualizar { it.copy(procesando = true, confirmando = false, mensaje = null) }
        viewModelScope.launch {
            adminRepository.cerrarSemestre(formulario.nombre, formulario.tipo, inicio, fin, periodoActual = periodo.id)
                .onSuccess { r -> actualizar { it.copy(procesando = false, resultado = r) } }
                .onFailure { e ->
                    actualizar { it.copy(procesando = false, mensaje = e.mensajeAmigable("No se pudo cerrar el semestre.")) }
                }
        }
    }

    /** Crear el primer periodo cuando no hay ninguno activo (M-11). */
    fun abrirPeriodo() {
        val formulario = (_estado.value as? UiState.Listo)?.datos ?: return
        if (formulario.procesando || formulario.periodoActivo != null) return
        val error = validar(formulario)
        if (error != null) {
            actualizar { it.copy(mensaje = error) }
            return
        }
        actualizar { it.copy(procesando = true, mensaje = null) }
        viewModelScope.launch {
            adminRepository.abrirPeriodo(
                formulario.nombre, formulario.tipo,
                LocalDate.parse(formulario.inicio.trim()), LocalDate.parse(formulario.fin.trim())
            ).onSuccess { actualizar { it.copy(procesando = false, periodoAbierto = true) } }
                .onFailure { e -> actualizar { it.copy(procesando = false, mensaje = e.mensajeAmigable("No se pudo abrir el periodo.")) } }
        }
    }

    /** El admin ya vio el resultado: la pantalla puede cerrarse. */
    fun resultadoVisto() = actualizar { it.copy(cerrado = true) }

    private fun validar(f: FormularioSemestre): String? {
        if (f.nombre.isBlank()) return "Escribe el nombre del nuevo periodo."
        if (f.tipo !in TIPOS_PERIODO) return "El tipo debe ser AD o EJ."
        val inicio = runCatching { LocalDate.parse(f.inicio.trim()) }.getOrNull()
            ?: return "La fecha de inicio debe tener el formato aaaa-mm-dd."
        val fin = runCatching { LocalDate.parse(f.fin.trim()) }.getOrNull()
            ?: return "La fecha de fin debe tener el formato aaaa-mm-dd."
        if (!fin.isAfter(inicio)) return "La fecha de fin debe ser posterior a la de inicio."
        val inicioActual = f.periodoActivo?.fecha_inicio?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        if (inicioActual != null && !inicio.isAfter(inicioActual)) {
            return "El nuevo periodo debe empezar después del inicio del periodo actual."
        }
        return null
    }

    private fun actualizar(transformar: (FormularioSemestre) -> FormularioSemestre) {
        _estado.update { actual -> if (actual is UiState.Listo) UiState.Listo(transformar(actual.datos)) else actual }
    }
}
