package com.fime.docencheck.ui.admin.panel

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Engineering
import androidx.compose.material.icons.rounded.FactCheck
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.PersonOff
import androidx.compose.material.icons.rounded.PendingActions
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.Aviso
import com.fime.docencheck.core.ui.ContenedorRefrescable
import com.fime.docencheck.core.ui.ContenidoSegunEstado
import com.fime.docencheck.core.ui.RecargarAlReanudar
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.ui.rememberAvisos
import com.fime.docencheck.core.util.FormatoUi
import com.fime.docencheck.ui.theme.AvisoBanner
import com.fime.docencheck.ui.theme.BadgeEstado
import com.fime.docencheck.ui.theme.CuadriculaDos
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.IconoCircular
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TarjetaIndicador
import com.fime.docencheck.ui.theme.TonoEstado
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

@Composable
fun PanelGeneralScreen(
    onSemestres: () -> Unit,
    onIngenieros: () -> Unit,
    onBecarios: () -> Unit,
    onTransferencias: () -> Unit,
    onReporteHorasGlobal: () -> Unit,
    onReportesSiase: () -> Unit,
    onConfiguracion: () -> Unit,
    onExportar: () -> Unit,
    onMiCuenta: () -> Unit,
    avisosExternos: Flow<Aviso> = emptyFlow()
) {
    val app = appActual()
    val viewModel: PanelGeneralViewModel = viewModel(
        factory = viewModelFactory { initializer { PanelGeneralViewModel(app.adminRepository) } }
    )
    RecargarAlReanudar(viewModel::cargar)
    val estado by viewModel.estado.collectAsState()

    PantallaConEncabezado(
        titulo = "Coordinación de becarios",
        subtitulo = "DocenCheck · FIME",
        etiqueta = "Administrador",
        snackbarHostState = rememberAvisos(avisosExternos),
        accionHeader = {
            IconButton(onClick = onMiCuenta) { Icon(Icons.Rounded.AccountCircle, contentDescription = "Mi cuenta") }
        }
    ) { padding ->
        ContenedorRefrescable(onRefrescar = viewModel::cargar, marcaDatos = estado, modifier = Modifier.padding(padding)) {
            ContenidoSegunEstado(estado, viewModel::cargar) { datos ->
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(Espacio.pantalla),
                    verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
                ) {
                    if (datos.siase_por_firmar > 0) {
                        item(key = "banner") {
                            AvisoBanner(
                                titulo = "${FormatoUi.plural(datos.siase_por_firmar, "reporte SIASE listo", "reportes SIASE listos")} para firmar",
                                texto = "Revisa y firma los reportes que los becarios ya subieron.",
                                tono = TonoEstado.EXITO,
                                icono = Icons.Rounded.FactCheck,
                                textoAccion = "Ir a firmar",
                                onAccion = onReportesSiase
                            )
                        }
                    }

                    item(key = "indicadores") {
                        CuadriculaDos(
                            listOf(
                                { m -> TarjetaIndicador(FormatoUi.entero(datos.becarios_activos), "Becarios activos", Icons.Rounded.Groups, m, onClick = onBecarios) },
                                { m ->
                                    TarjetaIndicador(
                                        FormatoUi.entero(datos.becarios_sin_asignar), "Sin asignar", Icons.Rounded.PersonOff, m,
                                        alerta = datos.becarios_sin_asignar > 0, onClick = onBecarios
                                    )
                                },
                                { m -> TarjetaIndicador(FormatoUi.entero(datos.ingenieros_activos), "Ingenieros", Icons.Rounded.Engineering, m, onClick = onIngenieros) },
                                { m ->
                                    TarjetaIndicador(
                                        FormatoUi.entero(datos.transferencias_pendientes), "Traspasos pendientes", Icons.Rounded.SwapHoriz, m,
                                        alerta = datos.transferencias_pendientes > 0, onClick = onTransferencias
                                    )
                                },
                                { m ->
                                    TarjetaIndicador(
                                        FormatoUi.entero(datos.siase_por_firmar), "SIASE por firmar", Icons.Rounded.FactCheck, m,
                                        alerta = datos.siase_por_firmar > 0, onClick = onReportesSiase
                                    )
                                },
                                { m ->
                                    TarjetaIndicador(
                                        FormatoUi.entero(datos.siase_sin_entregar), "SIASE sin entregar", Icons.Rounded.PendingActions, m,
                                        alerta = datos.siase_sin_entregar > 0, detalle = "este mes", onClick = onReportesSiase
                                    )
                                }
                            )
                        )
                    }

                    item(key = "periodo") {
                        Tarjeta(Modifier.fillMaxWidth(), onClick = onSemestres) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                IconoCircular(
                                    if (datos.periodo_nombre != null) Icons.Rounded.CalendarMonth else Icons.Rounded.WarningAmber,
                                    tono = if (datos.periodo_nombre != null) TonoEstado.EXITO else TonoEstado.PELIGRO
                                )
                                Spacer(Modifier.width(Espacio.m))
                                Column(Modifier.weight(1f)) {
                                    Text("Periodo actual", style = MaterialTheme.typography.bodySmall, color = DocenCheckTema.colores.textoSecundario)
                                    Text(
                                        datos.periodo_nombre ?: "No hay periodo activo",
                                        style = MaterialTheme.typography.titleMedium,
                                        color = DocenCheckTema.colores.texto
                                    )
                                    FormatoUi.fechaDeTexto(datos.periodo_fin)?.let {
                                        Text("Termina el ${FormatoUi.fechaMedia(it)}", style = MaterialTheme.typography.bodySmall, color = DocenCheckTema.colores.textoSecundario)
                                    }
                                }
                                Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = DocenCheckTema.colores.textoSecundario)
                            }
                            datos.ventana_abierta?.let { abierta ->
                                BadgeEstado(
                                    if (abierta) "Ventana SIASE abierta · quedan ${FormatoUi.plural(datos.ventana_dias_restantes ?: 0, "día", "días")}"
                                    else "Ventana SIASE cerrada",
                                    if (abierta) TonoEstado.ALERTA else TonoEstado.NEUTRO,
                                    modifier = Modifier.padding(top = Espacio.m)
                                )
                            }
                        }
                    }

                    item(key = "accesos") {
                        AccesosRapidos(
                            listOf(
                                Acceso("Reporte de horas", "Avance de todos los becarios", Icons.Rounded.Groups, onReporteHorasGlobal),
                                Acceso("Configuración", "Metas y ventana SIASE", Icons.Rounded.PendingActions, onConfiguracion),
                                Acceso("Exportar asistencias", "Archivo CSV para Excel", Icons.Rounded.FactCheck, onExportar)
                            )
                        )
                    }
                }
            }
        }
    }
}

data class Acceso(val titulo: String, val detalle: String, val icono: ImageVector, val onClick: () -> Unit)

/** Lista de accesos (fila clicable con ícono, texto y flecha). */
@Composable
fun AccesosRapidos(accesos: List<Acceso>) {
    Tarjeta(Modifier.fillMaxWidth(), relleno = PaddingValues(vertical = Espacio.xs)) {
        accesos.forEachIndexed { i, a ->
            if (i > 0) com.fime.docencheck.ui.theme.Divisor(Modifier.padding(start = 72.dp))
            androidx.compose.material3.ListItem(
                headlineContent = { Text(a.titulo, style = MaterialTheme.typography.titleSmall) },
                supportingContent = { Text(a.detalle, style = MaterialTheme.typography.bodySmall) },
                leadingContent = { IconoCircular(a.icono, tono = TonoEstado.EXITO) },
                trailingContent = { Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null) },
                colors = androidx.compose.material3.ListItemDefaults.colors(containerColor = DocenCheckTema.colores.superficie),
                modifier = Modifier.clickable(role = Role.Button, onClick = a.onClick)
            )
        }
    }
}
