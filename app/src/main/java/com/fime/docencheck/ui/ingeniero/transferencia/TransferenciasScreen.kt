package com.fime.docencheck.ui.ingeniero.transferencia

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.ContenedorRefrescable
import com.fime.docencheck.core.ui.ContenidoSegunEstado
import com.fime.docencheck.core.ui.EstadoVacio
import com.fime.docencheck.core.ui.RecargarAlReanudar
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.data.model.TransferenciaDetalle
import com.fime.docencheck.ui.theme.AvatarIniciales
import com.fime.docencheck.ui.theme.BadgeEstado
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.etiqueta
import com.fime.docencheck.ui.theme.tono

@Composable
fun TransferenciasScreen(onVolver: () -> Unit, onIrABecarios: (() -> Unit)? = null) {
    val app = appActual()
    val viewModel: TransferenciasViewModel = viewModel(
        factory = viewModelFactory {
            initializer { TransferenciasViewModel(app.sessionManager, app.transferenciaRepository) }
        }
    )
    RecargarAlReanudar(viewModel::cargar)
    val estado by viewModel.estado.collectAsState()

    PantallaConEncabezado(titulo = "Mis transferencias", subtitulo = "Solicitudes de cambio de ingeniero", onVolver = onVolver) { padding ->
        ContenedorRefrescable(onRefrescar = viewModel::cargar, marcaDatos = estado, modifier = Modifier.padding(padding)) {
            ContenidoSegunEstado(estado, viewModel::cargar) { lista ->
                if (lista.isEmpty()) {
                    Column(Modifier.fillMaxSize().padding(Espacio.pantalla)) {
                        EstadoVacio(
                            titulo = "No has pedido transferencias",
                            mensaje = "Para transferir a un becario, entra a Becarios y usa \"Transferir\" en su tarjeta.",
                            icono = Icons.Rounded.SwapHoriz,
                            textoAccion = onIrABecarios?.let { "Ir a Becarios" },
                            onAccion = onIrABecarios
                        )
                    }
                } else {
                    LazyColumn(
                        Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(Espacio.pantalla),
                        verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
                    ) {
                        items(lista, key = { it.transferencia.id ?: it.hashCode().toString() }) { TarjetaTransferencia(it) }
                    }
                }
            }
        }
    }
}

/** Tarjeta de transferencia: becario, "De → A", motivo, fecha y estado. Se reutiliza en el admin. */
@Composable
fun TarjetaTransferencia(detalle: TransferenciaDetalle, acciones: (@Composable () -> Unit)? = null) {
    val t = detalle.transferencia
    val c = DocenCheckTema.colores
    Tarjeta(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AvatarIniciales(detalle.becario?.nombre ?: "?", tamano = 40.dp)
            Spacer(Modifier.width(Espacio.m))
            Column(Modifier.weight(1f)) {
                Text(detalle.becario?.nombre ?: "Becario", style = MaterialTheme.typography.titleSmall, color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
                detalle.becario?.matricula?.let { Text("Matrícula $it", style = MaterialTheme.typography.bodySmall, color = c.textoSecundario) }
            }
            BadgeEstado(t.estado.etiqueta(), t.estado.tono())
        }
        Row(
            Modifier.fillMaxWidth().padding(top = Espacio.m),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text("De", style = MaterialTheme.typography.labelSmall, color = c.textoSecundario)
                Text(detalle.origen?.nombre ?: "—", style = MaterialTheme.typography.bodyMedium, color = c.texto, maxLines = 2)
            }
            Icon(Icons.AutoMirrored.Rounded.ArrowForward, contentDescription = "hacia", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(horizontal = Espacio.s))
            Column(Modifier.weight(1f)) {
                Text("A", style = MaterialTheme.typography.labelSmall, color = c.textoSecundario)
                Text(detalle.destino?.nombre ?: "—", style = MaterialTheme.typography.bodyMedium, color = c.texto, maxLines = 2)
            }
        }
        Text(
            "“${t.motivo}”",
            style = MaterialTheme.typography.bodyMedium,
            color = c.texto,
            modifier = Modifier.padding(top = Espacio.m)
        )
        t.created_at?.let {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = Espacio.s)) {
                Icon(Icons.Rounded.Schedule, contentDescription = null, tint = c.textoSecundario, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(Espacio.xs))
                Text("Solicitada el ${FechaUi.fechaHora(it)}", style = MaterialTheme.typography.bodySmall, color = c.textoSecundario)
            }
        }
        acciones?.let {
            Spacer(Modifier.size(Espacio.m))
            it()
        }
    }
}
