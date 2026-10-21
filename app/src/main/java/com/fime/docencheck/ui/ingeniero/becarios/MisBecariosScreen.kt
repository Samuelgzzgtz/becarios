package com.fime.docencheck.ui.ingeniero.becarios

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarViewWeek
import androidx.compose.material.icons.rounded.EventNote
import androidx.compose.material.icons.rounded.Face
import androidx.compose.material.icons.rounded.GroupOff
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
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
import com.fime.docencheck.core.ui.ContenidoSegunEstado
import com.fime.docencheck.core.ui.EstadoVacio
import com.fime.docencheck.core.ui.RecargarAlReanudar
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.ui.rememberAvisos
import com.fime.docencheck.core.util.FormatoUi
import com.fime.docencheck.data.model.BecarioConProgreso
import com.fime.docencheck.data.model.ProgresoBecario
import com.fime.docencheck.ui.theme.AvatarIniciales
import com.fime.docencheck.ui.theme.AvisoBanner
import com.fime.docencheck.ui.theme.BadgeEstado
import com.fime.docencheck.ui.theme.BotonSecundario
import com.fime.docencheck.ui.theme.CampoBusqueda
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.FilaProgreso
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TonoEstado
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

@Composable
fun MisBecariosScreen(
    onVolver: (() -> Unit)?,
    onEnrolar: (String) -> Unit,
    onModalidad: (String) -> Unit,
    onTransferir: (String) -> Unit,
    onConsultarAsistencias: (String) -> Unit,
    onVerTransferencias: (() -> Unit)? = null,
    avisosExternos: Flow<Aviso> = emptyFlow()
) {
    val app = appActual()
    val viewModel: MisBecariosViewModel = viewModel(
        factory = viewModelFactory {
            initializer { MisBecariosViewModel(app.sessionManager, app.equipoRepository, app.progresoRepository) }
        }
    )
    RecargarAlReanudar(viewModel::cargar)
    val estado by viewModel.estado.collectAsState()
    val detalle by viewModel.detalle.collectAsState()
    val avisos = rememberAvisos(avisosExternos)
    var busqueda by rememberSaveable { mutableStateOf("") }

    PantallaConEncabezado(
        titulo = "Mis becarios",
        subtitulo = "Avance de la semana y acciones",
        onVolver = onVolver,
        snackbarHostState = avisos
    ) { padding ->
        ContenedorRefrescable(onRefrescar = viewModel::cargar, marcaDatos = estado, modifier = Modifier.padding(padding)) {
            ContenidoSegunEstado(estado, viewModel::cargar) { becarios ->
                val filtrados = becarios.filter {
                    busqueda.isBlank() || it.becario.nombre.contains(busqueda, true) || it.becario.matricula.contains(busqueda, true)
                }
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(Espacio.pantalla),
                    verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
                ) {
                    item(key = "aviso") {
                        AvisoBanner(
                            texto = "El alta y baja de becarios la gestiona la coordinación.",
                            tono = TonoEstado.INFO,
                            icono = Icons.Rounded.Info,
                            textoAccion = onVerTransferencias?.let { "Ver mis transferencias" },
                            onAccion = onVerTransferencias
                        )
                    }
                    if (becarios.size > 4) {
                        item(key = "buscar") {
                            CampoBusqueda(busqueda, { busqueda = it }, "Buscar por nombre o matrícula")
                        }
                    }
                    if (becarios.isEmpty()) {
                        item { EstadoVacio("Todavía no tienes becarios asignados", mensaje = "Cuando la coordinación te asigne becarios aparecerán aquí.", icono = Icons.Rounded.GroupOff) }
                    } else if (filtrados.isEmpty()) {
                        item { EstadoVacio("Sin coincidencias", mensaje = "Nadie coincide con \"$busqueda\".") }
                    }
                    items(filtrados, key = { it.becario.id }) { item ->
                        TarjetaBecario(
                            item = item,
                            detalle = detalle[item.becario.id],
                            onAsistencias = { onConsultarAsistencias(item.becario.id) },
                            onModalidad = { onModalidad(item.becario.id) },
                            onEnrolar = { onEnrolar(item.becario.id) },
                            onTransferir = { onTransferir(item.becario.id) }
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TarjetaBecario(
    item: BecarioConProgreso,
    detalle: ProgresoBecario?,
    onAsistencias: () -> Unit,
    onModalidad: () -> Unit,
    onEnrolar: () -> Unit,
    onTransferir: () -> Unit
) {
    val c = DocenCheckTema.colores
    val p = item.progreso
    val ritmo = detalle?.let { d ->
        val meta = d.meta_semanal ?: return@let null
        if (meta <= 0) null else (d.horasEsperadasSemana / meta).toFloat()
    }
    Tarjeta(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AvatarIniciales(item.becario.nombre, tamano = 44.dp)
            Spacer(Modifier.width(Espacio.m))
            Column(Modifier.weight(1f)) {
                Text(item.becario.nombre, style = MaterialTheme.typography.titleMedium, color = c.texto, maxLines = 1)
                Text("Matrícula ${item.becario.matricula}", style = MaterialTheme.typography.bodySmall, color = c.textoSecundario)
            }
            if (detalle?.enRiesgo == true) BadgeEstado("Ritmo bajo", TonoEstado.ALERTA) else BadgeEstado("Activo", TonoEstado.EXITO)
        }
        FilaProgreso("Semana", p.horas_semana, p.meta_semanal, ritmoEsperado = ritmo, modifier = Modifier.padding(top = Espacio.s))
        Text(
            "Mes: ${FormatoUi.horasDeMeta(p.horas_mes, p.meta_mensual)}",
            style = MaterialTheme.typography.bodySmall,
            color = c.textoSecundario
        )
        FlowRow(
            Modifier.fillMaxWidth().padding(top = Espacio.m),
            horizontalArrangement = Arrangement.spacedBy(Espacio.s),
            verticalArrangement = Arrangement.spacedBy(Espacio.s)
        ) {
            BotonSecundario("Asistencias", onAsistencias, icono = Icons.Rounded.EventNote)
            BotonSecundario("Modalidad", onModalidad, icono = Icons.Rounded.CalendarViewWeek)
            BotonSecundario("Enrolar", onEnrolar, icono = Icons.Rounded.Face)
            BotonSecundario("Transferir", onTransferir, icono = Icons.Rounded.SwapHoriz)
        }
    }
}
