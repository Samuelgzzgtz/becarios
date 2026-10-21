package com.fime.docencheck.ui.admin.mas

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.BarChart
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.FactCheck
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.fime.docencheck.core.ui.Aviso
import com.fime.docencheck.core.ui.rememberAvisos
import com.fime.docencheck.ui.admin.panel.Acceso
import com.fime.docencheck.ui.admin.panel.AccesosRapidos
import com.fime.docencheck.ui.theme.EncabezadoSeccion
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

/** Pestaña "Más" del administrador: el resto de las herramientas, agrupadas. */
@Composable
fun MasAdminScreen(
    onReportesSiase: () -> Unit,
    onSemestres: () -> Unit,
    onReporteHorasGlobal: () -> Unit,
    onConfiguracion: () -> Unit,
    onExportar: () -> Unit,
    onMiCuenta: () -> Unit,
    avisosExternos: Flow<Aviso> = emptyFlow()
) {
    PantallaConEncabezado(
        titulo = "Más herramientas",
        subtitulo = "Reportes, periodos y configuración",
        etiqueta = "Administrador",
        snackbarHostState = rememberAvisos(avisosExternos)
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(Espacio.pantalla),
            verticalArrangement = Arrangement.spacedBy(Espacio.m)
        ) {
            EncabezadoSeccion("Seguimiento")
            AccesosRapidos(
                listOf(
                    Acceso("Firmas SIASE", "Firma en lote los reportes mensuales", Icons.Rounded.FactCheck, onReportesSiase),
                    Acceso("Reporte de horas", "Avance por ingeniero y becario", Icons.Rounded.BarChart, onReporteHorasGlobal),
                    Acceso("Exportar asistencias", "Genera un CSV para Excel", Icons.Rounded.Download, onExportar)
                )
            )
            EncabezadoSeccion("Administración")
            AccesosRapidos(
                listOf(
                    Acceso("Gestión de semestres", "Periodo actual, cierre y apertura", Icons.Rounded.CalendarMonth, onSemestres),
                    Acceso("Configuración", "Metas de horas y ventana SIASE", Icons.Rounded.Tune, onConfiguracion)
                )
            )
            EncabezadoSeccion("Cuenta")
            AccesosRapidos(listOf(Acceso("Mi cuenta", "Tus datos y cerrar sesión", Icons.Rounded.AccountCircle, onMiCuenta)))
        }
    }
}
