package com.fime.docencheck.ui.ingeniero.transferencia

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Engineering
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.HourglassEmpty
import androidx.compose.material.icons.rounded.Notes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.ContenidoSegunEstado
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.ui.theme.AvisoBanner
import com.fime.docencheck.ui.theme.BotonPrimario
import com.fime.docencheck.ui.theme.CampoTexto
import com.fime.docencheck.ui.theme.Desplegable
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TonoEstado

/** Motivos frecuentes: se elige uno y se puede detallar. */
private val MOTIVOS = listOf("Cambio de horario", "Cambio de área o proyecto", "Carga de trabajo del equipo", "Solicitud del becario", "Otro")

@Composable
fun SolicitarTransferenciaScreen(
    becarioId: String,
    onVolver: () -> Unit,
    /** Al enviar: regresa con un aviso para la pantalla anterior (B-07). */
    onEnviada: (String) -> Unit = { onVolver() }
) {
    val app = appActual()
    val viewModel: SolicitarTransferenciaViewModel = viewModel(
        factory = viewModelFactory {
            initializer {
                SolicitarTransferenciaViewModel(becarioId, app.sessionManager, app.equipoRepository, app.transferenciaRepository)
            }
        }
    )
    val estado by viewModel.estado.collectAsState()
    val becario = (estado as? UiState.Listo)?.datos?.becario
    val foco = LocalFocusManager.current
    var motivoBase by rememberSaveable { mutableStateOf<String?>(null) }
    var detalles by rememberSaveable { mutableStateOf("") }
    var intento by rememberSaveable { mutableStateOf(false) }

    // El motivo que recibe el ViewModel = motivo elegido + detalles opcionales.
    fun actualizarMotivo() {
        val texto = listOfNotNull(motivoBase, detalles.trim().ifBlank { null }).joinToString(": ")
        viewModel.cambiarMotivo(texto)
    }

    val formulario = (estado as? UiState.Listo)?.datos
    LaunchedEffect(formulario?.enviada) {
        if (formulario?.enviada == true) {
            onEnviada("Solicitud enviada; la coordinación la revisará")
        }
    }

    PantallaConEncabezado(
        titulo = "Solicitar transferencia",
        subtitulo = becario?.let { "Becario: ${it.nombre}" },
        onVolver = onVolver,
        barraAccion = formulario?.let { f ->
            {
                BotonPrimario(
                    texto = "Enviar solicitud",
                    onClick = {
                        intento = true
                        foco.clearFocus()
                        viewModel.enviar()
                    },
                    habilitado = f.puedeEnviar,
                    cargando = f.enviando,
                    icono = Icons.AutoMirrored.Rounded.Send,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    ) { padding ->
        ContenidoSegunEstado(estado, viewModel::cargar, modifier = Modifier.padding(padding).consumeWindowInsets(padding)) { f ->
            Column(
                Modifier
                    .fillMaxSize()
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(Espacio.pantalla),
                verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
            ) {
                f.avisoPendiente?.let {
                    AvisoBanner(it, TonoEstado.ALERTA, icono = Icons.Rounded.HourglassEmpty, titulo = "Ya hay una solicitud en curso")
                }
                Tarjeta(Modifier.fillMaxWidth()) {
                    Text(
                        "La coordinación revisará la solicitud y, si la aprueba, el becario pasará al ingeniero elegido.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = DocenCheckTema.colores.textoSecundario,
                        modifier = Modifier.padding(bottom = Espacio.l)
                    )
                    Desplegable(
                        etiqueta = "Transferir a",
                        opciones = f.ingenieros,
                        seleccionado = f.destinoSeleccionado,
                        textoDe = { it.nombre },
                        detalleDe = { it.coordinacion },
                        onSeleccionar = viewModel::seleccionarDestino,
                        icono = Icons.Rounded.Engineering,
                        placeholder = "Elige un ingeniero",
                        error = if (intento && f.destinoSeleccionado == null) "Elige el ingeniero destino" else null,
                        ayuda = if (f.ingenieros.isEmpty()) "No hay otros ingenieros activos" else null,
                        habilitado = f.avisoPendiente == null
                    )
                    Desplegable(
                        etiqueta = "Motivo",
                        opciones = MOTIVOS,
                        seleccionado = motivoBase,
                        textoDe = { it },
                        onSeleccionar = { motivoBase = it; actualizarMotivo() },
                        icono = Icons.Rounded.Notes,
                        placeholder = "Elige un motivo",
                        error = if (intento && f.motivo.isBlank()) "Elige o escribe el motivo" else null,
                        habilitado = f.avisoPendiente == null,
                        modifier = Modifier.padding(top = Espacio.m)
                    )
                    CampoTexto(
                        valor = detalles,
                        onCambio = { detalles = it; actualizarMotivo() },
                        etiqueta = "Detalles (opcional)",
                        unaLinea = false,
                        lineasMinimas = 3,
                        imeAction = ImeAction.Default,
                        habilitado = f.avisoPendiente == null,
                        ayuda = "Explica brevemente la razón",
                        modifier = Modifier.padding(top = Espacio.m)
                    )
                }
                f.error?.let { AvisoBanner(it, TonoEstado.PELIGRO, icono = Icons.Rounded.ErrorOutline) }
            }
        }
    }
}
