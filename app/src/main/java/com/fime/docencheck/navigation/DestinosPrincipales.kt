package com.fime.docencheck.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Engineering
import androidx.compose.material.icons.outlined.EventNote
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material.icons.outlined.Widgets
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.BarChart
import androidx.compose.material.icons.rounded.Dashboard
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Engineering
import androidx.compose.material.icons.rounded.EventNote
import androidx.compose.material.icons.rounded.FactCheck
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.School
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.Widgets
import androidx.navigation.NavHostController
import com.fime.docencheck.ui.theme.DestinoNav

/*
 * Destinos de la barra inferior por perfil (auditoría B-03). El primero de cada
 * lista es la raíz del perfil: "Atrás" desde otra pestaña regresa ahí, y desde
 * ahí sale de la app.
 */

val DESTINOS_BECARIO = listOf(
    DestinoNav(Rutas.BECARIO_HOME, "Inicio", Icons.Outlined.Home, Icons.Rounded.Home),
    DestinoNav(Rutas.BECARIO_REPORTE_HORAS, "Horas", Icons.Outlined.BarChart, Icons.Rounded.BarChart),
    DestinoNav(Rutas.BECARIO_CONSULTA_ASISTENCIAS, "Registros", Icons.Outlined.EventNote, Icons.Rounded.EventNote),
    DestinoNav(Rutas.BECARIO_REPORTE_SIASE, "SIASE", Icons.Outlined.Description, Icons.Rounded.Description),
    DestinoNav(Rutas.BECARIO_MI_CUENTA, "Cuenta", Icons.Outlined.AccountCircle, Icons.Rounded.AccountCircle)
)

val DESTINOS_INGENIERO = listOf(
    DestinoNav(Rutas.INGENIERO_DASHBOARD, "Inicio", Icons.Outlined.Dashboard, Icons.Rounded.Dashboard),
    DestinoNav(Rutas.INGENIERO_MIS_BECARIOS, "Becarios", Icons.Outlined.Groups, Icons.Rounded.Groups),
    DestinoNav(Rutas.INGENIERO_CONSULTA_EQUIPO, "Asistencias", Icons.Outlined.EventNote, Icons.Rounded.EventNote),
    DestinoNav(Rutas.INGENIERO_REPORTES_SIASE, "SIASE", Icons.Outlined.FactCheck, Icons.Rounded.FactCheck),
    DestinoNav(Rutas.INGENIERO_MI_CUENTA, "Cuenta", Icons.Outlined.AccountCircle, Icons.Rounded.AccountCircle)
)

val DESTINOS_ADMIN = listOf(
    DestinoNav(Rutas.ADMIN_PANEL, "Inicio", Icons.Outlined.Dashboard, Icons.Rounded.Dashboard),
    DestinoNav(Rutas.ADMIN_BECARIOS, "Becarios", Icons.Outlined.School, Icons.Rounded.School),
    DestinoNav(Rutas.ADMIN_INGENIEROS, "Ingenieros", Icons.Outlined.Engineering, Icons.Rounded.Engineering),
    DestinoNav(Rutas.ADMIN_TRANSFERENCIAS, "Traspasos", Icons.Outlined.SwapHoriz, Icons.Rounded.SwapHoriz),
    DestinoNav(Rutas.ADMIN_MAS, "Más", Icons.Outlined.Widgets, Icons.Rounded.Widgets)
)

/** Destinos de la barra para la ruta actual, o null si la ruta es secundaria (lleva "Volver"). */
fun destinosPara(ruta: String?): List<DestinoNav>? = when {
    ruta == null -> null
    DESTINOS_BECARIO.any { it.ruta == ruta } -> DESTINOS_BECARIO
    DESTINOS_INGENIERO.any { it.ruta == ruta } -> DESTINOS_INGENIERO
    DESTINOS_ADMIN.any { it.ruta == ruta } -> DESTINOS_ADMIN
    else -> null
}

/**
 * Cambia de pestaña conservando el estado de cada una y sin apilar pestañas:
 * la pila queda siempre "raíz del perfil → pestaña".
 */
fun NavHostController.irAPestana(ruta: String) {
    val raiz = destinosPara(ruta)?.firstOrNull()?.ruta ?: return
    navigate(ruta) {
        popUpTo(raiz) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
