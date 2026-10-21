package com.fime.docencheck.ui.ingeniero.asistencias

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.EventBusy
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.ContenedorRefrescable
import com.fime.docencheck.core.ui.EsqueletoLista
import com.fime.docencheck.core.ui.EstadoError
import com.fime.docencheck.core.ui.EstadoVacio
import com.fime.docencheck.core.ui.RecargarAlReanudar
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.util.FormatoUi
import com.fime.docencheck.data.model.TipoAsistencia
import com.fime.docencheck.ui.becario.consulta.FiltrosFecha
import com.fime.docencheck.ui.becario.consulta.asistenciasPorDia
import com.fime.docencheck.ui.theme.Desplegable
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.PantallaConEncabezado

/** Selector de becario: null = todo el equipo. */
private val TODO_EL_EQUIPO = BecarioFiltro("", "Todo el equipo", "")

@Composable
fun ConsultaEquipoScreen(onBecario: (String) -> Unit) {
    val app = appActual()
    val viewModel: ConsultaEquipoViewModel = viewModel(
        factory = viewModelFactory {
            initializer { ConsultaEquipoViewModel(app.sessionManager, app.progresoRepository, app.asistenciaRepository) }
        }
    )
    RecargarAlReanudar(viewModel::recargar)
    val estado by viewModel.estado.collectAsState()
    val becarios by viewModel.becarios.collectAsState()
    val becario by viewModel.becario.collectAsState()
    val filtro by viewModel.filtro.collectAsState()
    val tipo by viewModel.tipo.collectAsState()

    PantallaConEncabezado(
        titulo = "Asistencias del equipo",
        subtitulo = (estado as? UiState.Listo)?.datos?.let { FormatoUi.plural(it.size, "registro", "registros") } ?: "Entradas y salidas de tus becarios"
    ) { padding ->
        ContenedorRefrescable(onRefrescar = viewModel::recargar, marcaDatos = estado, modifier = Modifier.padding(padding)) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(Espacio.pantalla),
                verticalArrangement = Arrangement.spacedBy(Espacio.s)
            ) {
                item(key = "filtros") {
                    Desplegable(
                        etiqueta = "Becario",
                        opciones = listOf(TODO_EL_EQUIPO) + becarios,
                        seleccionado = becario ?: TODO_EL_EQUIPO,
                        textoDe = { it.nombre },
                        detalleDe = { it.matricula.ifBlank { null } },
                        onSeleccionar = { viewModel.elegirBecario(it.takeIf { b -> b.id.isNotEmpty() }) },
                        icono = Icons.Rounded.Person
                    )
                    FiltrosFecha(
                        filtro = filtro,
                        onSemanaActual = viewModel::filtrarSemanaActual,
                        onSemanaPasada = viewModel::filtrarSemanaPasada,
                        onRango = viewModel::filtrarPorRango,
                        onLimpiar = null,
                        modifier = Modifier.padding(top = Espacio.m)
                    )
                    val colores = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                        selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = Espacio.xs),
                        horizontalArrangement = Arrangement.spacedBy(Espacio.s)
                    ) {
                        FilterChip(selected = tipo == null, onClick = { viewModel.filtrarPorTipo(null) }, label = { Text("Todos") }, colors = colores)
                        FilterChip(selected = tipo == TipoAsistencia.entrada, onClick = { viewModel.filtrarPorTipo(TipoAsistencia.entrada) }, label = { Text("Entradas") }, colors = colores)
                        FilterChip(selected = tipo == TipoAsistencia.salida, onClick = { viewModel.filtrarPorTipo(TipoAsistencia.salida) }, label = { Text("Salidas") }, colors = colores)
                    }
                }
                when (val actual = estado) {
                    is UiState.Cargando -> item { EsqueletoLista(relleno = PaddingValues(0.dp)) }
                    is UiState.Error -> item { EstadoError(actual.mensaje, viewModel::recargar) }
                    is UiState.Listo -> if (actual.datos.isEmpty()) {
                        item {
                            EstadoVacio(
                                titulo = if (becarios.isEmpty()) "Aún no tienes becarios" else "Sin registros en este rango",
                                mensaje = if (becarios.isEmpty()) "Cuando la coordinación te asigne becarios verás aquí sus asistencias." else "Prueba con otras fechas o con otro becario.",
                                icono = Icons.Rounded.EventBusy
                            )
                        }
                    } else {
                        asistenciasPorDia(
                            actual.datos,
                            nombreDe = { viewModel.nombreDe(it.asistencia.becario_id) },
                            agruparPorBecario = true
                        )
                        if (becario != null) {
                            item {
                                com.fime.docencheck.ui.theme.BotonSecundario(
                                    texto = "Corregir registros de ${FormatoUi.primerNombre(becario!!.nombre)}",
                                    onClick = { onBecario(becario!!.id) },
                                    modifier = Modifier.fillMaxWidth().padding(top = Espacio.s)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
