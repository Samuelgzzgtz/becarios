package com.fime.docencheck.navigation

import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavController
import com.fime.docencheck.core.ui.Aviso
import com.fime.docencheck.core.ui.TipoAviso
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach

private const val CLAVE_AVISO = "aviso_al_volver"

/**
 * Regresa a la pantalla anterior dejándole un aviso ("Cuenta creada", "Solicitud
 * enviada"...), para que el usuario sepa que la acción funcionó (auditoría B-07).
 */
fun NavController.volverConAviso(texto: String) {
    previousBackStackEntry?.savedStateHandle?.set(CLAVE_AVISO, texto)
    popBackStack()
}

/**
 * Avisos que otra pantalla dejó al regresar a esta. Cada aviso se entrega una
 * sola vez (se borra al leerse). Pasarlo a `rememberAvisos(...)` de la pantalla.
 */
fun NavBackStackEntry.avisosAlVolver(): Flow<Aviso> =
    savedStateHandle.getStateFlow<String?>(CLAVE_AVISO, null)
        .filterNotNull()
        .onEach { savedStateHandle[CLAVE_AVISO] = null }
        .map { Aviso(it, TipoAviso.EXITO) }
