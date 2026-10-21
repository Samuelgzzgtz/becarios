package com.fime.docencheck.ui.theme

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fime.docencheck.core.ui.TipoAviso
import com.fime.docencheck.core.ui.VisualesAviso

// =============================================================================
// Tono de estado (badges, banners, íconos)
// =============================================================================

/** Tono semántico. Cada tono usa fondo tonal + texto oscuro (contraste AA, auditoría M-19). */
enum class TonoEstado { EXITO, ALERTA, PELIGRO, INFO, NEUTRO }

data class ColoresTono(val contenedor: Color, val contenido: Color, val acento: Color)

@Composable
fun TonoEstado.colores(): ColoresTono {
    val c = DocenCheckTema.colores
    return when (this) {
        TonoEstado.EXITO -> ColoresTono(c.exitoContenedor, c.sobreExitoContenedor, c.exito)
        TonoEstado.ALERTA -> ColoresTono(c.alertaContenedor, c.sobreAlertaContenedor, c.alerta)
        TonoEstado.PELIGRO -> ColoresTono(c.peligroContenedor, c.sobrePeligroContenedor, c.peligro)
        TonoEstado.INFO -> ColoresTono(c.infoContenedor, c.sobreInfoContenedor, c.info)
        TonoEstado.NEUTRO -> ColoresTono(c.neutroContenedor, c.sobreNeutroContenedor, c.textoSecundario)
    }
}

/** Cápsula de estado (Activo, Pendiente, Confirmado...). Fondo tonal, texto oscuro, ícono opcional. */
@Composable
fun BadgeEstado(texto: String, tono: TonoEstado, modifier: Modifier = Modifier, icono: ImageVector? = null) {
    val colores = tono.colores()
    Row(
        modifier = modifier
            .clip(FormaPildora)
            .background(colores.contenedor)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (icono != null) {
            Icon(icono, contentDescription = null, tint = colores.contenido, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(Espacio.xs))
        }
        Text(texto, style = TextoBadge, color = colores.contenido, maxLines = 1)
    }
}

/** Ícono dentro de un círculo tonal (encabezados de tarjeta, filas de lista, estados vacíos). */
@Composable
fun IconoCircular(
    icono: ImageVector,
    modifier: Modifier = Modifier,
    tono: TonoEstado = TonoEstado.EXITO,
    tamano: Dp = 40.dp,
    descripcion: String? = null
) {
    val colores = tono.colores()
    Box(
        modifier = modifier.size(tamano).clip(CircleShape).background(colores.contenedor),
        contentAlignment = Alignment.Center
    ) {
        Icon(icono, contentDescription = descripcion, tint = colores.contenido, modifier = Modifier.size(tamano * 0.55f))
    }
}

// =============================================================================
// Header y estructura de pantalla
// =============================================================================

/**
 * Header con degradado verde institucional y esquinas inferiores redondeadas.
 * El botón de volver es un IconButton real (48 dp, rol de botón, "Volver" para
 * TalkBack; auditoría M-18). [etiqueta] es una cápsula opcional sobre el título
 * (p. ej. "ADMINISTRADOR").
 */
@Composable
fun EncabezadoApp(
    titulo: String,
    subtitulo: String? = null,
    onVolver: (() -> Unit)? = null,
    etiqueta: String? = null,
    accion: @Composable (RowScope.() -> Unit)? = null
) {
    val colores = DocenCheckTema.colores
    CompositionLocalProvider(LocalContentColor provides colores.sobreHeader) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(bottomStart = 24.dp, bottomEnd = 24.dp))
                .background(Brush.linearGradient(listOf(colores.headerInicio, colores.headerFin)))
                .statusBarsPadding()
                .heightIn(min = 64.dp)
                .padding(start = if (onVolver != null) Espacio.xs else Espacio.l, end = Espacio.xs, top = Espacio.s, bottom = Espacio.m)
        ) {
            Row(modifier = Modifier.fillMaxWidth().align(Alignment.CenterStart), verticalAlignment = Alignment.CenterVertically) {
                if (onVolver != null) {
                    IconButton(onClick = onVolver) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Volver")
                    }
                    Spacer(Modifier.width(Espacio.xs))
                }
                Column(modifier = Modifier.weight(1f).padding(vertical = Espacio.xs)) {
                    etiqueta?.let {
                        Text(
                            it.uppercase(),
                            style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.2.sp),
                            color = colores.sobreHeaderSecundario,
                            modifier = Modifier.padding(bottom = Espacio.xxs)
                        )
                    }
                    Text(
                        titulo,
                        style = MaterialTheme.typography.titleLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.semantics { heading() }
                    )
                    subtitulo?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodyMedium,
                            color = colores.sobreHeaderSecundario,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                if (accion != null) {
                    Row(verticalAlignment = Alignment.CenterVertically, content = accion)
                }
            }
        }
    }
}

