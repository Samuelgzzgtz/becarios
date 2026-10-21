package com.fime.docencheck.ui.admin.exportar

import android.content.ActivityNotFoundException
import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.TableChart
import androidx.compose.material3.AssistChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.ui.theme.AvisoBanner
import com.fime.docencheck.ui.theme.BotonPrimario
import com.fime.docencheck.ui.theme.Divisor
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.EncabezadoSeccion
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.SelectorFecha
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TonoEstado
import java.time.LocalDate

private val COLUMNAS = listOf("Matrícula", "Nombre", "Tipo", "Modalidad", "Fecha", "Hora")

@Composable
fun ExportarScreen(onVolver: () -> Unit) {
    val app = appActual()
    val contexto = LocalContext.current
    val viewModel: ExportarViewModel = viewModel(
        factory = viewModelFactory { initializer { ExportarViewModel(app.adminRepository) } }
    )
    val estado by viewModel.estado.collectAsState()

    LaunchedEffect(estado.archivo) {
        val exportado = estado.archivo ?: return@LaunchedEffect
        if (exportado.registros > 0) {
            val uri = FileProvider.getUriForFile(contexto, "${contexto.packageName}.fileprovider", exportado.archivo)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/csv"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            try {
                contexto.startActivity(Intent.createChooser(intent, "Compartir asistencias"))
            } catch (_: ActivityNotFoundException) {
                // Sin apps para compartir: el resumen en pantalla sigue indicando el resultado.
            }
        }
        viewModel.archivoCompartido()
    }

    val desde = runCatching { LocalDate.parse(estado.desde.trim()) }.getOrNull()
    val hasta = runCatching { LocalDate.parse(estado.hasta.trim()) }.getOrNull()
    val fijarRango = { d: LocalDate, h: LocalDate ->
        viewModel.cambiarDesde(d.toString())
        viewModel.cambiarHasta(h.toString())
    }
    val hoy = FechaUi.hoy()

    PantallaConEncabezado(
        titulo = "Exportar asistencias",
        subtitulo = "Archivo CSV compatible con Excel",
        onVolver = onVolver,
        barraAccion = {
            BotonPrimario(
                texto = if (estado.generando) "Generando…" else "Generar y compartir",
                onClick = { viewModel.generar(contexto.cacheDir) },
                cargando = estado.generando,
                habilitado = desde != null && hasta != null && !hasta.isBefore(desde),
                icono = Icons.Rounded.Download,
                modifier = Modifier.fillMaxWidth()
            )
        }
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(Espacio.pantalla),
            verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
        ) {
            Tarjeta(Modifier.fillMaxWidth()) {
                EncabezadoSeccion("Rango de fechas")
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = Espacio.s),
                    horizontalArrangement = Arrangement.spacedBy(Espacio.s)
                ) {
                    AssistChip(onClick = { fijarRango(FechaUi.lunesDe(), hoy) }, label = { Text("Esta semana") })
                    AssistChip(onClick = { fijarRango(FechaUi.mesActual(), hoy) }, label = { Text("Este mes") })
                    AssistChip(onClick = {
                        val inicio = FechaUi.mesActual().minusMonths(1)
                        fijarRango(inicio, inicio.plusMonths(1).minusDays(1))
                    }, label = { Text("Mes pasado") })
                }
                SelectorFecha("Desde", desde, { viewModel.cambiarDesde(it.toString()) }, fechaMaxima = hoy)
                SelectorFecha(
                    "Hasta (incluido)", hasta, { viewModel.cambiarHasta(it.toString()) },
                    fechaMinima = desde, fechaMaxima = hoy,
                    error = if (desde != null && hasta != null && hasta.isBefore(desde)) "Debe ser igual o posterior a \"Desde\"" else null,
                    modifier = Modifier.padding(top = Espacio.s)
                )
            }

            Tarjeta(Modifier.fillMaxWidth()) {
                EncabezadoSeccion("Qué incluye el archivo", icono = Icons.Rounded.TableChart)
                Text(
                    "Una fila por registro, con fecha y hora de Monterrey. Incluye becarios dados de baja.",
                    style = MaterialTheme.typography.bodySmall,
                    color = DocenCheckTema.colores.textoSecundario,
                    modifier = Modifier.padding(bottom = Espacio.s)
                )
                COLUMNAS.forEachIndexed { i, columna ->
                    if (i > 0) Divisor()
                    Text(columna, style = MaterialTheme.typography.bodyMedium, color = DocenCheckTema.colores.texto, modifier = Modifier.padding(vertical = Espacio.s))
                }
            }

            AnimatedVisibility(visible = estado.error != null) {
                AvisoBanner(estado.error.orEmpty(), TonoEstado.PELIGRO, icono = Icons.Rounded.ErrorOutline)
            }
            AnimatedVisibility(visible = estado.resumen != null) {
                AvisoBanner(estado.resumen.orEmpty(), TonoEstado.EXITO, icono = Icons.Rounded.CheckCircle)
            }
        }
    }
}
