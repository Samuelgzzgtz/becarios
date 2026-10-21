package com.fime.docencheck.ui.admin.usuarios

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Engineering
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.School
import androidx.compose.material.icons.rounded.SupervisorAccount
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.Aviso
import com.fime.docencheck.core.ui.ContenedorRefrescable
import com.fime.docencheck.core.ui.EsqueletoLista
import com.fime.docencheck.core.ui.EstadoError
import com.fime.docencheck.core.ui.EstadoVacio
import com.fime.docencheck.core.ui.RecargarAlReanudar
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.ui.rememberAvisos
import com.fime.docencheck.core.util.FormatoUi
import com.fime.docencheck.data.model.EstadoUsuario
import com.fime.docencheck.data.model.Perfil
import com.fime.docencheck.data.model.Usuario
import com.fime.docencheck.ui.theme.BadgeEstado
import com.fime.docencheck.ui.theme.BotonSecundario
import com.fime.docencheck.ui.theme.CampoBusqueda
import com.fime.docencheck.ui.theme.Desplegable
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TonoEstado
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

/** Opciones del filtro por ingeniero. */
private sealed interface FiltroIngeniero {
    data object Todos : FiltroIngeniero
    data object SinAsignar : FiltroIngeniero
    data class De(val ingeniero: Usuario) : FiltroIngeniero
}

