package com.fime.docencheck.ui.admin.configuracion

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.data.repository.AdminRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ConfiguracionUiState(
    val metaSemanal: String,
    val metaMensual: String,
    val metaSemestral: String,
    val diaApertura: String,
    val diaCierre: String,
    val guardando: Boolean = false,
    val mensaje: String? = null,
    /** true = [mensaje] es de éxito (verde); false = de error (rojo) (M-10). */
    val mensajeEsExito: Boolean = false,
    /** Errores por campo, para marcarlos en el formulario (M-10). */
    val erroresCampo: Map<CampoConfiguracion, String> = emptyMap()
)

enum class CampoConfiguracion { META_SEMANAL, META_MENSUAL, META_SEMESTRAL, DIA_APERTURA, DIA_CIERRE }

class ConfiguracionViewModel(private val adminRepository: AdminRepository) : ViewModel() {

    private val _estado = MutableStateFlow<UiState<ConfiguracionUiState>>(UiState.Cargando)
    val estado: StateFlow<UiState<ConfiguracionUiState>> = _estado.asStateFlow()

    init {
        cargar()
    }

    fun cargar() {
        viewModelScope.launch {
            _estado.value = UiState.Cargando
            intentar {
                val metas = adminRepository.metasGlobales()
                val ventana = adminRepository.ventana()
                ConfiguracionUiState(
                    metaSemanal = metas?.meta_semanal?.formatoNumero() ?: "",
                    metaMensual = metas?.meta_mensual?.formatoNumero() ?: "",
                    metaSemestral = metas?.meta_semestral?.formatoNumero() ?: "",
                    diaApertura = ventana?.dia_apertura?.toString() ?: "",
                    diaCierre = ventana?.dia_cierre?.toString() ?: ""
                )
            }.onSuccess { _estado.value = UiState.Listo(it) }
                .onFailure { _estado.value = UiState.Error(it.mensajeAmigable("No se pudo cargar la configuración.")) }
        }
    }

    fun cambiarMetaSemanal(v: String) = actualizar { it.copy(metaSemanal = v, mensaje = null) }
    fun cambiarMetaMensual(v: String) = actualizar { it.copy(metaMensual = v, mensaje = null) }
    fun cambiarMetaSemestral(v: String) = actualizar { it.copy(metaSemestral = v, mensaje = null) }
    fun cambiarDiaApertura(v: String) = actualizar { it.copy(diaApertura = v, mensaje = null) }
    fun cambiarDiaCierre(v: String) = actualizar { it.copy(diaCierre = v, mensaje = null) }

    fun guardar() {
        val formulario = (_estado.value as? UiState.Listo)?.datos ?: return
        if (formulario.guardando) return

        // Acepta "20,5" además de "20.5" (M-10).
        val semanal = formulario.metaSemanal.aDecimal()
        val mensual = formulario.metaMensual.aDecimal()
        val semestral = formulario.metaSemestral.aDecimal()
        val apertura = formulario.diaApertura.trim().toIntOrNull()
        val cierre = formulario.diaCierre.trim().toIntOrNull()

        val errores = buildMap {
            if (semanal == null || semanal < 0) put(CampoConfiguracion.META_SEMANAL, "Escribe un número mayor o igual a 0")
            if (mensual == null || mensual < 0) put(CampoConfiguracion.META_MENSUAL, "Escribe un número mayor o igual a 0")
            if (semestral == null || semestral < 0) put(CampoConfiguracion.META_SEMESTRAL, "Escribe un número mayor o igual a 0")
            if (apertura == null || apertura !in 1..31) put(CampoConfiguracion.DIA_APERTURA, "Día entre 1 y 31")
            if (cierre == null || cierre !in 1..31) put(CampoConfiguracion.DIA_CIERRE, "Día entre 1 y 31")
            if (apertura != null && cierre != null && apertura in 1..31 && cierre in 1..31 && apertura > cierre) {
                put(CampoConfiguracion.DIA_CIERRE, "El cierre debe ser igual o posterior a la apertura")
            }
        }
        if (errores.isNotEmpty() || semanal == null || mensual == null || semestral == null || apertura == null || cierre == null) {
            actualizar {
                it.copy(
                    erroresCampo = errores,
                    mensaje = "Revisa los campos marcados.",
                    mensajeEsExito = false
                )
            }
            return
        }

        actualizar { it.copy(guardando = true, mensaje = null, erroresCampo = emptyMap()) }
        viewModelScope.launch {
            // Una sola transacción en el servidor: ya no queda "metas sí, ventana no" (M-10).
            adminRepository.guardarConfiguracion(semanal, mensual, semestral, apertura, cierre)
                .onSuccess { actualizar { it.copy(guardando = false, mensaje = "Configuración guardada", mensajeEsExito = true) } }
                .onFailure { e ->
                    actualizar {
                        it.copy(guardando = false, mensaje = e.mensajeAmigable("No se pudo guardar la configuración."), mensajeEsExito = false)
                    }
                }
        }
    }

    private fun actualizar(transformar: (ConfiguracionUiState) -> ConfiguracionUiState) {
        _estado.update { actual -> if (actual is UiState.Listo) UiState.Listo(transformar(actual.datos)) else actual }
    }
}

private fun String.aDecimal(): Double? = trim().replace(',', '.').toDoubleOrNull()

private fun Double.formatoNumero(): String = if (this % 1.0 == 0.0) toLong().toString() else toString()
