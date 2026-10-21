package com.fime.docencheck.core.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.fime.docencheck.core.error.MENSAJE_SIN_CONEXION
import com.fime.docencheck.ui.theme.BotonDestructivo
import com.fime.docencheck.ui.theme.BotonPrimario
import com.fime.docencheck.ui.theme.BotonSecundario
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.FormasApp
import com.fime.docencheck.ui.theme.IconoCircular
import com.fime.docencheck.ui.theme.TonoEstado
import kotlinx.coroutines.delay

/**
 * Diálogo de confirmación para acciones que no se pueden deshacer (cerrar
 * semestre, aprobar/rechazar transferencias, dar de baja...). Con [destructivo]
 * el botón de confirmar es rojo sólido y el ícono es de advertencia.
 */
@Composable
fun DialogoConfirmacion(
    titulo: String,
    mensaje: String,
    onConfirmar: () -> Unit,
    onCancelar: () -> Unit,
    textoConfirmar: String = "Confirmar",
    textoCancelar: String = "Cancelar",
    destructivo: Boolean = false,
    confirmarHabilitado: Boolean = true,
    icono: ImageVector? = null,
    contenidoExtra: (@Composable () -> Unit)? = null
) {
    AlertDialog(
        onDismissRequest = onCancelar,
        icon = (icono ?: if (destructivo) Icons.Rounded.WarningAmber else null)?.let { ic ->
            { IconoCircular(ic, tono = if (destructivo) TonoEstado.PELIGRO else TonoEstado.EXITO, tamano = 48.dp) }
        },
        title = { Text(titulo, textAlign = TextAlign.Center) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Text(mensaje, style = MaterialTheme.typography.bodyMedium)
                contenidoExtra?.let {
                    Column(Modifier.padding(top = Espacio.l)) { it() }
                }
            }
        },
        confirmButton = {
            if (destructivo) {
                BotonDestructivo(texto = textoConfirmar, onClick = onConfirmar, habilitado = confirmarHabilitado)
            } else {
                BotonPrimario(texto = textoConfirmar, onClick = onConfirmar, habilitado = confirmarHabilitado)
            }
        },
        dismissButton = { TextButton(onClick = onCancelar) { Text(textoCancelar) } },
        containerColor = DocenCheckTema.colores.superficie,
        shape = FormasApp.extraLarge
    )
}

/**
 * Error con "Reintentar" (auditoría M-02). Centrado, con ícono; si el mensaje
 * es de falta de conexión, usa el ícono de nube tachada.
 */
@Composable
fun EstadoError(mensaje: String, onReintentar: (() -> Unit)?, modifier: Modifier = Modifier) {
    val sinRed = mensaje.startsWith(MENSAJE_SIN_CONEXION.take(12))
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = Espacio.xl, vertical = Espacio.xxl)
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        IconoCircular(if (sinRed) Icons.Rounded.CloudOff else Icons.Rounded.WarningAmber, tono = TonoEstado.PELIGRO, tamano = 56.dp)
        Text(
            if (sinRed) "Sin conexión" else "Algo salió mal",
            style = MaterialTheme.typography.titleMedium,
            color = DocenCheckTema.colores.texto,
            modifier = Modifier.padding(top = Espacio.l)
        )
        Text(
            mensaje,
            style = MaterialTheme.typography.bodyMedium,
            color = DocenCheckTema.colores.textoSecundario,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Espacio.xs)
        )
        if (onReintentar != null) {
            BotonSecundario(
                texto = "Reintentar",
                onClick = onReintentar,
                icono = Icons.Rounded.Refresh,
                modifier = Modifier.padding(top = Espacio.l)
            )
        }
    }
}

/** Lista o pantalla sin datos: ícono, título, explicación y acción opcional. */
@Composable
fun EstadoVacio(
    titulo: String,
    modifier: Modifier = Modifier,
    mensaje: String? = null,
    icono: ImageVector = Icons.Rounded.Inbox,
    textoAccion: String? = null,
    onAccion: (() -> Unit)? = null
) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = Espacio.xl, vertical = Espacio.xxl),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        IconoCircular(icono, tono = TonoEstado.NEUTRO, tamano = 64.dp)
        Text(
            titulo,
            style = MaterialTheme.typography.titleMedium,
            color = DocenCheckTema.colores.texto,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Espacio.l)
        )
        mensaje?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodyMedium,
                color = DocenCheckTema.colores.textoSecundario,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Espacio.xs)
            )
        }
        if (textoAccion != null && onAccion != null) {
            BotonSecundario(texto = textoAccion, onClick = onAccion, modifier = Modifier.padding(top = Espacio.l))
        }
    }
}

