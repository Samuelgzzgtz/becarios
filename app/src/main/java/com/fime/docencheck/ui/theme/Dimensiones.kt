package com.fime.docencheck.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/** Escala de espaciado: múltiplos de 4 dp. Usar SIEMPRE estos valores para márgenes y separaciones. */
object Espacio {
    val xxs = 2.dp
    val xs = 4.dp
    val s = 8.dp
    val m = 12.dp
    val l = 16.dp
    val xl = 24.dp
    val xxl = 32.dp
    val xxxl = 48.dp

    /** Margen lateral de las pantallas. */
    val pantalla = 16.dp

    /** Separación entre tarjetas de una lista. */
    val entreTarjetas = 12.dp

    /** Objetivo táctil mínimo (WCAG 2.5.5 / Material). */
    val tactilMinimo = 48.dp
}

/** Elevación (tonal en claro, sombra suave). */
object Elevacion {
    val nivel0 = 0.dp
    val nivel1 = 1.dp
    val nivel2 = 3.dp
    val nivel3 = 6.dp
}

/** Formas: tarjetas 16 dp, campos 12 dp, botones en píldora. */
val FormasApp = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(28.dp)
)

val FormaPildora = RoundedCornerShape(percent = 50)
val FormaTarjeta = RoundedCornerShape(16.dp)
val FormaCampo = RoundedCornerShape(12.dp)
