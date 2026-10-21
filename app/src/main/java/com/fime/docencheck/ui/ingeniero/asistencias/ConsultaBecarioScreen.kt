package com.fime.docencheck.ui.ingeniero.asistencias

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Login
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Business
import androidx.compose.material.icons.rounded.EditCalendar
import androidx.compose.material.icons.rounded.EventBusy
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.ContenedorRefrescable
import com.fime.docencheck.core.ui.DialogoConfirmacion
import com.fime.docencheck.core.ui.EsqueletoLista
import com.fime.docencheck.core.ui.EstadoError
import com.fime.docencheck.core.ui.EstadoVacio
import com.fime.docencheck.core.ui.RecargarAlReanudar
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.ui.rememberAvisos
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.data.model.AsistenciaUi
import com.fime.docencheck.data.model.ModalidadTrabajo
import com.fime.docencheck.data.model.TipoAsistencia
import com.fime.docencheck.ui.becario.consulta.FiltrosFecha
import com.fime.docencheck.ui.becario.consulta.asistenciasPorDia
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.SegmentadoControl
import com.fime.docencheck.ui.theme.SelectorFecha
import com.fime.docencheck.ui.theme.SelectorHora
import com.fime.docencheck.ui.theme.etiqueta
import java.time.LocalDate
import java.time.LocalTime

@Composable
fun ConsultaBecarioScreen(becarioId: String, onVolver: () -> Unit) {
    val app = appActual()
    val viewModel: ConsultaBecarioViewModel = viewModel(
        factory = viewModelFactory {
            initializer {
                ConsultaBecarioViewModel(becarioId, app.asistenciaRepository, app.equipoRepository, app.sessionManager)
            }
        }
    )
    RecargarAlReanudar(viewModel::recargar)
    val estado by viewModel.estado.collectAsState()
    val nombre by viewModel.nombreBecario.collectAsState()
    val filtro by viewModel.filtro.collectAsState()
    val tipo by viewModel.tipoFiltro.collectAsState()
    val guardando by viewModel.guardando.collectAsState()
    val avisos = rememberAvisos(viewModel.avisos)

    var formulario by rememberSaveable { mutableStateOf(false) }
    var aEliminar by androidx.compose.runtime.remember { mutableStateOf<AsistenciaUi?>(null) }

    aEliminar?.let { item ->
        val a = item.asistencia
        DialogoConfirmacion(
            titulo = "Eliminar registro",
            mensaje = "Se eliminará la ${a.tipo.etiqueta().lowercase()} del ${FechaUi.fechaHora(a.ocurrido_en)}. " +
                "Las horas del becario se recalcularán. Esta acción no se puede deshacer.",
            textoConfirmar = "Eliminar",
            destructivo = true,
            onConfirmar = {
                a.id?.let(viewModel::eliminarRegistro)
                aEliminar = null
            },
            onCancelar = { aEliminar = null }
        )
    }

    if (formulario) {
        DialogoRegistroManual(
            guardando = guardando,
            onGuardar = { t, fecha, hora, modalidad ->
                val instante = fecha.atTime(hora).atZone(FechaUi.ZONA).toInstant()
                viewModel.agregarRegistroManual(t, instante, modalidad)
                formulario = false
            },
            onCancelar = { formulario = false }
        )
    }

    PantallaConEncabezado(
        titulo = "Asistencias",
        subtitulo = nombre ?: "Becario",
        onVolver = onVolver,
        snackbarHostState = avisos,
        botonFlotante = {
            ExtendedFloatingActionButton(
                onClick = { formulario = true },
                icon = { Icon(Icons.Rounded.Add, contentDescription = null) },
                text = { Text("Agregar registro") },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                expanded = true
            )
        }
    ) { padding ->
        ContenedorRefrescable(onRefrescar = viewModel::recargar, marcaDatos = estado, modifier = Modifier.padding(padding)) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = Espacio.pantalla, end = Espacio.pantalla, top = Espacio.pantalla, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(Espacio.s)
            ) {
                item(key = "filtros") {
                    FiltrosFecha(
                        filtro = filtro,
                        onSemanaActual = viewModel::filtrarSemanaActual,
                        onSemanaPasada = null,
                        onRango = viewModel::filtrarPorRango,
                        onLimpiar = viewModel::limpiarFiltros
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
                    Text(
                        "¿Olvidó registrar la salida? Agrégala con \"Agregar registro\". Para borrar un registro equivocado usa el ícono de basura.",
                        style = MaterialTheme.typography.bodySmall,
                        color = DocenCheckTema.colores.textoSecundario,
                        modifier = Modifier.padding(top = Espacio.s)
                    )
                }
                when (val actual = estado) {
                    is UiState.Cargando -> item { EsqueletoLista(relleno = PaddingValues(0.dp)) }
                    is UiState.Error -> item { EstadoError(actual.mensaje, viewModel::recargar) }
                    is UiState.Listo -> if (actual.datos.isEmpty()) {
                        item { EstadoVacio("Sin asistencias en este rango", mensaje = "Prueba con otras fechas.", icono = Icons.Rounded.EventBusy) }
                    } else {
                        asistenciasPorDia(actual.datos, onEliminar = { if (!guardando) aEliminar = it })
                    }
                }
            }
        }
    }
}

