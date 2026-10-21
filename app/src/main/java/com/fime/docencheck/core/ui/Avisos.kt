package com.fime.docencheck.core.ui

import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarVisuals
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow

enum class TipoAviso { EXITO, ERROR, INFO }

/** Mensaje de una sola vez (Snackbar) que un ViewModel le manda a su pantalla. */
data class Aviso(val texto: String, val tipo: TipoAviso = TipoAviso.INFO)

/**
 * Canal de avisos de un ViewModel. Es un Channel (no StateFlow) para que cada
 * aviso se muestre una sola vez y no se repita al rotar la pantalla.
 */
class CanalAvisos {
    private val canal = Channel<Aviso>(Channel.BUFFERED)
    val avisos: Flow<Aviso> = canal.receiveAsFlow()

    fun exito(texto: String) { canal.trySend(Aviso(texto, TipoAviso.EXITO)) }
    fun error(texto: String) { canal.trySend(Aviso(texto, TipoAviso.ERROR)) }
    fun info(texto: String) { canal.trySend(Aviso(texto, TipoAviso.INFO)) }
}

/**
 * Visuales del Snackbar que conservan el tipo de aviso: el SnackbarHost puede
 * leer `(data.visuals as? VisualesAviso)?.tipo` para pintar verde/rojo.
 */
class VisualesAviso(val aviso: Aviso) : SnackbarVisuals {
    override val message: String get() = aviso.texto
    override val actionLabel: String? get() = null
    override val withDismissAction: Boolean get() = true
    override val duration: SnackbarDuration
        get() = if (aviso.tipo == TipoAviso.ERROR) SnackbarDuration.Long else SnackbarDuration.Short
}

/** Recolecta los avisos de un ViewModel y los muestra en un SnackbarHostState. */
@Composable
fun rememberAvisos(vararg fuentes: Flow<Aviso>): SnackbarHostState {
    val host = remember { SnackbarHostState() }
    fuentes.forEach { fuente ->
        LaunchedEffect(fuente) {
            fuente.collect { host.showSnackbar(VisualesAviso(it)) }
        }
    }
    return host
}
