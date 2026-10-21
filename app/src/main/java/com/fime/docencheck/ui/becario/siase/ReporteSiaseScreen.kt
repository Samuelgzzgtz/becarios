package com.fime.docencheck.ui.becario.siase

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.OpenInNew
import androidx.compose.material.icons.rounded.UploadFile
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.ContenedorRefrescable
import com.fime.docencheck.core.ui.ContenidoSegunEstado
import com.fime.docencheck.core.ui.RecargarAlReanudar
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.ui.rememberAvisos
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.core.util.FormatoUi
import com.fime.docencheck.data.model.EstadoReporteSiase
import com.fime.docencheck.ui.theme.AvisoBanner
import com.fime.docencheck.ui.theme.BadgeEstado
import com.fime.docencheck.ui.theme.BotonSecundario
import com.fime.docencheck.ui.theme.Divisor
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.EncabezadoSeccion
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.FormasApp
import com.fime.docencheck.ui.theme.IconoCircular
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.StepperEtapas
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TonoEstado
import com.fime.docencheck.ui.theme.etiqueta
import com.fime.docencheck.ui.theme.icono
import com.fime.docencheck.ui.theme.tono

@Composable
fun ReporteSiaseScreen(onVolver: (() -> Unit)? = null) {
    val app = appActual()
    val contexto = LocalContext.current
    val viewModel: ReporteSiaseViewModel = viewModel(
        factory = viewModelFactory {
            initializer { ReporteSiaseViewModel(app.sessionManager, app.siaseRepository) }
        }
    )
    RecargarAlReanudar(viewModel::cargar)
    val estado by viewModel.estado.collectAsState()
    val urlParaAbrir by viewModel.urlParaAbrir.collectAsState()
    val avisos = rememberAvisos(viewModel.avisos)

    LaunchedEffect(urlParaAbrir) {
        val url = urlParaAbrir ?: return@LaunchedEffect
        try {
            contexto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: ActivityNotFoundException) {
            // Sin visor de PDF/imagen instalado: no hay nada más que hacer aquí.
        }
        viewModel.urlAbierta()
    }

    // La lectura del archivo ocurre en el ViewModel, fuera del hilo principal (A-11, M-12).
    val seleccionarArchivo = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) viewModel.subirDesdeUri(contexto.contentResolver, uri)
    }

    PantallaConEncabezado(
        titulo = "Reporte mensual SIASE",
        subtitulo = "Entrega tu captura o PDF de SIASE",
        onVolver = onVolver,
        snackbarHostState = avisos
    ) { padding ->
        ContenedorRefrescable(onRefrescar = viewModel::cargar, marcaDatos = estado, modifier = Modifier.padding(padding)) {
            ContenidoSegunEstado(estado, viewModel::cargar) { datos ->
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Espacio.pantalla),
                    verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
                ) {
                    // Periodo + ventana
                    Tarjeta(Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            IconoCircular(Icons.Rounded.CalendarMonth, tono = TonoEstado.EXITO)
                            Spacer(Modifier.width(Espacio.m))
                            Column(Modifier.weight(1f)) {
                                Text(datos.mesNombre, style = MaterialTheme.typography.titleMedium, color = DocenCheckTema.colores.texto)
                                Text(
                                    datos.periodoNombre?.let { "Periodo $it" } ?: "Sin periodo activo",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = DocenCheckTema.colores.textoSecundario
                                )
                            }
                            datos.ventana?.let { v ->
                                BadgeEstado(if (v.abierta) "Abierta" else "Cerrada", if (v.abierta) TonoEstado.EXITO else TonoEstado.NEUTRO)
                            }
                        }
                        datos.ventana?.let { v ->
                            val apertura = FormatoUi.fechaDeTexto(v.fecha_apertura)
                            val cierre = FormatoUi.fechaDeTexto(v.fecha_cierre)
                            Text(
                                when {
                                    v.abierta && v.dias_restantes <= 0 -> "Hoy es el último día para entregar."
                                    v.abierta -> "Quedan ${FormatoUi.plural(v.dias_restantes, "día", "días")}" + (cierre?.let { "; cierra el ${FormatoUi.diaMesLargo(it)}." } ?: ".")
                                    apertura != null && cierre != null -> "La ventana va del ${FormatoUi.diaMesLargo(apertura)} al ${FormatoUi.diaMesLargo(cierre)}."
                                    else -> "La ventana está cerrada por ahora."
                                },
                                style = MaterialTheme.typography.bodyMedium,
                                color = DocenCheckTema.colores.textoSecundario,
                                modifier = Modifier.padding(top = Espacio.m)
                            )
                        }
                    }

                    // Estado del mes
                    Tarjeta(Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Tu reporte", style = MaterialTheme.typography.titleMedium, color = DocenCheckTema.colores.texto, modifier = Modifier.weight(1f))
                            BadgeEstado(datos.estado.etiqueta(), datos.estado.tono(), icono = datos.estado.icono())
                        }
                        when (datos.estado) {
                            EstadoReporteSiase.excluido, EstadoReporteSiase.sin_reporte -> Unit
                            else -> StepperEtapas(
                                etapas = listOf("Pendiente", "Subido", "Confirmado"),
                                etapaActual = when (datos.estado) {
                                    EstadoReporteSiase.pendiente -> 0
                                    EstadoReporteSiase.subido -> 1
                                    else -> 3
                                },
                                tonoActual = if (datos.estado == EstadoReporteSiase.subido) TonoEstado.INFO else TonoEstado.ALERTA,
                                modifier = Modifier.padding(top = Espacio.l)
                            )
                        }
                        datos.motivoNoPuedeSubir?.let {
                            AvisoBanner(it, TonoEstado.NEUTRO, icono = Icons.Rounded.Info, modifier = Modifier.padding(top = Espacio.l))
                        }
                    }

                    // Zona de carga
                    ZonaCarga(
                        habilitada = datos.puedeSubir,
                        subiendo = datos.subiendo,
                        reemplazo = datos.estado == EstadoReporteSiase.subido,
                        onClick = { seleccionarArchivo.launch(arrayOf("application/pdf", "image/*")) }
                    )
                    datos.mensaje?.let { AvisoBanner(it, TonoEstado.PELIGRO) }
                    if (datos.archivoElegido != null || datos.estadoDelMes?.archivo_ruta != null) {
                        Tarjeta(Modifier.fillMaxWidth()) {
                            datos.archivoElegido?.let {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Rounded.AttachFile, contentDescription = null, tint = DocenCheckTema.colores.textoSecundario)
                                    Spacer(Modifier.width(Espacio.s))
                                    Text("Último archivo: $it", style = MaterialTheme.typography.bodyMedium, color = DocenCheckTema.colores.texto)
                                }
                            }
                            datos.estadoDelMes?.archivo_ruta?.let { ruta ->
                                BotonSecundario(
                                    texto = "Ver archivo entregado",
                                    onClick = { viewModel.verArchivo(ruta) },
                                    icono = Icons.Rounded.OpenInNew,
                                    modifier = Modifier.fillMaxWidth().padding(top = Espacio.s)
                                )
                            }
                        }
                    }

                    // Historial
                    Tarjeta(Modifier.fillMaxWidth()) {
                        EncabezadoSeccion("Historial de reportes", icono = Icons.Rounded.History)
                        if (datos.historial.isEmpty()) {
                            Text(
                                "Aún no hay reportes anteriores.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = DocenCheckTema.colores.textoSecundario,
                                modifier = Modifier.padding(top = Espacio.s)
                            )
                        }
                        datos.historial.forEachIndexed { i, r ->
                            if (i > 0) Divisor()
                            Row(Modifier.fillMaxWidth().padding(vertical = Espacio.m), verticalAlignment = Alignment.CenterVertically) {
                                Text(FechaUi.parsearMes(r.mes), style = MaterialTheme.typography.bodyMedium, color = DocenCheckTema.colores.texto, modifier = Modifier.weight(1f))
                                BadgeEstado(r.estado.etiqueta(), r.estado.tono())
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Zona punteada para elegir el archivo (PDF o imagen, máx. 10 MB). */
@Composable
private fun ZonaCarga(habilitada: Boolean, subiendo: Boolean, reemplazo: Boolean, onClick: () -> Unit) {
    val c = DocenCheckTema.colores
    val colorBorde = if (habilitada) MaterialTheme.colorScheme.primary else c.borde
    Column(
        Modifier
            .fillMaxWidth()
            .clip(FormasApp.large)
            .drawBehind {
                drawRoundRect(
                    color = colorBorde,
                    style = Stroke(width = 2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(16f, 10f))),
                    cornerRadius = CornerRadius(16.dp.toPx())
                )
            }
            .clickable(enabled = habilitada && !subiendo, role = Role.Button, onClickLabel = "Elegir archivo", onClick = onClick)
            .padding(Espacio.xl),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        if (subiendo) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            Text("Subiendo archivo…", style = MaterialTheme.typography.titleSmall, color = c.texto, modifier = Modifier.padding(top = Espacio.m))
        } else {
            Icon(
                Icons.Rounded.UploadFile,
                contentDescription = null,
                tint = if (habilitada) MaterialTheme.colorScheme.primary else c.textoSecundario,
                modifier = Modifier.size(40.dp)
            )
            Text(
                if (reemplazo) "Reemplazar el reporte entregado" else "Subir captura o PDF de SIASE",
                style = MaterialTheme.typography.titleSmall,
                color = if (habilitada) c.texto else c.textoSecundario,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Espacio.s)
            )
            Text(
                "PDF, JPG o PNG · máximo 10 MB",
                style = MaterialTheme.typography.bodySmall,
                color = c.textoSecundario,
                modifier = Modifier.padding(top = Espacio.xxs)
            )
        }
    }
}
