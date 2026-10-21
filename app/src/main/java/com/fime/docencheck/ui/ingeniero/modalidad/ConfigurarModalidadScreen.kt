package com.fime.docencheck.ui.ingeniero.modalidad

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.ContenidoSegunEstado
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.ui.rememberAvisos
import com.fime.docencheck.data.model.ModalidadTrabajo
import com.fime.docencheck.ui.theme.AvisoBanner
import com.fime.docencheck.ui.theme.Divisor
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.EncabezadoSeccion
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.FormasApp
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.SegmentadoControl
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TonoEstado
import com.fime.docencheck.ui.theme.etiqueta
import com.fime.docencheck.ui.theme.icono

private val OPCIONES: List<ModalidadTrabajo?> = listOf(ModalidadTrabajo.presencial, ModalidadTrabajo.home_office, null)

@Composable
fun ConfigurarModalidadScreen(becarioId: String, onVolver: () -> Unit) {
    val app = appActual()
    val viewModel: ConfigurarModalidadViewModel = viewModel(
        factory = viewModelFactory {
            initializer { ConfigurarModalidadViewModel(becarioId, app.horarioRepository, app.equipoRepository) }
        }
    )
    val estado by viewModel.estado.collectAsState()
    val guardandoDias by viewModel.guardandoDias.collectAsState()
    val nombre by viewModel.nombreBecario.collectAsState()
    val avisos = rememberAvisos(viewModel.avisos)

    PantallaConEncabezado(
        titulo = "Modalidad semanal",
        subtitulo = nombre,
        onVolver = onVolver,
        snackbarHostState = avisos
    ) { padding ->
        ContenidoSegunEstado(estado, viewModel::cargar, modifier = Modifier.padding(padding)) { modalidadPorDia ->
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Espacio.pantalla),
                verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
            ) {
                // Resumen L–D
                Tarjeta(Modifier.fillMaxWidth()) {
                    EncabezadoSeccion("Patrón semanal")
                    Row(Modifier.fillMaxWidth().padding(top = Espacio.s), horizontalArrangement = Arrangement.spacedBy(Espacio.xs)) {
                        DIAS_SEMANA.forEach { (dia, nombreDia) ->
                            val m = modalidadPorDia[dia]
                            Column(
                                Modifier
                                    .weight(1f)
                                    .clip(FormasApp.medium)
                                    .background(if (m != null) MaterialTheme.colorScheme.primaryContainer else DocenCheckTema.colores.fondo)
                                    .padding(vertical = Espacio.s)
                                    .semantics(mergeDescendants = true) { contentDescription = "$nombreDia: ${m.etiqueta()}" },
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(nombreDia.take(3), style = MaterialTheme.typography.labelMedium, color = DocenCheckTema.colores.textoSecundario)
                                Icon(
                                    m.icono(),
                                    contentDescription = null,
                                    tint = if (m != null) MaterialTheme.colorScheme.onPrimaryContainer else DocenCheckTema.colores.textoSecundario,
                                    modifier = Modifier.padding(top = Espacio.xs).size(20.dp)
                                )
                            }
                        }
                    }
                }

                AvisoBanner(
                    texto = "Cada cambio se guarda al momento. Un día en \"No aplica\" no se espera asistencia.",
                    tono = TonoEstado.INFO,
                    icono = Icons.Rounded.Info
                )

                Tarjeta(Modifier.fillMaxWidth()) {
                    DIAS_SEMANA.forEachIndexed { i, (dia, nombreDia) ->
                        if (i > 0) Divisor(Modifier.padding(vertical = Espacio.s))
                        val modalidad = modalidadPorDia[dia]
                        val ocupado = dia in guardandoDias
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = Espacio.s)) {
                            Text(nombreDia, style = MaterialTheme.typography.titleSmall, color = DocenCheckTema.colores.texto, modifier = Modifier.weight(1f))
                            if (ocupado) {
                                CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                                Spacer(Modifier.width(Espacio.xs))
                                Text("Guardando…", style = MaterialTheme.typography.bodySmall, color = DocenCheckTema.colores.textoSecundario)
                            }
                        }
                        SegmentadoControl(
                            opciones = listOf("Presencial", "Home office", "No aplica"),
                            seleccionado = OPCIONES.indexOf(modalidad),
                            onSeleccionar = { indice -> if (OPCIONES[indice] != modalidad) viewModel.cambiarDia(dia, OPCIONES[indice]) },
                            habilitado = !ocupado
                        )
                    }
                }

                Row(Modifier.fillMaxWidth().padding(vertical = Espacio.s), horizontalArrangement = Arrangement.SpaceEvenly) {
                    OPCIONES.forEach { m ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(m.icono(), contentDescription = null, tint = DocenCheckTema.colores.textoSecundario, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(Espacio.xs))
                            Text(m.etiqueta(), style = MaterialTheme.typography.bodySmall, color = DocenCheckTema.colores.textoSecundario)
                        }
                    }
                }
            }
        }
    }
}
