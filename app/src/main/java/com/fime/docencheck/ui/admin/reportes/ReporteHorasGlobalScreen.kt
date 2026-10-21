package com.fime.docencheck.ui.admin.reportes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Engineering
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.PersonOff
import androidx.compose.material.icons.rounded.TrendingDown
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.ContenedorRefrescable
import com.fime.docencheck.core.ui.ContenidoSegunEstado
import com.fime.docencheck.core.ui.EstadoVacio
import com.fime.docencheck.core.ui.RecargarAlReanudar
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.util.FormatoUi
import com.fime.docencheck.data.model.ProgresoBecario
import com.fime.docencheck.ui.theme.BadgeEstado
import com.fime.docencheck.ui.theme.CuadriculaDos
import com.fime.docencheck.ui.theme.Divisor
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.EncabezadoSeccion
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.FilaProgreso
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.SegmentadoControl
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TarjetaIndicador
import com.fime.docencheck.ui.theme.TonoEstado

@Composable
fun ReporteHorasGlobalScreen(onVolver: (() -> Unit)?) {
    val app = appActual()
    val viewModel: ReporteHorasGlobalViewModel = viewModel(
        factory = viewModelFactory {
            initializer { ReporteHorasGlobalViewModel(app.adminRepository, app.progresoRepository) }
        }
    )
    RecargarAlReanudar(viewModel::cargar)
    val estado by viewModel.estado.collectAsState()
    val detalle by viewModel.detalle.collectAsState()
    val nombres by viewModel.nombresIngenieros.collectAsState()
    var periodo by rememberSaveable { mutableIntStateOf(0) }

    PantallaConEncabezado(titulo = "Reporte de horas", subtitulo = "Todos los becarios activos", onVolver = onVolver) { padding ->
        ContenedorRefrescable(onRefrescar = viewModel::cargar, marcaDatos = estado, modifier = Modifier.padding(padding)) {
            ContenidoSegunEstado(estado, viewModel::cargar) { _ ->
                val grupos = detalle.groupBy { it.ingeniero_id }.toList()
                    .sortedWith(compareBy({ it.first == null }, { nombres[it.first] ?: "" }))
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(Espacio.pantalla),
                    verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
                ) {
                    item(key = "resumen") {
                        CuadriculaDos(
                            listOf(
                                { m -> TarjetaIndicador(FormatoUi.entero(detalle.size), "Becarios supervisados", Icons.Rounded.Groups, m) },
                                { m ->
                                    val riesgo = detalle.count { it.enRiesgo }
                                    TarjetaIndicador(FormatoUi.entero(riesgo), "Con ritmo bajo", Icons.Rounded.TrendingDown, m, alerta = riesgo > 0, detalle = "esta semana")
                                }
                            )
                        )
                    }
                    item(key = "segmentado") {
                        SegmentadoControl(listOf("Semana", "Mes", "Semestre"), periodo, { periodo = it })
                    }
                    if (detalle.isEmpty()) {
                        item { EstadoVacio("Sin becarios activos", icono = Icons.Rounded.Groups) }
                    }
                    grupos.forEach { (ingenieroId, becarios) ->
                        item(key = "grupo-$ingenieroId") {
                            Tarjeta(Modifier.fillMaxWidth()) {
                                EncabezadoSeccion(
                                    if (ingenieroId == null) "Sin ingeniero asignado" else nombres[ingenieroId] ?: "Ingeniero",
                                    icono = if (ingenieroId == null) Icons.Rounded.PersonOff else Icons.Rounded.Engineering
                                )
                                Text(
                                    FormatoUi.plural(becarios.size, "becario", "becarios"),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = DocenCheckTema.colores.textoSecundario
                                )
                                becarios.sortedBy { it.nombre }.forEachIndexed { i, b ->
                                    if (i > 0) Divisor()
                                    FilaBecario(b, periodo)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FilaBecario(b: ProgresoBecario, periodo: Int) {
    Column(Modifier.fillMaxWidth().padding(top = Espacio.m)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(b.nombre, style = MaterialTheme.typography.titleSmall, color = DocenCheckTema.colores.texto, modifier = Modifier.weight(1f))
            if (b.enRiesgo) BadgeEstado("Ritmo bajo", TonoEstado.ALERTA)
        }
        when (periodo) {
            0 -> FilaProgreso(
                "Semana", b.horas_semana, b.meta_semanal,
                ritmoEsperado = b.meta_semanal?.takeIf { it > 0 }?.let { (b.horasEsperadasSemana / it).toFloat() }
            )
            1 -> FilaProgreso("Mes", b.horas_mes, b.meta_mensual, ritmoEsperado = FormatoUi.ritmoMes())
            else -> FilaProgreso("Semestre", b.horas_semestre, b.meta_semestral)
        }
    }
}