/**
 * Estructura estándar: header verde, cuerpo sobre fondo claro, avisos (Snackbar
 * con color según el tipo), y opcionalmente una barra de acción fija abajo
 * (la acción principal de formularios y listas con selección).
 */
@Composable
fun PantallaConEncabezado(
    titulo: String,
    subtitulo: String? = null,
    onVolver: (() -> Unit)? = null,
    accionHeader: @Composable (RowScope.() -> Unit)? = null,
    snackbarHostState: SnackbarHostState? = null,
    etiqueta: String? = null,
    barraAccion: (@Composable () -> Unit)? = null,
    botonFlotante: (@Composable () -> Unit)? = null,
    contenido: @Composable (PaddingValues) -> Unit
) {
    Scaffold(
        containerColor = DocenCheckTema.colores.fondo,
        topBar = {
            EncabezadoApp(titulo = titulo, subtitulo = subtitulo, onVolver = onVolver, etiqueta = etiqueta, accion = accionHeader)
        },
        bottomBar = { barraAccion?.let { BarraAccionFija(contenido = it) } },
        floatingActionButton = { botonFlotante?.invoke() },
        snackbarHost = { snackbarHostState?.let { HostAvisos(it) } }
    ) { padding -> contenido(padding) }
}

/** Contenedor de la acción principal fija al fondo (con borde superior y respeto a la barra del sistema). */
@Composable
fun BarraAccionFija(contenido: @Composable () -> Unit) {
    Surface(color = DocenCheckTema.colores.superficie, shadowElevation = Elevacion.nivel3) {
        // Sube con el teclado: la acción principal nunca queda tapada (auditoría A-09).
        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(horizontal = Espacio.l, vertical = Espacio.m)) {
            contenido()
        }
    }
}

