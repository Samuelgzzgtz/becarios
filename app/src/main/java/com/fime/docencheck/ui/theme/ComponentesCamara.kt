package com.fime.docencheck.ui.theme

import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Face
import androidx.compose.material.icons.rounded.NoPhotography
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat

/** Estado visual de la guía del rostro. */
enum class EstadoGuia { BUSCANDO, VERIFICANDO, EXITO, ERROR }

/**
 * Vista previa de CameraX. Se vuelve a enlazar si cambia [selector] (p. ej. el
 * ingeniero cambia a la cámara frontal). Si el dispositivo no tiene esa cámara,
 * llama a [onError] en vez de cerrar la app.
 */
@Composable
fun VistaCamara(
    selector: CameraSelector,
    captura: ImageCapture,
    modifier: Modifier = Modifier,
    onError: (Throwable) -> Unit = {}
) {
    val contexto = LocalContext.current
    val cicloVida = LocalLifecycleOwner.current
    val alFallar by rememberUpdatedState(onError)
    val vista = remember {
        PreviewView(contexto).apply {
            scaleType = PreviewView.ScaleType.FILL_CENTER
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        }
    }
    DisposableEffect(selector, cicloVida) {
        val futuro = ProcessCameraProvider.getInstance(contexto)
        var proveedor: ProcessCameraProvider? = null
        futuro.addListener({
            runCatching {
                val p = futuro.get()
                proveedor = p
                val preview = Preview.Builder().build().also { it.setSurfaceProvider(vista.surfaceProvider) }
                p.unbindAll()
                p.bindToLifecycle(cicloVida, selector, preview, captura)
            }.onFailure { alFallar(it) }
        }, ContextCompat.getMainExecutor(contexto))
        onDispose { runCatching { proveedor?.unbindAll() } }
    }
    AndroidView(factory = { vista }, modifier = modifier)
}

/**
 * Guía del rostro: oscurece todo menos un óvalo y pinta su contorno según el
 * estado: punteado blanco (buscando), arco verde girando (verificando),
 * verde sólido (éxito) o rojo (error).
 */
@Composable
fun GuiaRostro(estado: EstadoGuia, modifier: Modifier = Modifier) {
    val c = DocenCheckTema.colores
    val colorBorde by animateColorAsState(
        when (estado) {
            EstadoGuia.BUSCANDO -> Color.White
            EstadoGuia.VERIFICANDO -> Verde300
            EstadoGuia.EXITO -> Verde300
            EstadoGuia.ERROR -> Color(0xFFFF6B6B)
        },
        label = "borde"
    )
    val transicion = rememberInfiniteTransition(label = "guia")
    val giro by transicion.animateFloat(0f, 360f, infiniteRepeatable(tween(1200, easing = LinearEasing)), label = "giro")
    val pulso by transicion.animateFloat(0.96f, 1.02f, infiniteRepeatable(tween(1100), RepeatMode.Reverse), label = "pulso")

    Canvas(modifier.fillMaxSize()) {
        val anchoOvalo = (size.width * 0.64f).coerceAtMost(300.dp.toPx()) * (if (estado == EstadoGuia.BUSCANDO) pulso else 1f)
        val altoOvalo = (anchoOvalo * 1.3f).coerceAtMost(size.height * 0.8f)
        val centro = Offset(size.width / 2f, size.height * 0.46f)
        val ovalo = Rect(Offset(centro.x - anchoOvalo / 2f, centro.y - altoOvalo / 2f), Size(anchoOvalo, altoOvalo))

        val mascara = Path().apply {
            fillType = PathFillType.EvenOdd
            addRect(Rect(Offset.Zero, size))
            addOval(ovalo)
        }
        drawPath(mascara, c.escanerFondo.copy(alpha = 0.6f))

        val grosor = 4.dp.toPx()
        when (estado) {
            EstadoGuia.BUSCANDO -> drawOval(
                color = colorBorde,
                topLeft = ovalo.topLeft,
                size = ovalo.size,
                style = Stroke(width = grosor, pathEffect = PathEffect.dashPathEffect(floatArrayOf(18f, 12f), 0f))
            )
            EstadoGuia.VERIFICANDO -> {
                drawOval(color = Color.White.copy(alpha = 0.25f), topLeft = ovalo.topLeft, size = ovalo.size, style = Stroke(width = grosor))
                drawArc(
                    color = colorBorde,
                    startAngle = giro,
                    sweepAngle = 90f,
                    useCenter = false,
                    topLeft = ovalo.topLeft,
                    size = ovalo.size,
                    style = Stroke(width = grosor * 1.5f, cap = StrokeCap.Round)
                )
            }
            EstadoGuia.EXITO, EstadoGuia.ERROR -> drawOval(
                color = colorBorde,
                topLeft = ovalo.topLeft,
                size = ovalo.size,
                style = Stroke(width = grosor * 1.5f)
            )
        }
    }
}