private fun FiltroIngeniero.texto() = when (this) {
    FiltroIngeniero.Todos -> "Todos los ingenieros"
    FiltroIngeniero.SinAsignar -> "Sin asignar"
    is FiltroIngeniero.De -> ingeniero.nombre
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BecariosScreen(
    onVolver: (() -> Unit)?,
    onNuevo: () -> Unit,
    onAsignar: (String) -> Unit,
    avisosExternos: Flow<Aviso> = emptyFlow()
) {
    val app = appActual()
    val viewModel: ListaUsuariosViewModel = viewModel(
        factory = viewModelFactory { initializer { ListaUsuariosViewModel(Perfil.becario, app.adminRepository) } }
    )
    val asignacionesVm: AsignacionesViewModel = viewModel(
        factory = viewModelFactory { initializer { AsignacionesViewModel(app.adminRepository, app.progresoRepository) } }
    )
    val recargar = {
        viewModel.cargar()
        asignacionesVm.cargar()
    }
    RecargarAlReanudar(recargar)
    val estado by viewModel.estado.collectAsState()
    val filtro by viewModel.filtroEstado.collectAsState()
    val procesando by viewModel.procesando.collectAsState()
    val cambio by viewModel.cambioPendiente.collectAsState()
    val asignaciones by asignacionesVm.asignaciones.collectAsState()
    val avisos = rememberAvisos(viewModel.avisos, avisosExternos)

    var busqueda by rememberSaveable { mutableStateOf("") }
    var filtroIng by remember { mutableStateOf<FiltroIngeniero>(FiltroIngeniero.Todos) }
    var editando by remember { mutableStateOf<Usuario?>(null) }

    DialogoCambioEstado(cambio, viewModel::confirmarCambio, viewModel::cancelarCambio)
    editando?.let { u ->
        DialogoEditarUsuario(
            usuario = u,
            onGuardar = { n, m, c -> viewModel.editar(u, n, m, c); editando = null },
            onCancelar = { editando = null }
        )
    }

    PantallaConEncabezado(
        titulo = "Becarios",
        subtitulo = (estado as? UiState.Listo)?.datos?.let { FormatoUi.plural(it.size, "becario", "becarios") },
        onVolver = onVolver,
        snackbarHostState = avisos,
        botonFlotante = {
            ExtendedFloatingActionButton(
                onClick = onNuevo,
                icon = { Icon(Icons.Rounded.PersonAdd, contentDescription = null) },
                text = { Text("Nuevo becario") },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            )
        }
    ) { padding ->
        ContenedorRefrescable(onRefrescar = recargar, marcaDatos = estado, modifier = Modifier.padding(padding)) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = Espacio.pantalla, end = Espacio.pantalla, top = Espacio.pantalla, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
            ) {
                item(key = "filtros") {
                    CampoBusqueda(busqueda, { busqueda = it }, "Buscar por nombre o matrícula")
                    Spacer(Modifier.size(Espacio.m))
                    FiltroEstadoUsuarios(filtro, viewModel::filtrarPorEstado)
                    if (asignaciones.ingenieros.isNotEmpty()) {
                        Desplegable(
                            etiqueta = "Ingeniero asesor",
                            opciones = listOf<FiltroIngeniero>(FiltroIngeniero.Todos, FiltroIngeniero.SinAsignar) +
                                asignaciones.ingenieros.map { FiltroIngeniero.De(it) },
                            seleccionado = filtroIng,
                            textoDe = { it.texto() },
                            onSeleccionar = { filtroIng = it },
                            icono = Icons.Rounded.Engineering,
                            modifier = Modifier.padding(top = Espacio.m)
                        )
                    }
                }
                when (val actual = estado) {
                    is UiState.Cargando -> item { EsqueletoLista(relleno = PaddingValues(0.dp)) }
                    is UiState.Error -> item { EstadoError(actual.mensaje, viewModel::cargar) }
                    is UiState.Listo -> {
                        val lista = actual.datos.filter { b ->
                            (busqueda.isBlank() || b.nombre.contains(busqueda, true) || b.matricula.contains(busqueda, true)) &&
                                when (val f = filtroIng) {
                                    FiltroIngeniero.Todos -> true
                                    FiltroIngeniero.SinAsignar -> b.estado == EstadoUsuario.activo && asignaciones.conocida && asignaciones.ingenieroDe[b.id] == null
                                    is FiltroIngeniero.De -> asignaciones.ingenieroDe[b.id] == f.ingeniero.id
                                }
                        }
                        if (lista.isEmpty()) {
                            item {
                                EstadoVacio(
                                    titulo = if (actual.datos.isEmpty()) "No hay becarios en esta lista" else "Sin coincidencias",
                                    mensaje = if (actual.datos.isEmpty()) "Da de alta un becario con \"Nuevo becario\"." else "Prueba con otro filtro o búsqueda.",
                                    icono = Icons.Rounded.School
                                )
                            }
                        }
                        items(lista, key = { it.id }) { becario ->
                            val activo = becario.estado == EstadoUsuario.activo
                            val ingeniero = asignaciones.nombreIngeniero(becario.id)
                            Tarjeta(Modifier.fillMaxWidth()) {
                                EncabezadoUsuario(becario)
                                if (activo && asignaciones.conocida) {
                                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = Espacio.m)) {
                                        Icon(Icons.Rounded.Engineering, contentDescription = null, tint = DocenCheckTema.colores.textoSecundario, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(Espacio.s))
                                        if (ingeniero != null) {
                                            Text("Ingeniero: $ingeniero", style = MaterialTheme.typography.bodyMedium, color = DocenCheckTema.colores.texto)
                                        } else {
                                            BadgeEstado("Sin asignar", TonoEstado.ALERTA)
                                        }
                                    }
                                }
                                FlowRow(
                                    Modifier.fillMaxWidth().padding(top = Espacio.m),
                                    horizontalArrangement = Arrangement.spacedBy(Espacio.s),
                                    verticalArrangement = Arrangement.spacedBy(Espacio.s)
                                ) {
                                    if (activo) {
                                        BotonSecundario(if (ingeniero == null) "Asignar" else "Reasignar", { onAsignar(becario.id) }, icono = Icons.Rounded.SupervisorAccount)
                                    }
                                    BotonSecundario("Editar", { editando = becario }, habilitado = becario.id !in procesando, icono = Icons.Rounded.Edit)
                                    BotonCambioEstado(
                                        usuario = becario,
                                        ocupado = becario.id in procesando,
                                        onBaja = { viewModel.pedirBaja(becario) },
                                        onReactivar = { viewModel.pedirReactivar(becario) }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
