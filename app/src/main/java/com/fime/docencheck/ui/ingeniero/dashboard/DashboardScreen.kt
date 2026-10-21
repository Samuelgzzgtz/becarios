package com.fime.docencheck.ui.ingeniero.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.EventAvailable
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.TrendingDown
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.ContenedorRefrescable
import com.fime.docencheck.core.ui.ContenidoSegunEstado
import com.fime.docencheck.core.ui.RecargarAlReanudar
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.core.util.FormatoUi
import com.fime.docencheck.ui.theme.BarraProgresoMeta
import com.fime.docencheck.ui.theme.CuadriculaDos
import com.fime.docencheck.ui.theme.Divisor
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.EncabezadoSeccion
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.IconoCircular
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TarjetaIndicador
import com.fime.docencheck.ui.theme.TonoEstado
import com.fime.docencheck.ui.theme.colores
import com.fime.docencheck.ui.theme.etiqueta
import com.fime.docencheck.ui.theme.tono

@Composable
fun DashboardScreen(
    onMisBecarios: () -> Unit,
    onReportesSiase: () -> Unit,
    onTransferencias: () -> Unit,
    @Suppress("UNUSED_PARAMETER") onMiCuenta: () -> Unit = {},
    onConsultaEquipo: () -> Unit = {},
    onBecario: (String) -> Unit = {}
) {
    val app = appActual()
    val viewModel: DashboardViewModel = viewModel(
        factory = viewModelFactory {
            initializer { DashboardViewModel(app.sessionManager, app.equipoRepository, app.progresoRepository) }
        }
    )
    val resumenVm: ResumenDashboardViewModel = viewModel(
        factory = viewModelFactory {
            initializer { ResumenDashboardViewModel(app.progresoRepository, app.asistenciaRepository, app.siaseRepository) }
        }
    )
    val recargar = {
        viewModel.cargar()
        resumenVm.cargar()
    }
    RecargarAlReanudar(recargar)
    val estado by viewModel.estado.collectAsState()
    val resumen by resumenVm.resumen.collectAsState()
    val nombre = app.sessionManager.usuarioEnMemoria()?.nombre

    PantallaConEncabezado(
        titulo = nombre?.let { "Hola, Ing. ${FormatoUi.primerNombre(it)}" } ?: "Panel del ingeniero",
        subtitulo = FormatoUi.diaCompleto(FechaUi.hoy())
    ) { padding ->
        ContenedorRefrescable(onRefrescar = recargar, marcaDatos = estado, modifier = Modifier.padding(padding)) {
            ContenidoSegunEstado(estado, viewModel::cargar) { datos ->
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(Espacio.pantalla),
                    verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
                ) {
                    item(key = "indicadores") {
                        val ventana = resumen.ventana
                        CuadriculaDos(
                            listOf(
                                { m -> TarjetaIndicador("${datos.totalBecarios}", "Becarios activos", Icons.Rounded.Groups, m, onClick = onMisBecarios) },
                                { m ->
                                    TarjetaIndicador(
                                        resumen.conRegistroHoy?.let { "$it" } ?: "–",
                                        "Asistieron hoy",
                                        Icons.Rounded.EventAvailable,
                                        m,
                                        detalle = "de ${datos.totalBecarios}",
                                        onClick = onConsultaEquipo
                                    )
                                },
                                { m ->
                                    TarjetaIndicador(
                                        "${datos.enRiesgo.size}",
                                        "Debajo de su meta",
                                        Icons.Rounded.TrendingDown,
                                        m,
                                        alerta = datos.enRiesgo.isNotEmpty(),
                                        detalle = "esta semana"
                                    )
                                },
                                { m ->
                                    TarjetaIndicador(
                                        when {
                                            ventana == null -> "–"
                                            ventana.abierta -> FormatoUi.plural(ventana.dias_restantes, "día", "días")
                                            else -> "Cerrada"
                                        },
                                        "Ventana SIASE",
                                        Icons.Rounded.Description,
                                        m,
                                        alerta = ventana?.abierta == true,
                                        detalle = if (ventana?.abierta == true) "para entregar" else null,
                                        onClick = onReportesSiase
                                    )
                                }
                            )
                        )
                    }

                    if (datos.enRiesgo.isNotEmpty()) {
                        item(key = "riesgo") {
                            Tarjeta(Modifier.fillMaxWidth()) {
                                EncabezadoSeccion("Requieren atención", icono = Icons.Rounded.TrendingDown)
                                Text(
                                    "Van por debajo del 80 % de lo esperado según sus días laborales.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = DocenCheckTema.colores.textoSecundario
                                )
                                datos.enRiesgo.forEachIndexed { i, r ->
                                    if (i > 0) Divisor()
                                    Column(
                                        Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = Espacio.m)
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(r.becario.nombre, style = MaterialTheme.typography.titleSmall, color = DocenCheckTema.colores.texto, modifier = Modifier.weight(1f))
                                            Text(
                                                FormatoUi.horasDeMeta(r.horasSemana, r.metaSemanal),
                                                style = MaterialTheme.typography.labelLarge,
                                                color = DocenCheckTema.colores.alerta
                                            )
                                        }
                                        BarraProgresoMeta(
                                            progreso = if (r.metaSemanal > 0) (r.horasSemana / r.metaSemanal).toFloat() else 0f,
                                            ritmoEsperado = if (r.metaSemanal > 0) (r.horasEsperadas / r.metaSemanal).toFloat() else null,
                                            modifier = Modifier.fillMaxWidth().padding(top = Espacio.s)
                                        )
                                        Text(
                                            "Debería llevar ${FormatoUi.horas(r.horasEsperadas)}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = DocenCheckTema.colores.textoSecundario,
                                            modifier = Modifier.padding(top = Espacio.xs)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    item(key = "actividad") {
                        Tarjeta(Modifier.fillMaxWidth()) {
                            EncabezadoSeccion("Actividad reciente", icono = Icons.Rounded.History, textoAccion = "Ver todo", onAccion = onConsultaEquipo)
                            if (resumen.actividad.isEmpty()) {
                                Text(
                                    "Sin registros en los últimos 7 días.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = DocenCheckTema.colores.textoSecundario,
                                    modifier = Modifier.padding(top = Espacio.s)
                                )
                            }
                            resumen.actividad.forEach { evento ->
                                val a = evento.asistencia.asistencia
                                Row(
                                    Modifier.fillMaxWidth().padding(vertical = Espacio.s),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(Modifier.size(10.dp).background(a.tipo.tono().colores().acento, CircleShape))
                                    Spacer(Modifier.width(Espacio.m))
                                    Column(Modifier.weight(1f)) {
                                        Text(evento.nombre, style = MaterialTheme.typography.titleSmall, color = DocenCheckTema.colores.texto, maxLines = 1)
                                        Text(
                                            "${a.tipo.etiqueta()} · ${FechaUi.fechaHora(a.ocurrido_en)}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = DocenCheckTema.colores.textoSecundario
                                        )
                                    }
                                }
                            }
                        }
                    }

                    item(key = "transferencias") {
                        Tarjeta(Modifier.fillMaxWidth(), onClick = onTransferencias) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                IconoCircular(Icons.Rounded.SwapHoriz, tono = TonoEstado.INFO)
                                Column(Modifier.weight(1f).padding(horizontal = Espacio.m)) {
                                    Text("Transferencias", style = MaterialTheme.typography.titleSmall, color = DocenCheckTema.colores.texto)
                                    Text("Estado de tus solicitudes de cambio", style = MaterialTheme.typography.bodySmall, color = DocenCheckTema.colores.textoSecundario)
                                }
                                Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = DocenCheckTema.colores.textoSecundario)
                            }
                        }
                    }
                }
            }
        }
    }
}
