package com.fime.docencheck.ui.ingeniero.siase

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.DoneAll
import androidx.compose.material.icons.rounded.DoNotDisturbOn
import androidx.compose.material.icons.rounded.GroupOff
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.OpenInNew
import androidx.compose.material.icons.rounded.TaskAlt
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.ContenedorRefrescable
import com.fime.docencheck.core.ui.ContenidoSegunEstado
import com.fime.docencheck.core.ui.DialogoConfirmacion
import com.fime.docencheck.core.ui.EstadoVacio
import com.fime.docencheck.core.ui.RecargarAlReanudar
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.ui.rememberAvisos
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.core.util.FormatoUi
import com.fime.docencheck.data.model.EstadoReporteSiase
import com.fime.docencheck.ui.theme.AvatarIniciales
import com.fime.docencheck.ui.theme.AvisoBanner
import com.fime.docencheck.ui.theme.BadgeEstado
import com.fime.docencheck.ui.theme.BotonPrimario
import com.fime.docencheck.ui.theme.BotonSecundario
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.EncabezadoSeccion
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TonoEstado
import com.fime.docencheck.ui.theme.etiqueta
import com.fime.docencheck.ui.theme.icono
import com.fime.docencheck.ui.theme.tono

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ReportesSiaseEquipoScreen(onVolver: (() -> Unit)? = null) {
    val app = appActual()
    val contexto = LocalContext.current
    val viewModel: ReportesSiaseEquipoViewModel = viewModel(
        factory = viewModelFactory {
            initializer { ReportesSiaseEquipoViewModel(app.sessionManager, app.equipoRepository, app.siaseRepository) }
        }
    )
    RecargarAlReanudar(viewModel::cargar)
    val estado by viewModel.estado.collectAsState()
    val procesando by viewModel.procesando.collectAsState()
    val accion by viewModel.accionPendiente.collectAsState()
    val url by viewModel.urlParaAbrir.collectAsState()
    val mes by viewModel.mes.collectAsState()
    val avisos = rememberAvisos(viewModel.avisos)

    LaunchedEffect(url) {
        val destino = url ?: return@LaunchedEffect
        try { contexto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(destino))) } catch (_: ActivityNotFoundException) {}
        viewModel.urlAbierta()
    }

    when (val pendiente = accion) {
        is AccionSiasePendiente.Excluir -> DialogoConfirmacion(
            titulo = "Excluir reporte",
            mensaje = "${pendiente.nombreBecario} quedará exento de entregar el reporte de este mes.",
            textoConfirmar = "Excluir",
            destructivo = true,
            onConfirmar = viewModel::confirmarAccion,
            onCancelar = viewModel::cancelarAccion
        )
        is AccionSiasePendiente.ConfirmarTodos -> DialogoConfirmacion(
            titulo = "Confirmar reportes",
            mensaje = "Se confirmarán ${FormatoUi.plural(pendiente.ids.size, "reporte subido", "reportes subidos")}. ¿Ya los revisaste?",
            icono = Icons.Rounded.DoneAll,
            textoConfirmar = "Confirmar ${pendiente.ids.size}",
            onConfirmar = viewModel::confirmarAccion,
            onCancelar = viewModel::cancelarAccion
        )
        null -> Unit
    }

    PantallaConEncabezado(
        titulo = "Reportes SIASE",
        subtitulo = "Revisa y confirma las entregas de tu equipo",
        onVolver = onVolver,
        snackbarHostState = avisos
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            SelectorMes(
                nombre = FechaUi.mesLargo(mes),
                puedeSiguiente = mes.isBefore(FechaUi.mesActual()),
                onAnterior = { viewModel.cambiarMes(-1) },
                onSiguiente = { viewModel.cambiarMes(1) }
            )
            ContenedorRefrescable(onRefrescar = viewModel::cargar, marcaDatos = estado) {
                ContenidoSegunEstado(estado, viewModel::cargar) { datos ->
                    LazyColumn(
                        Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = Espacio.pantalla, end = Espacio.pantalla, bottom = Espacio.pantalla),
                        verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
                    ) {
                        val porRevisar = datos.idsPorFirmarDelMes.size
                        if (porRevisar > 0) {
                            item(key = "banner") {
                                AvisoBanner(
                                    titulo = "${FormatoUi.plural(porRevisar, "reporte espera", "reportes esperan")} tu revisión",
                                    texto = "Abre cada archivo antes de confirmarlo.",
                                    tono = TonoEstado.INFO,
                                    icono = Icons.Rounded.TaskAlt,
                                    textoAccion = if (porRevisar > 1) "Confirmar todos ($porRevisar)" else null,
                                    onAccion = if (porRevisar > 1 && procesando.isEmpty()) viewModel::pedirConfirmarTodos else null
                                )
                            }
                        }

                        if (datos.anterioresPorFirmar.isNotEmpty()) {
                            item(key = "anteriores") { EncabezadoSeccion("Pendientes de meses anteriores", icono = Icons.Rounded.History) }
                            items(datos.anterioresPorFirmar.filter { it.reporte.id != null }, key = { "ant-${it.reporte.id}" }) { pendiente ->
                                val id = pendiente.reporte.id.orEmpty()
                                Tarjeta(Modifier.fillMaxWidth()) {
                                    FilaPersona(pendiente.becario?.nombre ?: "Becario", FechaUi.parsearMes(pendiente.reporte.mes)) {
                                        BadgeEstado(pendiente.reporte.estado.etiqueta(), pendiente.reporte.estado.tono())
                                    }
                                    FlowRow(Modifier.padding(top = Espacio.m), horizontalArrangement = Arrangement.spacedBy(Espacio.s), verticalArrangement = Arrangement.spacedBy(Espacio.s)) {
                                        pendiente.reporte.archivo_url?.let { ruta ->
                                            BotonSecundario("Ver reporte", { viewModel.verArchivo(ruta) }, icono = Icons.Rounded.OpenInNew)
                                        }
                                        BotonPrimario("Confirmar", { viewModel.aprobar(id) }, cargando = id in procesando, icono = Icons.Rounded.TaskAlt)
                                    }
                                }
                            }
                            item(key = "titulo-mes") { EncabezadoSeccion(datos.mesNombre) }
                        }

                        if (datos.delMes.isEmpty()) {
                            item { EstadoVacio("No tienes becarios activos", mensaje = "Cuando tengas becarios asignados verás aquí sus reportes.", icono = Icons.Rounded.GroupOff) }
                        }

                        items(datos.delMes, key = { it.becario_id }) { item ->
                            val id = item.reporte_id
                            val ocupado = id != null && id in procesando
                            Tarjeta(Modifier.fillMaxWidth()) {
                                FilaPersona(item.nombre, "Matrícula ${item.matricula}") {
                                    BadgeEstado(item.estado.etiqueta(), item.estado.tono(), icono = item.estado.icono())
                                }
                                item.fecha_firma?.let {
                                    Text(
                                        "Confirmado el ${FechaUi.fechaHora(it)}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = DocenCheckTema.colores.textoSecundario,
                                        modifier = Modifier.padding(top = Espacio.s)
                                    )
                                }
                                val puedeRevisar = item.estado == EstadoReporteSiase.subido && id != null
                                if (item.archivo_ruta != null || puedeRevisar) {
                                    FlowRow(Modifier.padding(top = Espacio.m), horizontalArrangement = Arrangement.spacedBy(Espacio.s), verticalArrangement = Arrangement.spacedBy(Espacio.s)) {
                                        item.archivo_ruta?.let { ruta ->
                                            BotonSecundario("Ver reporte", { viewModel.verArchivo(ruta) }, icono = Icons.Rounded.OpenInNew)
                                        }
                                        if (puedeRevisar && id != null) {
                                            BotonPrimario("Confirmar", { viewModel.aprobar(id) }, cargando = ocupado, icono = Icons.Rounded.TaskAlt)
                                            BotonSecundario("Excluir", { viewModel.pedirExcluir(id, item.nombre) }, habilitado = !ocupado, icono = Icons.Rounded.DoNotDisturbOn)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Selector de mes con flechas accesibles (A-03). */
@Composable
fun SelectorMes(nombre: String, puedeSiguiente: Boolean, onAnterior: () -> Unit, onSiguiente: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Espacio.s, vertical = Espacio.s),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onAnterior) {
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowLeft, contentDescription = "Mes anterior")
        }
        Text(
            nombre,
            style = MaterialTheme.typography.titleMedium,
            color = DocenCheckTema.colores.texto,
            textAlign = TextAlign.Center,
            modifier = Modifier.weight(1f)
        )
        IconButton(onClick = onSiguiente, enabled = puedeSiguiente) {
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = "Mes siguiente")
        }
    }
}

@Composable
private fun FilaPersona(nombre: String, detalle: String, final: @Composable () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        AvatarIniciales(nombre, tamano = 40.dp)
        Spacer(Modifier.width(Espacio.m))
        Column(Modifier.weight(1f)) {
            Text(nombre, style = MaterialTheme.typography.titleSmall, color = DocenCheckTema.colores.texto, maxLines = 1)
            Text(detalle, style = MaterialTheme.typography.bodySmall, color = DocenCheckTema.colores.textoSecundario)
        }
        final()
    }
}