/** Cápsula de estado sobre la cámara (se anuncia a TalkBack al cambiar). */
@Composable
fun ChipEstadoCamara(estado: EstadoGuia, texto: String, modifier: Modifier = Modifier) {
    AnimatedContent(
        targetState = estado to texto,
        transitionSpec = { fadeIn(tween(200)) togetherWith fadeOut(tween(150)) },
        modifier = modifier.semantics { liveRegion = LiveRegionMode.Polite },
        label = "chipCamara"
    ) { (e, t) ->
        Surface(shape = FormaPildora, color = Color.Black.copy(alpha = 0.6f), contentColor = Color.White) {
            Row(Modifier.padding(horizontal = Espacio.l, vertical = Espacio.s), verticalAlignment = Alignment.CenterVertically) {
                when (e) {
                    EstadoGuia.VERIFICANDO -> CircularProgressIndicator(Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                    EstadoGuia.EXITO -> Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = Verde300, modifier = Modifier.size(18.dp))
                    EstadoGuia.ERROR -> Icon(Icons.Rounded.ErrorOutline, contentDescription = null, tint = Color(0xFFFF8A80), modifier = Modifier.size(18.dp))
                    EstadoGuia.BUSCANDO -> Icon(Icons.Rounded.Face, contentDescription = null, modifier = Modifier.size(18.dp))
                }
                Spacer(Modifier.width(Espacio.s))
                Text(t, style = MaterialTheme.typography.labelLarge, textAlign = TextAlign.Center)
            }
        }
    }
}

/**
 * Permiso de cámara denegado (A-17): explica para qué se usa, que la foto no
 * se guarda, y ofrece pedirlo de nuevo o abrir Ajustes. Nunca es un callejón sin salida.
 */
@Composable
fun PanelPermisoCamara(
    bloqueado: Boolean,
    explicacion: String,
    onSolicitar: () -> Unit,
    onVolver: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Espacio.xl),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.size(Espacio.xl))
        IconoCircular(Icons.Rounded.NoPhotography, tono = TonoEstado.ALERTA, tamano = 72.dp)
        Text(
            if (bloqueado) "El permiso de cámara está desactivado" else "Se necesita la cámara",
            style = MaterialTheme.typography.titleLarge,
            color = DocenCheckTema.colores.texto,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Espacio.l)
        )
        Text(
            explicacion,
            style = MaterialTheme.typography.bodyMedium,
            color = DocenCheckTema.colores.textoSecundario,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Espacio.s)
        )
        AvisoBanner(
            texto = "La foto no se guarda ni se envía: solo se compara en este teléfono.",
            tono = TonoEstado.INFO,
            icono = Icons.Rounded.Lock,
            modifier = Modifier.padding(top = Espacio.l)
        )
        if (bloqueado) {
            Text(
                "En Ajustes, entra a Permisos › Cámara y elige \"Permitir\".",
                style = MaterialTheme.typography.bodySmall,
                color = DocenCheckTema.colores.textoSecundario,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Espacio.m)
            )
        }
        BotonPrimario(
            texto = if (bloqueado) "Abrir Ajustes" else "Conceder permiso",
            onClick = onSolicitar,
            modifier = Modifier.fillMaxWidth().padding(top = Espacio.xl)
        )
        BotonSecundario(texto = "Volver", onClick = onVolver, modifier = Modifier.fillMaxWidth().padding(top = Espacio.s))
    }
}

/** Fondo negro con esquinas redondeadas para el visor. */
@Composable
fun MarcoCamara(modifier: Modifier = Modifier, contenido: @Composable BoxScope.() -> Unit) {
    Box(
        modifier
            .fillMaxWidth()
            .clip(FormasApp.extraLarge)
            .background(DocenCheckTema.colores.escanerFondo),
        content = contenido
    )
}