/** Snackbar con el color del aviso: verde (éxito), rojo (error) o neutro (info). */
@Composable
fun HostAvisos(estado: SnackbarHostState, modifier: Modifier = Modifier) {
    SnackbarHost(estado, modifier) { datos ->
        val tipo = (datos.visuals as? VisualesAviso)?.aviso?.tipo ?: TipoAviso.INFO
        val (fondo, texto, icono) = when (tipo) {
            TipoAviso.EXITO -> Triple(Verde900, Neutro0, Icons.Rounded.CheckCircle)
            TipoAviso.ERROR -> Triple(PeligroTexto, Neutro0, Icons.Rounded.ErrorOutline)
            TipoAviso.INFO -> Triple(MaterialTheme.colorScheme.inverseSurface, MaterialTheme.colorScheme.inverseOnSurface, Icons.Rounded.Info)
        }
        Snackbar(
            modifier = Modifier.padding(Espacio.m),
            containerColor = fondo,
            contentColor = texto,
            shape = FormasApp.medium,
            dismissAction = if (datos.visuals.withDismissAction) {
                {
                    IconButton(onClick = { datos.dismiss() }) {
                        Icon(Icons.Rounded.Close, contentDescription = "Cerrar aviso", tint = texto)
                    }
                }
            } else null
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icono, contentDescription = null, tint = texto, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(Espacio.m))
                Text(datos.visuals.message, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

// =============================================================================
// Tarjetas y secciones
// =============================================================================

/** Tarjeta estándar: superficie, esquinas de 16 dp, borde sutil, padding de 16 dp. Clicable si [onClick]. */
@Composable
fun Tarjeta(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    relleno: PaddingValues = PaddingValues(Espacio.l),
    colorFondo: Color = DocenCheckTema.colores.superficie,
    contenido: @Composable ColumnScope.() -> Unit
) {
    val borde = BorderStroke(1.dp, DocenCheckTema.colores.borde)
    val colores = CardDefaults.cardColors(containerColor = colorFondo, contentColor = DocenCheckTema.colores.texto)
    val elevacion = CardDefaults.cardElevation(defaultElevation = Elevacion.nivel0)
    if (onClick != null) {
        Card(onClick = onClick, modifier = modifier, shape = FormaTarjeta, colors = colores, elevation = elevacion, border = borde) {
            Column(Modifier.padding(relleno), content = contenido)
        }
    } else {
        Card(modifier = modifier, shape = FormaTarjeta, colors = colores, elevation = elevacion, border = borde) {
            Column(Modifier.padding(relleno), content = contenido)
        }
    }
}

/** Título de sección (con rol de encabezado para TalkBack) y acción opcional a la derecha. */
@Composable
fun EncabezadoSeccion(
    titulo: String,
    modifier: Modifier = Modifier,
    icono: ImageVector? = null,
    textoAccion: String? = null,
    onAccion: (() -> Unit)? = null
) {
    Row(modifier = modifier.fillMaxWidth().heightIn(min = 32.dp), verticalAlignment = Alignment.CenterVertically) {
        if (icono != null) {
            Icon(icono, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(Espacio.s))
        }
        Text(
            titulo,
            style = MaterialTheme.typography.titleMedium,
            color = DocenCheckTema.colores.texto,
            modifier = Modifier.weight(1f).semantics { heading() }
        )
        if (textoAccion != null && onAccion != null) {
            TextButton(onClick = onAccion) { Text(textoAccion) }
        }
    }
}

/** Fila etiqueta/valor (Mi cuenta, detalles). */
@Composable
fun FilaInfo(
    etiqueta: String,
    modifier: Modifier = Modifier,
    icono: ImageVector? = null,
    valor: String? = null,
    contenidoValor: (@Composable () -> Unit)? = null
) {
    Row(
        modifier = modifier.fillMaxWidth().heightIn(min = 48.dp).padding(vertical = Espacio.xs),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (icono != null) {
            Icon(icono, contentDescription = null, tint = DocenCheckTema.colores.textoSecundario, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(Espacio.m))
        }
        Text(
            etiqueta,
            style = MaterialTheme.typography.bodyMedium,
            color = DocenCheckTema.colores.textoSecundario,
            modifier = Modifier.weight(1f)
        )
        Spacer(Modifier.width(Espacio.s))
        when {
            contenidoValor != null -> contenidoValor()
            valor != null -> Text(
                valor,
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold),
                color = DocenCheckTema.colores.texto,
                textAlign = TextAlign.End
            )
        }
    }
}

@Composable
fun Divisor(modifier: Modifier = Modifier) {
    HorizontalDivider(modifier = modifier, color = DocenCheckTema.colores.borde)
}

/** Banner tonal de aviso (pendientes sin subir, solicitudes en curso, explicaciones). */
@Composable
fun AvisoBanner(
    texto: String,
    tono: TonoEstado,
    modifier: Modifier = Modifier,
    icono: ImageVector = Icons.Rounded.Info,
    titulo: String? = null,
    textoAccion: String? = null,
    onAccion: (() -> Unit)? = null,
    textoAccionSecundaria: String? = null,
    onAccionSecundaria: (() -> Unit)? = null
) {
    val colores = tono.colores()
    Surface(modifier = modifier.fillMaxWidth(), shape = FormasApp.medium, color = colores.contenedor, contentColor = colores.contenido) {
        Column(Modifier.padding(horizontal = Espacio.l, vertical = Espacio.m)) {
            Row(verticalAlignment = Alignment.Top) {
                Icon(icono, contentDescription = null, modifier = Modifier.size(20.dp).padding(top = 1.dp))
                Spacer(Modifier.width(Espacio.m))
                Column(Modifier.weight(1f)) {
                    titulo?.let { Text(it, style = MaterialTheme.typography.titleSmall) }
                    Text(texto, style = MaterialTheme.typography.bodyMedium)
                }
            }
            if (textoAccion != null && onAccion != null) {
                Row(Modifier.fillMaxWidth().padding(top = Espacio.xs), horizontalArrangement = Arrangement.End) {
                    if (textoAccionSecundaria != null && onAccionSecundaria != null) {
                        TextButton(onClick = onAccionSecundaria, colors = ButtonDefaults.textButtonColors(contentColor = colores.contenido)) {
                            Text(textoAccionSecundaria)
                        }
                    }
                    TextButton(onClick = onAccion, colors = ButtonDefaults.textButtonColors(contentColor = colores.contenido)) {
                        Text(textoAccion, style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}

// =============================================================================
// Botones (todos con 48 dp de alto: objetivo táctil mínimo)
// =============================================================================

/** Botón principal en píldora: UNA acción principal por pantalla. */
@Composable
fun BotonPrimario(
    texto: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    habilitado: Boolean = true,
    cargando: Boolean = false,
    icono: ImageVector? = null
) {
    Button(
        onClick = onClick,
        enabled = habilitado && !cargando,
        modifier = modifier.heightIn(min = 48.dp),
        shape = FormaPildora,
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary
        ),
        contentPadding = PaddingValues(horizontal = Espacio.xl, vertical = Espacio.m)
    ) {
        ContenidoBoton(texto, icono, cargando, MaterialTheme.colorScheme.onPrimary)
    }
}

/** Botón secundario: borde gris, texto oscuro (Editar, Ver reporte, Modalidad...). */
@Composable
fun BotonSecundario(
    texto: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    habilitado: Boolean = true,
    icono: ImageVector? = null,
    cargando: Boolean = false
) {
    OutlinedButton(
        onClick = onClick,
        enabled = habilitado && !cargando,
        modifier = modifier.heightIn(min = 48.dp),
        shape = FormaPildora,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = DocenCheckTema.colores.texto),
        contentPadding = PaddingValues(horizontal = Espacio.l, vertical = Espacio.s)
    ) {
        ContenidoBoton(texto, icono, cargando, DocenCheckTema.colores.texto)
    }
}

/**
 * Acción destructiva o irreversible (cerrar semestre, dar de baja, eliminar).
 * [relleno] = true: rojo sólido (acción principal crítica); false: rojo tonal.
 */
@Composable
fun BotonDestructivo(
    texto: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    habilitado: Boolean = true,
    cargando: Boolean = false,
    icono: ImageVector? = null,
    relleno: Boolean = true
) {
    val c = DocenCheckTema.colores
    val fondo = if (relleno) MaterialTheme.colorScheme.error else c.peligroContenedor
    val texto2 = if (relleno) MaterialTheme.colorScheme.onError else c.sobrePeligroContenedor
    Button(
        onClick = onClick,
        enabled = habilitado && !cargando,
        modifier = modifier.heightIn(min = 48.dp),
        shape = FormaPildora,
        colors = ButtonDefaults.buttonColors(containerColor = fondo, contentColor = texto2),
        contentPadding = PaddingValues(horizontal = Espacio.xl, vertical = Espacio.m)
    ) {
        ContenidoBoton(texto, icono, cargando, texto2)
    }
}

/** "Cerrar sesión": rojo suave, ícono de salida. */
@Composable
fun BotonCerrarSesion(onClick: () -> Unit, modifier: Modifier = Modifier, cargando: Boolean = false) {
    BotonDestructivo(
        texto = "Cerrar sesión",
        onClick = onClick,
        modifier = modifier,
        cargando = cargando,
        icono = Icons.AutoMirrored.Rounded.Logout,
        relleno = false
    )
}

@Composable
private fun ContenidoBoton(texto: String, icono: ImageVector?, cargando: Boolean, color: Color) {
    if (cargando) {
        CircularProgressIndicator(modifier = Modifier.size(20.dp), color = color, strokeWidth = 2.dp)
        Spacer(Modifier.width(Espacio.s))
        Text(texto, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
    } else {
        if (icono != null) {
            Icon(icono, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(Espacio.s))
        }
        Text(texto, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

// =============================================================================
// Progreso e indicadores
// =============================================================================

/** true si el avance va al ritmo esperado (o ya cumplió). Sin ritmo conocido, siempre "al ritmo". */
fun vaAlRitmo(progreso: Float, ritmoEsperado: Float?): Boolean =
    progreso >= 1f || ritmoEsperado == null || progreso >= ritmoEsperado * 0.8f

/**
 * Barra de progreso: verde si va al ritmo esperado, ámbar si va por debajo
 * (B-06: ya no se pone verde con el 50 % fijo). Si se da [ritmoEsperado], se
 * dibuja una marca donde "debería ir" a esta altura.
 */
@Composable
fun BarraProgresoMeta(
    progreso: Float,
    modifier: Modifier = Modifier,
    ritmoEsperado: Float? = null,
    altura: Dp = 8.dp
) {
    val c = DocenCheckTema.colores
    val valor = progreso.coerceIn(0f, 1f)
    val animado by animateFloatAsState(valor, animationSpec = tween(700), label = "progreso")
    val color = if (vaAlRitmo(progreso, ritmoEsperado)) c.exito else c.alerta
    Box(
        modifier
            .height(altura)
            .clip(FormaPildora)
            .background(c.pistaProgreso)
            .semantics { progressBarRangeInfo = ProgressBarRangeInfo(valor, 0f..1f) }
    ) {
        Box(Modifier.fillMaxHeight().fillMaxWidth(animado).clip(FormaPildora).background(color))
        ritmoEsperado?.takeIf { it in 0.01f..0.99f }?.let { ritmo ->
            Box(Modifier.fillMaxHeight().fillMaxWidth(ritmo)) {
                Box(Modifier.align(Alignment.CenterEnd).width(2.dp).fillMaxHeight().background(c.texto.copy(alpha = 0.5f)))
            }
        }
    }
}

/** Etiqueta + "x / y h" + barra. Se usa en Home, Reporte de horas y listas de becarios. */
@Composable
fun FilaProgreso(
    etiqueta: String,
    horas: Double,
    meta: Double?,
    modifier: Modifier = Modifier,
    ritmoEsperado: Float? = null
) {
    val texto = com.fime.docencheck.core.util.FormatoUi.horasDeMeta(horas, meta)
    val progreso = if (meta != null && meta > 0) (horas / meta).toFloat() else 0f
    val alRitmo = vaAlRitmo(progreso, ritmoEsperado)
    Column(
        modifier
            .fillMaxWidth()
            .padding(vertical = Espacio.s)
            .semantics(mergeDescendants = true) {
                stateDescription = if (meta != null && meta > 0) {
                    if (progreso >= 1f) "Meta cumplida" else if (alRitmo) "Al ritmo esperado" else "Por debajo del ritmo esperado"
                } else "Sin meta configurada"
            }
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(etiqueta, style = MaterialTheme.typography.bodyMedium, color = DocenCheckTema.colores.textoSecundario, modifier = Modifier.weight(1f))
            if (progreso >= 1f) {
                Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = DocenCheckTema.colores.exito, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(Espacio.xs))
            }
            Text(texto, style = MaterialTheme.typography.titleSmall.copy(fontFeatureSettings = "tnum"), color = DocenCheckTema.colores.texto)
        }
        if (meta != null && meta > 0) {
            BarraProgresoMeta(progreso = progreso, ritmoEsperado = ritmoEsperado, modifier = Modifier.fillMaxWidth().padding(top = Espacio.s))
        }
    }
}

/** Tarjeta de indicador para cuadrículas 2x2: ícono tonal, número grande y etiqueta. */
@Composable
fun TarjetaIndicador(
    valor: String,
    etiqueta: String,
    icono: ImageVector,
    modifier: Modifier = Modifier,
    alerta: Boolean = false,
    detalle: String? = null,
    onClick: (() -> Unit)? = null
) {
    val c = DocenCheckTema.colores
    Tarjeta(
        modifier = modifier.semantics(mergeDescendants = true) {
            contentDescription = "$etiqueta: $valor" + (detalle?.let { ". $it" } ?: "")
        },
        onClick = onClick,
        relleno = PaddingValues(Espacio.l)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconoCircular(icono, tono = if (alerta) TonoEstado.ALERTA else TonoEstado.EXITO, tamano = 36.dp)
            Spacer(Modifier.weight(1f))
            if (onClick != null) {
                Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = c.textoSecundario)
            }
        }
        Text(
            valor,
            style = NumeroGrande,
            color = if (alerta) c.alerta else c.exito,
            modifier = Modifier.padding(top = Espacio.m)
        )
        Text(etiqueta, style = MaterialTheme.typography.bodyMedium, color = c.texto, maxLines = 2)
        detalle?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = c.textoSecundario, maxLines = 2)
        }
    }
}

/** Distribuye tarjetas en filas de 2 (cuadrícula 2x2 dentro de un LazyColumn o Column). */
@Composable
fun CuadriculaDos(
    elementos: List<@Composable (Modifier) -> Unit>,
    modifier: Modifier = Modifier
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)) {
        elementos.chunked(2).forEach { fila ->
            Row(horizontalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)) {
                fila.forEach { it(Modifier.weight(1f)) }
                if (fila.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

// =============================================================================
// Identidad
// =============================================================================

/** Logo circular verde con "DC" (login, splash). */
@Composable
fun LogoDC(modifier: Modifier = Modifier, tamano: Dp = 80.dp) {
    Box(
        modifier = modifier
            .size(tamano)
            .clip(CircleShape)
            .background(Brush.linearGradient(listOf(Verde800, Verde600)))
            .clearAndSetSemantics { contentDescription = "DocenCheck" },
        contentAlignment = Alignment.Center
    ) {
        Text("DC", style = MaterialTheme.typography.headlineMedium.copy(fontSize = (tamano.value * 0.36f).sp), color = Neutro0)
    }
}

/** Avatar circular con iniciales (Mi cuenta, listas de usuarios). */
@Composable
fun AvatarIniciales(nombre: String, modifier: Modifier = Modifier, tamano: Dp = 64.dp) {
    val iniciales = nombre.trim().split(" ")
        .filter { it.isNotBlank() }
        .take(2)
        .mapNotNull { it.firstOrNull()?.uppercaseChar() }
        .joinToString("")
        .ifEmpty { "?" }
    Box(
        modifier = modifier.size(tamano).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center
    ) {
        Text(
            iniciales,
            style = MaterialTheme.typography.titleLarge.copy(fontSize = (tamano.value * 0.36f).sp),
            color = MaterialTheme.colorScheme.onPrimaryContainer
        )
    }
}

// =============================================================================
// Segmentado y stepper
// =============================================================================

/**
 * Control segmentado en píldora con indicador animado. Cada opción es un
 * "tab" seleccionable (TalkBack anuncia "seleccionado"); 48 dp de alto.
 */
@Composable
fun SegmentadoControl(
    opciones: List<String>,
    seleccionado: Int,
    onSeleccionar: (Int) -> Unit,
    modifier: Modifier = Modifier,
    habilitado: Boolean = true,
    iconos: List<ImageVector>? = null
) {
    SegmentadoBase(opciones, seleccionado, onSeleccionar, modifier, habilitado, interactivo = true, iconos = iconos)
}

/**
 * Igual que [SegmentadoControl] pero de solo lectura: la app decide el valor
 * (p. ej. Entrada/Salida automático). Se anuncia como informativo.
 */
@Composable
fun SegmentadoInformativo(opciones: List<String>, seleccionado: Int, modifier: Modifier = Modifier, iconos: List<ImageVector>? = null) {
    SegmentadoBase(opciones, seleccionado, {}, modifier, habilitado = true, interactivo = false, iconos = iconos)
}

@Composable
private fun SegmentadoBase(
    opciones: List<String>,
    seleccionado: Int,
    onSeleccionar: (Int) -> Unit,
    modifier: Modifier,
    habilitado: Boolean,
    interactivo: Boolean,
    iconos: List<ImageVector>?
) {
    val c = DocenCheckTema.colores
    BoxWithConstraints(
        modifier
            .fillMaxWidth()
            .height(48.dp)
            .clip(FormaPildora)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(Espacio.xs)
            .then(
                if (interactivo) Modifier.selectableGroup()
                else Modifier.clearAndSetSemantics {
                    contentDescription = "${opciones.getOrNull(seleccionado) ?: ""} (lo decide la app)"
                }
            )
    ) {
        val ancho = maxWidth / opciones.size.coerceAtLeast(1)
        val desplazamiento by animateDpAsState(ancho * seleccionado.coerceAtLeast(0), tween(250), label = "segmento")
        if (seleccionado in opciones.indices) {
            Box(
                Modifier
                    .offset(x = desplazamiento)
                    .width(ancho)
                    .fillMaxHeight()
                    .clip(FormaPildora)
                    .background(MaterialTheme.colorScheme.primary)
            )
        }
        Row(Modifier.fillMaxWidth().fillMaxHeight()) {
            opciones.forEachIndexed { indice, texto ->
                val activo = indice == seleccionado
                val color = if (activo) MaterialTheme.colorScheme.onPrimary else c.textoSecundario
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clip(FormaPildora)
                        .then(
                            if (interactivo) Modifier.selectable(
                                selected = activo,
                                enabled = habilitado,
                                role = Role.Tab,
                                onClick = { onSeleccionar(indice) }
                            ) else Modifier
                        ),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    iconos?.getOrNull(indice)?.let {
                        Icon(it, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(Espacio.xs))
                    }
                    Text(
                        texto,
                        style = MaterialTheme.typography.labelLarge,
                        color = color,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

/**
 * Stepper horizontal (Pendiente → Subido → Confirmado). Las etapas cumplidas
 * llevan palomita; [tonoFinal] permite pintar la última de otro color (p. ej.
 * "Exento" en neutro o "Sin reporte" en rojo).
 */
@Composable
fun StepperEtapas(
    etapas: List<String>,
    etapaActual: Int,
    modifier: Modifier = Modifier,
    tonoActual: TonoEstado = TonoEstado.EXITO
) {
    val c = DocenCheckTema.colores
    Row(
        modifier = modifier.fillMaxWidth().semantics(mergeDescendants = true) {
            contentDescription = "Etapa ${etapaActual + 1} de ${etapas.size}: ${etapas.getOrNull(etapaActual) ?: ""}"
        },
        verticalAlignment = Alignment.Top
    ) {
        etapas.forEachIndexed { indice, etapa ->
            val completado = indice < etapaActual
            val actual = indice == etapaActual
            val tono = tonoActual.colores()
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(88.dp)) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(
                            when {
                                completado -> MaterialTheme.colorScheme.primary
                                actual -> tono.contenedor
                                else -> c.pistaProgreso
                            }
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    if (completado) {
                        Icon(Icons.Rounded.Check, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(18.dp))
                    } else {
                        Text(
                            "${indice + 1}",
                            style = TextoBadge,
                            color = if (actual) tono.contenido else c.textoSecundario
                        )
                    }
                }
                Text(
                    etapa,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (completado || actual) c.texto else c.textoSecundario,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = Espacio.xs)
                )
            }
            if (indice < etapas.lastIndex) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .padding(top = 15.dp)
                        .height(2.dp)
                        .background(if (indice < etapaActual) MaterialTheme.colorScheme.primary else c.pistaProgreso)
                )
            }
        }
    }
}

// =============================================================================
// Navegación inferior
// =============================================================================

/** Un destino de la barra inferior. [insignia] > 0 muestra un contador. */
data class DestinoNav(
    val ruta: String,
    val etiqueta: String,
    val icono: ImageVector,
    val iconoSeleccionado: ImageVector,
    val insignia: Int = 0
)

/** Barra inferior Material 3 con íconos reales; el activo va relleno y en verde. */
@Composable
fun BarraNavegacion(destinos: List<DestinoNav>, rutaActual: String?, onSeleccionar: (DestinoNav) -> Unit) {
    NavigationBar(containerColor = DocenCheckTema.colores.superficie, tonalElevation = Elevacion.nivel0) {
        destinos.forEach { destino ->
            val activo = destino.ruta == rutaActual
            NavigationBarItem(
                selected = activo,
                onClick = { if (!activo) onSeleccionar(destino) },
                icon = {
                    if (destino.insignia > 0) {
                        BadgedBox(badge = { Badge { Text("${destino.insignia}") } }) {
                            Icon(if (activo) destino.iconoSeleccionado else destino.icono, contentDescription = null)
                        }
                    } else {
                        Icon(if (activo) destino.iconoSeleccionado else destino.icono, contentDescription = null)
                    }
                },
                label = { Text(destino.etiqueta, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                    selectedTextColor = MaterialTheme.colorScheme.primary,
                    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                    unselectedIconColor = DocenCheckTema.colores.textoSecundario,
                    unselectedTextColor = DocenCheckTema.colores.textoSecundario
                )
            )
        }
    }
}
