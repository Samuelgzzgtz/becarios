package com.fime.docencheck.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

/**
 * Vuelve a cargar cuando la pantalla se reanuda (p. ej. al volver de un
 * formulario de "nuevo X" con popBackStack — el ViewModel de la pantalla
 * anterior sigue vivo en el back stack, así que sin esto se quedaría
 * mostrando los datos de antes de crear el registro).
 */
@Composable
fun RecargarAlReanudar(cargar: () -> Unit) {
    val cicloVida = LocalLifecycleOwner.current.lifecycle
    val cargarActualizado by rememberUpdatedState(cargar)

    DisposableEffect(cicloVida) {
        val observador = LifecycleEventObserver { _, evento ->
            if (evento == Lifecycle.Event.ON_RESUME) cargarActualizado()
        }
        cicloVida.addObserver(observador)
        onDispose { cicloVida.removeObserver(observador) }
    }
}
