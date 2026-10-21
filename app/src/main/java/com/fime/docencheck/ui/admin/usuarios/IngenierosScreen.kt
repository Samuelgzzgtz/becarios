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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Apartment
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Engineering
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.PersonAdd
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
import com.fime.docencheck.data.model.Perfil
import com.fime.docencheck.data.model.Usuario
import com.fime.docencheck.ui.theme.BadgeEstado
import com.fime.docencheck.ui.theme.BotonSecundario
import com.fime.docencheck.ui.theme.CampoBusqueda
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TonoEstado
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun IngenierosScreen(onVolver: (() -> Unit)?, onNuevo: () -> Unit, avisosExternos: Flow<Aviso> = emptyFlow()) {
    val app = appActual()
    val viewModel: ListaUsuariosViewModel = viewModel(
        factory = viewModelFactory { initializer { ListaUsuariosViewModel(Perfil.ingeniero, app.adminRepository) } }
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
    var editando by remember { mutableStateOf<Usuario?>(null) }

    DialogoCambioEstado(cambio, viewModel::confirmarCambio, viewModel::cancelarCambio)
    editando?.let { u ->
        DialogoEditarUsuario(u, onGuardar = { n, m, c -> viewModel.editar(u, n, m, c); editando = null }, onCancelar = { editando = null })
    }

    PantallaConEncabezado(
        titulo = "Ingenieros",
        subtitulo = (estado as? UiState.Listo)?.datos?.let { FormatoUi.plural(it.size, "ingeniero", "ingenieros") },
        onVolver = onVolver,
        snackbarHostState = avisos,
        botonFlotante = {
            ExtendedFloatingActionButton(
                onClick = onNuevo,
                icon = { Icon(Icons.Rounded.PersonAdd, contentDescription = null) },
                text = { Text("Nuevo ingeniero") },
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
                    CampoBusqueda(busqueda, { busqueda = it }, "Buscar por nombre o número")
                    Spacer(Modifier.size(Espacio.m))
                    FiltroEstadoUsuarios(filtro, viewModel::filtrarPorEstado)
                }
                when (val actual = estado) {
                    is UiState.Cargando -> item { EsqueletoLista(relleno = PaddingValues(0.dp)) }
                    is UiState.Error -> item { EstadoError(actual.mensaje, viewModel::cargar) }
                    is UiState.Listo -> {
                        val lista = actual.datos.filter { busqueda.isBlank() || it.nombre.contains(busqueda, true) || it.matricula.contains(busqueda, true) }
                        if (lista.isEmpty()) {
                            item { EstadoVacio(if (actual.datos.isEmpty()) "No hay ingenieros en esta lista" else "Sin coincidencias", icono = Icons.Rounded.Engineering) }
                        }
                        items(lista, key = { it.id }) { ingeniero ->
                            Tarjeta(Modifier.fillMaxWidth()) {
                                EncabezadoUsuario(ingeniero, detalle = "No. ${ingeniero.matricula}")
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = Espacio.m)) {
                                    ingeniero.coordinacion?.let {
                                        Icon(Icons.Rounded.Apartment, contentDescription = null, tint = DocenCheckTema.colores.textoSecundario, modifier = Modifier.size(18.dp))
                                        Text(" $it", style = MaterialTheme.typography.bodyMedium, color = DocenCheckTema.colores.texto, modifier = Modifier.weight(1f))
                                    } ?: Spacer(Modifier.weight(1f))
                                    if (asignaciones.conocida) {
                                        BadgeEstado(
                                            FormatoUi.plural(asignaciones.becariosDe(ingeniero.id), "becario", "becarios"),
                                            TonoEstado.INFO,
                                            icono = Icons.Rounded.Groups
                                        )
                                    }
                                }
                                FlowRow(
                                    Modifier.fillMaxWidth().padding(top = Espacio.m),
                                    horizontalArrangement = Arrangement.spacedBy(Espacio.s),
                                    verticalArrangement = Arrangement.spacedBy(Espacio.s)
                                ) {
                                    BotonSecundario("Editar", { editando = ingeniero }, habilitado = ingeniero.id !in procesando, icono = Icons.Rounded.Edit)
                                    BotonCambioEstado(
                                        usuario = ingeniero,
                                        ocupado = ingeniero.id in procesando,
                                        onBaja = { viewModel.pedirBaja(ingeniero) },
                                        onReactivar = { viewModel.pedirReactivar(ingeniero) }
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
