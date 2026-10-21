package com.fime.docencheck.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color

/**
 * Sin color dinámico (Material You) a propósito: la identidad es el verde
 * institucional de FIME en cualquier teléfono.
 */
private val EsquemaClaro = lightColorScheme(
    primary = Verde700,
    onPrimary = Neutro0,
    primaryContainer = Verde100,
    onPrimaryContainer = Verde900,
    secondary = Verde600,
    onSecondary = Neutro0,
    secondaryContainer = Verde50,
    onSecondaryContainer = Verde900,
    tertiary = AlertaAcento,
    onTertiary = Neutro0,
    background = Neutro50,
    onBackground = Neutro900,
    surface = Neutro0,
    onSurface = Neutro900,
    surfaceVariant = Neutro100,
    onSurfaceVariant = Neutro500,
    surfaceContainerLowest = Neutro0,
    surfaceContainerLow = Neutro0,
    surfaceContainer = Neutro0,
    surfaceContainerHigh = Neutro0,
    surfaceContainerHighest = Neutro100,
    outline = Neutro300,
    outlineVariant = Neutro200,
    error = PeligroAcento,
    onError = Neutro0,
    errorContainer = PeligroFondo,
    onErrorContainer = PeligroTexto,
    inverseSurface = Color(0xFF26302B),
    inverseOnSurface = Color(0xFFEFF3F0),
    inversePrimary = Verde300,
    scrim = Color.Black
)

private val EsquemaOscuro = darkColorScheme(
    primary = Verde300,
    onPrimary = Color(0xFF00391E),
    primaryContainer = Color(0xFF1E5136),
    onPrimaryContainer = Color(0xFFB6E8C9),
    secondary = Color(0xFF9CD9B4),
    onSecondary = Color(0xFF00391E),
    secondaryContainer = Color(0xFF1D3B2A),
    onSecondaryContainer = Color(0xFFB6E8C9),
    tertiary = Color(0xFFFFC266),
    onTertiary = Color(0xFF452B00),
    background = ColoresOscuros.fondo,
    onBackground = ColoresOscuros.texto,
    surface = ColoresOscuros.superficie,
    onSurface = ColoresOscuros.texto,
    surfaceVariant = Color(0xFF222B26),
    onSurfaceVariant = ColoresOscuros.textoSecundario,
    surfaceContainerLowest = Color(0xFF0B0F0D),
    surfaceContainerLow = Color(0xFF151C18),
    surfaceContainer = ColoresOscuros.superficie,
    surfaceContainerHigh = Color(0xFF1F2823),
    surfaceContainerHighest = Color(0xFF2A3430),
    outline = Color(0xFF56635C),
    outlineVariant = ColoresOscuros.borde,
    error = Color(0xFFFF8A80),
    onError = Color(0xFF5C0A0A),
    errorContainer = ColoresOscuros.peligroContenedor,
    onErrorContainer = ColoresOscuros.sobrePeligroContenedor,
    inverseSurface = Color(0xFFE3E8E5),
    inverseOnSurface = Color(0xFF1A201D),
    inversePrimary = Verde700,
    scrim = Color.Black
)

@Composable
fun DocenCheckTheme(oscuro: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val colores = if (oscuro) ColoresOscuros else ColoresClaros
    CompositionLocalProvider(LocalColoresDocenCheck provides colores) {
        MaterialTheme(
            colorScheme = if (oscuro) EsquemaOscuro else EsquemaClaro,
            typography = TipografiaApp,
            shapes = FormasApp,
            content = content
        )
    }
}

/** Acceso corto a los tokens propios: `DocenCheckTema.colores.exitoContenedor`. */
object DocenCheckTema {
    val colores: ColoresDocenCheck
        @Composable @ReadOnlyComposable get() = LocalColoresDocenCheck.current
}
