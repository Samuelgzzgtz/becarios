package com.fime.docencheck.ui.becario.cuenta

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.data.model.Perfil
import com.fime.docencheck.data.repository.AdminRepository
import com.fime.docencheck.data.repository.ProgresoRepository
import com.fime.docencheck.data.repository.SiaseRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Datos de contexto para Mi cuenta según el perfil (M-15). Solo lectura con
 * repositorios existentes; si algo falla, la pantalla simplemente no lo muestra.
 */
data class ResumenCuenta(
    val periodo: String? = null,
    /** Ingeniero: becarios del equipo / en ritmo bajo. Admin: becarios activos / ingenieros. */
    val indicadorA: Int? = null,
    val indicadorB: Int? = null
)

class ResumenCuentaViewModel(
    private val progresoRepository: ProgresoRepository,
    private val adminRepository: AdminRepository,
    private val siaseRepository: SiaseRepository
) : ViewModel() {

    private val _resumen = MutableStateFlow(ResumenCuenta())
    val resumen: StateFlow<ResumenCuenta> = _resumen.asStateFlow()

    private var cargadoPara: Perfil? = null

    fun cargar(perfil: Perfil) {
        if (cargadoPara == perfil) return
        cargadoPara = perfil
        viewModelScope.launch {
            when (perfil) {
                Perfil.becario -> {
                    val periodo = intentar { siaseRepository.periodoActivo()?.nombre }.getOrNull()
                    _resumen.value = ResumenCuenta(periodo = periodo)
                }
                Perfil.ingeniero -> {
                    val periodo = intentar { siaseRepository.periodoActivo()?.nombre }.getOrNull()
                    val equipo = intentar { progresoRepository.progresoEquipo() }.getOrNull()
                    _resumen.value = ResumenCuenta(periodo, equipo?.size, equipo?.count { it.enRiesgo })
                }
                Perfil.administrador -> {
                    val ind = intentar { adminRepository.indicadores() }.getOrNull()
                    _resumen.value = ResumenCuenta(ind?.periodo_nombre, ind?.becarios_activos, ind?.ingenieros_activos)
                }
            }
        }
    }
}
