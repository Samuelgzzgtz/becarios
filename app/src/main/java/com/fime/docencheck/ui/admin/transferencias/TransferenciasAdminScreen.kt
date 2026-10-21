package com.fime.docencheck.ui.admin.transferencias

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
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
import com.fime.docencheck.core.util.FormatoUi
import com.fime.docencheck.ui.ingeniero.transferencia.TarjetaTransferencia
import com.fime.docencheck.ui.theme.BotonDestructivo
import com.fime.docencheck.ui.theme.BotonPrimario
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.PantallaConEncabezado

@Composable
fun TransferenciasAdminScreen(onVolver: (() -> Unit)? = null) {
    val app = appActual()
    val viewModel: TransferenciasAdminViewModel = viewModel(
        factory = viewModelFactory { initializer { TransferenciasAdminViewModel(app.sessionManager, app.adminRepository) } }
    )
    RecargarAlReanudar(viewModel::cargar)
    val estado by viewModel.estado.collectAsState()
    val procesando by viewModel.procesando.collectAsState()
    val confirmacion by viewModel.confirmacion.collectAsState()
    val avisos = rememberAvisos(viewModel.avisos)

    confirmacion?.let { pendiente ->
        val becario = pendiente.detalle.becario?.nombre ?: "este becario"
        val origen = pendiente.detalle.origen?.nombre ?: "su ingeniero actual"
        val destino = pendiente.detalle.destino?.nombre ?: "el ingeniero destino"
        DialogoConfirmacion(
            titulo = if (pendiente.aprobar) "Aprobar traspaso" else "Rechazar traspaso",
            mensaje = if (pendiente.aprobar) "$becario pasará de $origen a $destino."
            else "Se rechazará la solicitud para mover a $becario de $origen a $destino.",
            icono = if (pendiente.aprobar) Icons.Rounded.SwapHoriz else null,
            textoConfirmar = if (pendiente.aprobar) "Aprobar" else "Rechazar",
            destructivo = !pendiente.aprobar,
            onConfirmar = viewModel::confirmarResolver,
            onCancelar = viewModel::cancelarResolver
        )
    }

    PantallaConEncabezado(
        titulo = "Traspasos",
        subtitulo = (estado as? UiState.Listo)?.datos?.let {
            if (it.isEmpty()) "Sin solicitudes pendientes" else FormatoUi.plural(it.size, "solicitud pendiente", "solicitudes pendientes")
        } ?: "Solicitudes de cambio de ingeniero",
        etiqueta = "Administrador",
        onVolver = onVolver,
        snackbarHostState = avisos
    ) { padding ->
        ContenedorRefrescable(onRefrescar = viewModel::cargar, marcaDatos = estado, modifier = Modifier.padding(padding)) {
            ContenidoSegunEstado(estado, viewModel::cargar) { lista ->
                if (lista.isEmpty()) {
                    Column(Modifier.fillMaxSize()) {
                        EstadoVacio(
                            "Todo al día",
                            mensaje = "No hay traspasos pendientes. Cuando un ingeniero pida mover a un becario, aparecerá aquí.",
                            icono = Icons.Rounded.SwapHoriz
                        )
                    }
                } else {
                    LazyColumn(
                        Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(Espacio.pantalla),
                        verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
                    ) {
                        items(lista, key = { it.transferencia.id ?: it.hashCode().toString() }) { detalle ->
                            val ocupado = detalle.transferencia.id?.let { it in procesando } == true
                            TarjetaTransferencia(detalle) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Espacio.s)) {
                                    BotonDestructivo(
                                        "Rechazar",
                                        { viewModel.pedirResolver(detalle, false) },
                                        habilitado = !ocupado,
                                        icono = Icons.Rounded.Close,
                                        relleno = false,
                                        modifier = Modifier.weight(1f)
                                    )
                                    BotonPrimario(
                                        "Aprobar",
                                        { viewModel.pedirResolver(detalle, true) },
                                        cargando = ocupado,
                                        icono = Icons.Rounded.Check,
                                        modifier = Modifier.weight(1f)
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
