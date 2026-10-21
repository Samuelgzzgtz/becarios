package com.fime.docencheck.ui.becario.consulta

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.EventBusy
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
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.PantallaConEncabezado

@Composable
fun ConsultaAsistenciasScreen(onVolver: (() -> Unit)? = null) {
    val app = appActual()
    val viewModel: ConsultaAsistenciasViewModel = viewModel(
        factory = viewModelFactory {
            initializer { ConsultaAsistenciasViewModel(app.sessionManager, app.asistenciaRepository) }
        }
    )
    RecargarAlReanudar(viewModel::recargar)
    val estado by viewModel.estado.collectAsState()
    val filtro by viewModel.filtro.collectAsState()

    val subtitulo = (estado as? UiState.Listo)?.datos?.let { FormatoUi.plural(it.size, "registro", "registros") }
        ?: "Tu historial de entradas y salidas"

    PantallaConEncabezado(titulo = "Mis registros", subtitulo = subtitulo, onVolver = onVolver) { padding ->
        ContenedorRefrescable(onRefrescar = viewModel::recargar, marcaDatos = estado, modifier = Modifier.padding(padding)) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(Espacio.pantalla),
                verticalArrangement = Arrangement.spacedBy(Espacio.s)
            ) {
                item(key = "filtros") {
                    FiltrosFecha(
                        filtro = filtro,
                        onSemanaActual = viewModel::filtrarSemanaActual,
                        onSemanaPasada = viewModel::filtrarSemanaPasada,
                        onRango = viewModel::filtrarPorRango,
                        onLimpiar = viewModel::limpiarFiltro
                    )
                }
                when (val actual = estado) {
                    is UiState.Cargando -> item { EsqueletoLista(relleno = PaddingValues(0.dp)) }
                    is UiState.Error -> item { EstadoError(actual.mensaje, viewModel::recargar) }
                    is UiState.Listo -> if (actual.datos.isEmpty()) {
                        item {
                            EstadoVacio(
                                titulo = "Sin registros en este rango",
                                mensaje = if (filtro != null) "Prueba con otras fechas." else "Cuando registres tu asistencia aparecerá aquí.",
                                icono = Icons.Rounded.EventBusy
                            )
                        }
                    } else {
                        asistenciasPorDia(actual.datos)
                    }
                }
            }
        }
    }
}