/** Indicador de carga centrado (auditoría B-05: antes quedaba pegado arriba a la izquierda). */
@Composable
fun CargandoCentrado(modifier: Modifier = Modifier, texto: String? = null) {
    Box(modifier.fillMaxSize().padding(Espacio.xxl), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.semantics(mergeDescendants = true) {
            contentDescription = texto ?: "Cargando"
        }) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            texto?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = DocenCheckTema.colores.textoSecundario, modifier = Modifier.padding(top = Espacio.m))
            }
        }
    }
}

/** Bloque gris pulsante para los esqueletos de carga. */
@Composable
fun BloqueEsqueleto(modifier: Modifier = Modifier, alto: Dp = 16.dp) {
    val transicion = rememberInfiniteTransition(label = "esqueleto")
    val alfa by transicion.animateFloat(
        initialValue = 0.45f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(800), RepeatMode.Reverse),
        label = "alfa"
    )
    Box(
        modifier
            .height(alto)
            .alpha(alfa)
            .clip(FormasApp.small)
            .background(DocenCheckTema.colores.esqueleto)
    )
}

/** Esqueleto de lista de tarjetas: comunica la forma del contenido mientras carga. */
@Composable
fun EsqueletoLista(
    modifier: Modifier = Modifier,
    tarjetas: Int = 4,
    relleno: PaddingValues = PaddingValues(Espacio.pantalla)
) {
    Column(
        modifier
            .fillMaxSize()
            .padding(relleno)
            .semantics { contentDescription = "Cargando" },
        verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
    ) {
        repeat(tarjetas) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(FormasApp.large)
                    .background(DocenCheckTema.colores.superficie)
                    .padding(Espacio.l)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BloqueEsqueleto(Modifier.size(40.dp), alto = 40.dp)
                    Spacer(Modifier.width(Espacio.m))
                    Column(Modifier.weight(1f)) {
                        BloqueEsqueleto(Modifier.fillMaxWidth(0.6f))
                        Spacer(Modifier.height(Espacio.s))
                        BloqueEsqueleto(Modifier.fillMaxWidth(0.35f), alto = 12.dp)
                    }
                }
                Spacer(Modifier.height(Espacio.m))
                BloqueEsqueleto(Modifier.fillMaxWidth(), alto = 8.dp)
            }
        }
    }
}

/**
 * Pinta [contenido] según el [UiState], con transición suave entre cargando,
 * error y listo. [cargando] por omisión es el esqueleto de lista.
 */
@Composable
fun <T> ContenidoSegunEstado(
    estado: UiState<T>,
    onReintentar: (() -> Unit)?,
    modifier: Modifier = Modifier,
    cargando: @Composable () -> Unit = { EsqueletoLista() },
    contenido: @Composable (T) -> Unit
) {
    AnimatedContent(
        targetState = estado,
        contentKey = { it::class },
        transitionSpec = { fadeIn(tween(220)) togetherWith fadeOut(tween(150)) },
        modifier = modifier,
        label = "estado"
    ) { actual ->
        when (actual) {
            is UiState.Cargando -> cargando()
            is UiState.Error -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                EstadoError(actual.mensaje, onReintentar)
            }
            is UiState.Listo -> contenido(actual.datos)
        }
    }
}

/**
 * Pull-to-refresh para listas. Los ViewModels recargan "en silencio" (mantienen
 * los datos mientras tanto), así que el indicador se oculta cuando llega un
 * estado nuevo o, como tope, a los 2 s.
 */
@Composable
fun ContenedorRefrescable(
    onRefrescar: () -> Unit,
    marcaDatos: Any?,
    modifier: Modifier = Modifier,
    contenido: @Composable BoxScope.() -> Unit
) {
    var refrescando by remember { mutableStateOf(false) }
    LaunchedEffect(marcaDatos) { refrescando = false }
    LaunchedEffect(refrescando) {
        if (refrescando) {
            delay(2000)
            refrescando = false
        }
    }
    PullToRefreshBox(
        isRefreshing = refrescando,
        onRefresh = {
            refrescando = true
            onRefrescar()
        },
        modifier = modifier.fillMaxSize(),
        content = contenido
    )
}
