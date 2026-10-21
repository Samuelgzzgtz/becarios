package com.fime.docencheck.ui.admin.reportes

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.selection.triStateToggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Draw
import androidx.compose.material.icons.rounded.FactCheck
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.OpenInNew
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TriStateCheckbox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.ContenedorRefrescable
import com.fime.docencheck.core.ui.ContenidoSegunEstado
import com.fime.docencheck.core.ui.DialogoConfirmacion
import com.fime.docencheck.core.ui.EstadoVacio
import com.fime.docencheck.core.ui.RecargarAlReanudar
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.ui.rememberAvisos
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.core.util.FormatoUi
import com.fime.docencheck.ui.ingeniero.siase.SelectorMes
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
import com.fime.docencheck.ui.theme.tono

@Composable
fun ReportesSiaseLoteScreen(onVolver: () -> Unit) {
    val app = appActual()
    val contexto = LocalContext.current
    val viewModel: ReportesSiaseLoteViewModel = viewModel(
        factory = viewModelFactory {
            initializer { ReportesSiaseLoteViewModel(app.sessionManager, app.adminRepository, app.siaseRepository) }
        }
    )
    RecargarAlReanudar(viewModel::cargar)
    val estado by viewModel.estado.collectAsState()
    val url by viewModel.urlParaAbrir.collectAsState()
    val avisos = rememberAvisos(viewModel.avisos)
    var soloPendientes by rememberSaveable { mutableStateOf(false) }
    val datos = (estado as? UiState.Listo)?.datos

    LaunchedEffect(url) {
        val destino = url ?: return@LaunchedEffect
        try { contexto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(destino))) } catch (_: ActivityNotFoundException) {}
        viewModel.urlAbierta()
    }

    if (datos?.confirmando == true) {
        DialogoConfirmacion(
            titulo = "Firmar reportes",
            mensaje = "Se firmarán ${FormatoUi.plural(datos.seleccionados.size, "reporte", "reportes")} de ${datos.mesNombre}.",
            icono = Icons.Rounded.Draw,
            textoConfirmar = "Firmar ${datos.seleccionados.size}",
            onConfirmar = viewModel::confirmarFirma,
            onCancelar = viewModel::cancelarFirma
        )
    }

    PantallaConEncabezado(
        titulo = "Firmas SIASE",
        subtitulo = "Reportes mensuales de todos los becarios",
        onVolver = onVolver,
        snackbarHostState = avisos,
        barraAccion = datos?.takeIf { it.firmables > 0 }?.let { d ->
            {
                BotonPrimario(
                    texto = if (d.seleccionados.isEmpty()) "Selecciona reportes para firmar" else "Firmar ${d.seleccionados.size}",
                    onClick = viewModel::pedirFirma,
                    habilitado = d.seleccionados.isNotEmpty(),
                    cargando = d.firmando,
                    icono = Icons.Rounded.Draw,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            datos?.let { d ->
                SelectorMes(
                    nombre = d.mesNombre,
                    puedeSiguiente = d.mes.isBefore(FechaUi.mesActual()),
                    onAnterior = { viewModel.cambiarMes(-1) },
                    onSiguiente = { viewModel.cambiarMes(1) }
                )
            }
            ContenedorRefrescable(onRefrescar = viewModel::cargar, marcaDatos = estado) {
                ContenidoSegunEstado(estado, viewModel::cargar) { d ->
                    val filas = if (soloPendientes) d.filas.filter { it.firmable } else d.filas
                    LazyColumn(
                        Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = Espacio.pantalla, end = Espacio.pantalla, bottom = Espacio.pantalla),
                        verticalArrangement = Arrangement.spacedBy(Espacio.s)
                    ) {
                        if (d.firmables > 0) {
                            item(key = "banner") {
                                AvisoBanner(
                                    titulo = "Hay ${FormatoUi.plural(d.firmables, "reporte listo", "reportes listos")} para firmar",
                                    texto = "Toca cada fila para seleccionarla o usa \"Seleccionar todos\".",
                                    tono = TonoEstado.EXITO,
                                    icono = Icons.Rounded.FactCheck
                                )
                            }
                        }
                        item(key = "controles") {
                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                if (d.firmables > 0) {
                                    val estadoTodos = when (d.seleccionados.size) {
                                        0 -> ToggleableState.Off
                                        d.firmables -> ToggleableState.On
                                        else -> ToggleableState.Indeterminate
                                    }
                                    Row(
                                        Modifier
                                            .weight(1f)
                                            .heightIn(min = 48.dp)
                                            .triStateToggleable(
                                                state = estadoTodos,
                                                enabled = !d.firmando,
                                                role = Role.Checkbox,
                                                onClick = { viewModel.seleccionarTodos(estadoTodos != ToggleableState.On) }
                                            ),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        TriStateCheckbox(state = estadoTodos, onClick = null)
                                        Spacer(Modifier.width(Espacio.s))
                                        Text("Seleccionar todos (${d.firmables})", style = MaterialTheme.typography.labelLarge, color = DocenCheckTema.colores.texto)
                                    }
                                } else {
                                    Spacer(Modifier.weight(1f))
                                }
                                FilterChip(
                                    selected = soloPendientes,
                                    onClick = { soloPendientes = !soloPendientes },
                                    label = { Text("Solo por firmar") },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                                        selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer
                                    )
                                )
                            }
                        }

                        if (d.anterioresPorFirmar.isNotEmpty()) {
                            item(key = "ant-titulo") { EncabezadoSeccion("Pendientes de meses anteriores", icono = Icons.Rounded.History) }
                            items(d.anterioresPorFirmar.filter { it.reporte.id != null }, key = { "ant-${it.reporte.id}" }) { p ->
                                Tarjeta(Modifier.fillMaxWidth()) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Column(Modifier.weight(1f)) {
                                            Text(p.becario?.nombre ?: "Becario", style = MaterialTheme.typography.titleSmall, color = DocenCheckTema.colores.texto)
                                            Text(FechaUi.parsearMes(p.reporte.mes), style = MaterialTheme.typography.bodySmall, color = DocenCheckTema.colores.textoSecundario)
                                        }
                                        p.reporte.archivo_url?.let { ruta ->
                                            IconButton(onClick = { viewModel.verArchivo(ruta) }) {
                                                Icon(Icons.Rounded.OpenInNew, contentDescription = "Ver reporte de ${p.becario?.nombre ?: "becario"}")
                                            }
                                        }
                                        BotonSecundario("Firmar", { viewModel.firmarAnterior(p.reporte.id.orEmpty()) }, habilitado = !d.firmando, icono = Icons.Rounded.Draw)
                                    }
                                }
                            }
                            item(key = "mes-titulo") { EncabezadoSeccion(d.mesNombre) }
                        }

                        if (filas.isEmpty()) {
                            item {
                                EstadoVacio(
                                    if (soloPendientes) "No hay reportes por firmar" else "No hay becarios activos",
                                    mensaje = if (soloPendientes) "Todo lo entregado en ${d.mesNombre} ya está revisado." else null,
                                    icono = Icons.Rounded.Inbox
                                )
                            }
                        }
                        items(filas, key = { it.fila.becario_id }) { item ->
                            val fila = item.fila
                            Tarjeta(
                                Modifier
                                    .fillMaxWidth()
                                    .then(
                                        if (item.firmable) Modifier.toggleable(
                                            value = item.seleccionado,
                                            enabled = !d.firmando,
                                            role = Role.Checkbox,
                                            onValueChange = { viewModel.alternarSeleccion(fila.becario_id) }
                                        ) else Modifier
                                    ),
                                relleno = PaddingValues(start = Espacio.xs, end = Espacio.xs, top = Espacio.xs, bottom = Espacio.xs),
                                colorFondo = if (item.seleccionado) MaterialTheme.colorScheme.primaryContainer else DocenCheckTema.colores.superficie
                            ) {
                                Row(Modifier.heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Checkbox(checked = item.seleccionado, onCheckedChange = null, enabled = item.firmable, modifier = Modifier.padding(horizontal = Espacio.s))
                                    Column(Modifier.weight(1f)) {
                                        Text(fila.nombre, style = MaterialTheme.typography.titleSmall, color = DocenCheckTema.colores.texto, maxLines = 1)
                                        Text("Matrícula ${fila.matricula}", style = MaterialTheme.typography.bodySmall, color = DocenCheckTema.colores.textoSecundario)
                                    }
                                    BadgeEstado(fila.estado.etiqueta(), fila.estado.tono())
                                    fila.archivo_ruta?.let { ruta ->
                                        IconButton(onClick = { viewModel.verArchivo(ruta) }) {
                                            Icon(Icons.Rounded.OpenInNew, contentDescription = "Ver reporte de ${fila.nombre}")
                                        }
                                    } ?: Spacer(Modifier.width(Espacio.m))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