/**
 * Formulario de corrección (C-04): tipo, fecha, hora y modalidad, con validación
 * en línea (no se permiten registros en el futuro).
 */
@Composable
private fun DialogoRegistroManual(
    guardando: Boolean,
    onGuardar: (TipoAsistencia, LocalDate, LocalTime, ModalidadTrabajo) -> Unit,
    onCancelar: () -> Unit
) {
    var tipo by rememberSaveable { mutableStateOf(TipoAsistencia.salida) }
    var fecha by rememberSaveable { mutableStateOf(FechaUi.hoy()) }
    var hora by rememberSaveable { mutableStateOf<LocalTime?>(null) }
    var modalidad by rememberSaveable { mutableStateOf(ModalidadTrabajo.presencial) }
    var intento by rememberSaveable { mutableStateOf(false) }

    val ahora = java.time.ZonedDateTime.now(FechaUi.ZONA)
    val errorHora = when {
        hora == null -> if (intento) "Elige la hora" else null
        fecha == ahora.toLocalDate() && hora!!.isAfter(ahora.toLocalTime()) -> "La hora no puede ser posterior a ahora"
        else -> null
    }

    DialogoConfirmacion(
        titulo = "Agregar registro",
        mensaje = "Quedará marcado como registro manual hecho por ti.",
        icono = Icons.Rounded.EditCalendar,
        textoConfirmar = if (guardando) "Guardando…" else "Guardar",
        confirmarHabilitado = !guardando,
        onConfirmar = {
            intento = true
            val h = hora
            if (h != null && errorHora == null) onGuardar(tipo, fecha, h, modalidad)
        },
        onCancelar = onCancelar,
        contenidoExtra = {
            Column(verticalArrangement = Arrangement.spacedBy(Espacio.m)) {
                SegmentadoControl(
                    opciones = listOf("Entrada", "Salida"),
                    seleccionado = if (tipo == TipoAsistencia.entrada) 0 else 1,
                    onSeleccionar = { tipo = if (it == 0) TipoAsistencia.entrada else TipoAsistencia.salida },
                    iconos = listOf(Icons.AutoMirrored.Rounded.Login, Icons.AutoMirrored.Rounded.Logout)
                )
                SelectorFecha(etiqueta = "Fecha", fecha = fecha, onFecha = { fecha = it }, fechaMaxima = FechaUi.hoy())
                SelectorHora(etiqueta = "Hora", hora = hora, onHora = { hora = it }, error = errorHora)
                SegmentadoControl(
                    opciones = listOf("Presencial", "Home office"),
                    seleccionado = if (modalidad == ModalidadTrabajo.presencial) 0 else 1,
                    onSeleccionar = { modalidad = if (it == 0) ModalidadTrabajo.presencial else ModalidadTrabajo.home_office },
                    iconos = listOf(Icons.Rounded.Business, Icons.Rounded.Home)
                )
            }
        }
    )
}
