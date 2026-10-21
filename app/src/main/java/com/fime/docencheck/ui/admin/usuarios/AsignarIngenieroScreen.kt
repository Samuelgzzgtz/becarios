package com.fime.docencheck.ui.admin.usuarios

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Engineering
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.ContenidoSegunEstado
import com.fime.docencheck.core.ui.DialogoConfirmacion
import com.fime.docencheck.core.ui.EstadoVacio
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.ui.theme.AvatarIniciales
import com.fime.docencheck.ui.theme.AvisoBanner
import com.fime.docencheck.ui.theme.BadgeEstado
import com.fime.docencheck.ui.theme.BotonPrimario
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.EncabezadoSeccion
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TonoEstado

@Composable
fun AsignarIngenieroScreen(
    becarioId: String,
    onVolver: () -> Unit,
    /** Al guardar: regresa con un aviso (B-07). */
    onAsignado: (String) -> Unit = { onVolver() }
) {
    val app = appActual()
    val viewModel: AsignarIngenieroViewModel = viewModel(
        factory = viewModelFactory { initializer { AsignarIngenieroViewModel(becarioId, app.adminRepository, app.equipoRepository) } }
    )
    val estado by viewModel.estado.collectAsState()
    val nombreBecario by viewModel.nombreBecario.collectAsState()
    val datos = (estado as? UiState.Listo)?.datos

    LaunchedEffect(datos?.guardado) {
        if (datos?.guardado == true) onAsignado("${nombreBecario ?: "Becario"} asignado a ${datos.seleccionado?.nombre ?: "el ingeniero elegido"}")
    }

    if (datos?.confirmando == true) {
        DialogoConfirmacion(
            titulo = "Cambiar de ingeniero",
            mensaje = "${nombreBecario ?: "El becario"} dejará de estar con ${datos.actual?.nombre ?: "su ingeniero actual"} y pasará a " +
                "${datos.seleccionado?.nombre ?: "el ingeniero elegido"}. Las transferencias pendientes de este becario se rechazarán.",
            textoConfirmar = "Reasignar",
            destructivo = true,
            onConfirmar = viewModel::confirmar,
            onCancelar = viewModel::cancelar
        )
    }

    PantallaConEncabezado(
        titulo = "Asignar ingeniero",
        subtitulo = nombreBecario?.let { "Becario: $it" },
        onVolver = onVolver,
        barraAccion = datos?.takeIf { it.ingenieros.isNotEmpty() }?.let { d ->
            {
                BotonPrimario(
                    texto = if (d.actualId == null) "Asignar" else "Guardar cambio",
                    onClick = viewModel::guardar,
                    habilitado = d.puedeGuardar,
                    cargando = d.guardando,
                    icono = Icons.Rounded.Save,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    ) { padding ->
        ContenidoSegunEstado(estado, viewModel::cargar, modifier = Modifier.padding(padding)) { d ->
            LazyColumn(
                Modifier.fillMaxSize().selectableGroup(),
                contentPadding = PaddingValues(Espacio.pantalla),
                verticalArrangement = Arrangement.spacedBy(Espacio.s)
            ) {
                item(key = "actual") {
                    Tarjeta(Modifier.fillMaxWidth()) {
                        Text("Asignado actualmente", style = MaterialTheme.typography.bodySmall, color = DocenCheckTema.colores.textoSecundario)
                        Text(
                            d.actual?.nombre ?: "Sin ingeniero",
                            style = MaterialTheme.typography.titleMedium,
                            color = if (d.actual != null) DocenCheckTema.colores.texto else DocenCheckTema.colores.alerta
                        )
                    }
                    EncabezadoSeccion("Elige un ingeniero", modifier = Modifier.padding(top = Espacio.m))
                }
                if (d.ingenieros.isEmpty()) {
                    item { EstadoVacio("No hay ingenieros activos", mensaje = "Da de alta un ingeniero primero.", icono = Icons.Rounded.Engineering) }
                }
                items(d.ingenieros, key = { it.id }) { ingeniero ->
                    val elegido = ingeniero.id == d.seleccionadoId
                    Tarjeta(
                        Modifier
                            .fillMaxWidth()
                            .selectable(selected = elegido, role = Role.RadioButton, onClick = { viewModel.seleccionar(ingeniero.id) }),
                        relleno = PaddingValues(horizontal = Espacio.m, vertical = Espacio.s),
                        colorFondo = if (elegido) MaterialTheme.colorScheme.primaryContainer else DocenCheckTema.colores.superficie
                    ) {
                        Row(Modifier.heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = elegido, onClick = null)
                            Spacer(Modifier.width(Espacio.s))
                            AvatarIniciales(ingeniero.nombre, tamano = 36.dp)
                            Spacer(Modifier.width(Espacio.m))
                            androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
                                Text(ingeniero.nombre, style = MaterialTheme.typography.titleSmall, color = DocenCheckTema.colores.texto)
                                ingeniero.coordinacion?.let {
                                    Text(it, style = MaterialTheme.typography.bodySmall, color = DocenCheckTema.colores.textoSecundario)
                                }
                            }
                            if (ingeniero.id == d.actualId) BadgeEstado("Actual", TonoEstado.EXITO)
                        }
                    }
                }
                d.error?.let { item { AvisoBanner(it, TonoEstado.PELIGRO, icono = Icons.Rounded.ErrorOutline) } }
            }
        }
    }
}
