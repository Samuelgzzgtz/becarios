package com.fime.docencheck.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// -----------------------------------------------------------------------------
// Paleta base (valores crudos). Las pantallas NO deben usarla directamente:
// usan los tokens semánticos de [ColoresDocenCheck] o MaterialTheme.colorScheme,
// que cambian con el modo oscuro. Contrastes medidos con la fórmula WCAG 2.1.
// -----------------------------------------------------------------------------

// Verde institucional FIME
val Verde950 = Color(0xFF0B2E1C)
val Verde900 = Color(0xFF0F3D26)
val Verde800 = Color(0xFF154A2E) // inicio del degradado del header
val Verde700 = Color(0xFF1E7145) // primario: blanco encima = 6.0:1
val Verde600 = Color(0xFF2E8B57)
val Verde300 = Color(0xFF7FD3A2) // primario en modo oscuro
val Verde100 = Color(0xFFDCEFE3)
val Verde50 = Color(0xFFEEF7F1)

// Neutros (gris verdoso muy leve, para que el fondo no se vea "frío")
val Neutro0 = Color(0xFFFFFFFF)
val Neutro50 = Color(0xFFF5F7F6)
val Neutro100 = Color(0xFFECEFED)
val Neutro200 = Color(0xFFE0E4E2)
val Neutro300 = Color(0xFFC9CFCC)
val Neutro500 = Color(0xFF5F6B66) // texto secundario: 5.6:1 sobre blanco, 5.3:1 sobre Neutro50
val Neutro700 = Color(0xFF374151)
val Neutro900 = Color(0xFF1A1A1A) // texto principal: 17:1

// Estados (tonales: fondo claro + texto oscuro, nunca blanco sobre ámbar; auditoría M-19)
val ExitoTexto = Color(0xFF14532D)      // sobre ExitoFondo = 8.9:1
val ExitoFondo = Color(0xFFDCEFE3)
val AlertaTexto = Color(0xFF6E4200)     // sobre AlertaFondo = 7.4:1
val AlertaFondo = Color(0xFFFFEFCF)
val AlertaAcento = Color(0xFF9A5B00)    // números/íconos de alerta sobre blanco = 5.4:1
val PeligroTexto = Color(0xFF8C1D1D)    // sobre PeligroFondo = 8.1:1
val PeligroFondo = Color(0xFFFDECEC)
val PeligroAcento = Color(0xFFC62828)   // texto/ícono rojo sobre blanco = 5.6:1
val InfoTexto = Color(0xFF1E3A8A)       // sobre InfoFondo = 9.6:1
val InfoFondo = Color(0xFFE3EEFB)
val NeutroTexto = Color(0xFF374151)     // sobre NeutroFondo = 9.4:1
val NeutroFondo = Color(0xFFECEFF1)

/**
 * Tokens semánticos que Material 3 no trae (estados, header, escáner).
 * Se leen con `DocenCheckTema.colores` y tienen versión clara y oscura.
 */
@Immutable
data class ColoresDocenCheck(
    val headerInicio: Color,
    val headerFin: Color,
    val sobreHeader: Color,
    val sobreHeaderSecundario: Color,
    val fondo: Color,
    val superficie: Color,
    val borde: Color,
    val texto: Color,
    val textoSecundario: Color,
    val exito: Color,
    val exitoContenedor: Color,
    val sobreExitoContenedor: Color,
    val alerta: Color,
    val alertaContenedor: Color,
    val sobreAlertaContenedor: Color,
    val peligro: Color,
    val peligroContenedor: Color,
    val sobrePeligroContenedor: Color,
    val info: Color,
    val infoContenedor: Color,
    val sobreInfoContenedor: Color,
    val neutroContenedor: Color,
    val sobreNeutroContenedor: Color,
    val pistaProgreso: Color,
    val esqueleto: Color,
    val escanerFondo: Color,
    val esOscuro: Boolean
)

val ColoresClaros = ColoresDocenCheck(
    headerInicio = Verde800,
    headerFin = Verde700,
    sobreHeader = Neutro0,
    sobreHeaderSecundario = Neutro0.copy(alpha = 0.85f),
    fondo = Neutro50,
    superficie = Neutro0,
    borde = Neutro200,
    texto = Neutro900,
    textoSecundario = Neutro500,
    exito = Verde700,
    exitoContenedor = ExitoFondo,
    sobreExitoContenedor = ExitoTexto,
    alerta = AlertaAcento,
    alertaContenedor = AlertaFondo,
    sobreAlertaContenedor = AlertaTexto,
    peligro = PeligroAcento,
    peligroContenedor = PeligroFondo,
    sobrePeligroContenedor = PeligroTexto,
    info = Color(0xFF1D4ED8),
    infoContenedor = InfoFondo,
    sobreInfoContenedor = InfoTexto,
    neutroContenedor = NeutroFondo,
    sobreNeutroContenedor = NeutroTexto,
    pistaProgreso = Neutro200,
    esqueleto = Neutro100,
    escanerFondo = Color(0xFF0B0F0D),
    esOscuro = false
)

val ColoresOscuros = ColoresDocenCheck(
    headerInicio = Verde950,
    headerFin = Color(0xFF165C38),
    sobreHeader = Neutro0,
    sobreHeaderSecundario = Neutro0.copy(alpha = 0.8f),
    fondo = Color(0xFF0F1412),
    superficie = Color(0xFF18201C),
    borde = Color(0xFF34403A),
    texto = Color(0xFFE3E8E5),
    textoSecundario = Color(0xFFA9B4AE),
    exito = Verde300,
    exitoContenedor = Color(0xFF1D3B2A),
    sobreExitoContenedor = Color(0xFFB6E8C9),
    alerta = Color(0xFFFFC266),
    alertaContenedor = Color(0xFF3D2E10),
    sobreAlertaContenedor = Color(0xFFFFD99A),
    peligro = Color(0xFFFF8A80),
    peligroContenedor = Color(0xFF4A1C1C),
    sobrePeligroContenedor = Color(0xFFFFC9C4),
    info = Color(0xFF9DBBF5),
    infoContenedor = Color(0xFF1C2A44),
    sobreInfoContenedor = Color(0xFFC9D8F7),
    neutroContenedor = Color(0xFF2A3230),
    sobreNeutroContenedor = Color(0xFFC9D1CD),
    pistaProgreso = Color(0xFF2E3833),
    esqueleto = Color(0xFF242D29),
    escanerFondo = Color(0xFF050706),
    esOscuro = true
)

val LocalColoresDocenCheck = staticCompositionLocalOf { ColoresClaros }
