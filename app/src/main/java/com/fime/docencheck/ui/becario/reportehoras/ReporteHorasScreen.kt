package com.fime.docencheck.ui.becario.reportehoras

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
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
import androidx.compose.material.icons.rounded.EmojiEvents
import androidx.compose.material.icons.rounded.TrendingDown
import androidx.compose.material.icons.rounded.TrendingUp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.ContenedorRefrescable
import com.fime.docencheck.core.ui.ContenidoSegunEstado
import com.fime.docencheck.core.ui.RecargarAlReanudar
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.core.util.FormatoUi
import com.fime.docencheck.data.model.ModalidadTrabajo
import com.fime.docencheck.data.model.ProgresoHoras
import com.fime.docencheck.ui.theme.BarraProgresoMeta
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.EncabezadoSeccion
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.FormasApp
import com.fime.docencheck.ui.theme.IconoCircular
import com.fime.docencheck.ui.theme.NumeroGrande
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.SegmentadoControl
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TonoEstado
import com.fime.docencheck.ui.theme.etiqueta
import com.fime.docencheck.ui.theme.icono
import com.fime.docencheck.ui.theme.vaAlRitmo

@Composable
fun ReporteHorasScreen(onVolver: (() -> Unit)? = null) {
    val app = appActual()
    val viewModel: ReporteHorasViewModel = viewModel(
        factory = viewModelFactory {
            initializer { ReporteHorasViewModel(app.sessionManager, app.progresoRepository, app.asistenciaRepository, app.horarioRepository) }
        }
    )
    RecargarAlReanudar(viewModel::recargar)
    val estado by viewModel.estado.collectAsState()
    val periodo by viewModel.periodo.collectAsState()
    val semana by viewModel.semana.collectAsState()

    PantallaConEncabezado(titulo = "Mi reporte de horas", subtitulo = "Tu avance contra las metas", onVolver = onVolver) { padding ->
        ContenedorRefrescable(onRefrescar = viewModel::recargar, marcaDatos = estado, modifier = Modifier.padding(padding)) {
            ContenidoSegunEstado(estado, viewModel::recargar) { progreso ->
                Column(
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(Espacio.pantalla),
                    verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
                ) {
                    SegmentadoControl(
                        opciones = listOf("Semana", "Mes", "Semestre"),
                        seleccionado = periodo.ordinal,
                        onSeleccionar = { viewModel.seleccionarPeriodo(PeriodoReporte.entries[it]) }
                    )
                    AnimatedContent(periodo, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "periodo") { p ->
                        Column(verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)) {
                            when (p) {
                                PeriodoReporte.SEMANA -> {
                                    CuadriculaSemana(semana)
                                    TarjetaTotal("Total de la semana", progreso.horas_semana, progreso.meta_semanal, FormatoUi.ritmoSemana())
                                    TarjetaMeta("Meta semanal", progreso.horas_semana, progreso.meta_semanal)
                                }
                                PeriodoReporte.MES -> {
                                    TarjetaTotal("Total de ${FechaUi.mesLargo(FechaUi.mesActual())}", progreso.horas_mes, progreso.meta_mensual, FormatoUi.ritmoMes())
                                    TarjetaMeta("Meta mensual", progreso.horas_mes, progreso.meta_mensual)
                                }
                                PeriodoReporte.SEMESTRE -> {
                                    TarjetaTotal("Total del semestre", progreso.horas_semestre, progreso.meta_semestral, null)
                                    TarjetaMeta("Meta semestral", progreso.horas_semestre, progreso.meta_semestral)
                                }
                            }
                        }
                    }
                    Leyenda()
                }
            }
        }
    }
}

/** Cuadrícula L–D de la semana local: horas del día e ícono de modalidad (A-15). */
@Composable
private fun CuadriculaSemana(dias: List<DiaReporte>) {
    val c = DocenCheckTema.colores
    Tarjeta(Modifier.fillMaxWidth()) {
        EncabezadoSeccion("Esta semana")
        Row(Modifier.fillMaxWidth().padding(top = Espacio.s), horizontalArrangement = Arrangement.spacedBy(Espacio.xs)) {
            dias.forEach { dia ->
                val dow = dia.fecha.dayOfWeek
                val descripcion = buildString {
                    append(FormatoUi.nombreDia(dow)).append(" ").append(dia.fecha.dayOfMonth).append(": ")
                    append(if (dia.esFuturo) "por venir" else FormatoUi.horas(dia.horas))
                    append(", ").append(dia.modalidad.etiqueta())
                    if (dia.esHoy) append(", hoy")
                }
                Column(
                    Modifier
                        .weight(1f)
                        .clip(FormasApp.medium)
                        .background(if (dia.esHoy) MaterialTheme.colorScheme.primaryContainer else c.fondo)
                        .then(if (dia.esHoy) Modifier.border(BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary), FormasApp.medium) else Modifier)
                        .alpha(if (dia.esFuturo) 0.5f else 1f)
                        .padding(vertical = Espacio.s)
                        .semantics(mergeDescendants = true) { contentDescription = descripcion },
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(FormatoUi.inicialDia(dow), style = MaterialTheme.typography.labelMedium, color = c.textoSecundario)
                    Text("${dia.fecha.dayOfMonth}", style = MaterialTheme.typography.bodySmall, color = c.textoSecundario)
                    Text(
                        if (dia.esFuturo || dia.horas == 0.0) "–" else FormatoUi.numeroHoras(dia.horas),
                        style = MaterialTheme.typography.titleSmall.copy(fontFeatureSettings = "tnum"),
                        color = if (dia.horas > 0) c.texto else c.textoSecundario,
                        modifier = Modifier.padding(vertical = Espacio.xs)
                    )
                    Icon(
                        dia.modalidad.icono(),
                        contentDescription = null,
                        tint = if (dia.modalidad == null) c.textoSecundario.copy(alpha = 0.6f) else MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun TarjetaTotal(titulo: String, horas: Double, meta: Double?, ritmo: Float?) {
    val c = DocenCheckTema.colores
    val progreso = if (meta != null && meta > 0) (horas / meta).toFloat() else 0f
    val alRitmo = vaAlRitmo(progreso, ritmo)
    Tarjeta(Modifier.fillMaxWidth()) {
        Text(titulo, style = MaterialTheme.typography.bodyMedium, color = c.textoSecundario)
        Row(verticalAlignment = Alignment.Bottom) {
            Text(FormatoUi.numeroHoras(horas), style = NumeroGrande, color = c.texto)
            Text(
                if (meta != null && meta > 0) " / ${FormatoUi.horas(meta)}" else " h",
                style = MaterialTheme.typography.titleMedium,
                color = c.textoSecundario,
                modifier = Modifier.padding(bottom = 4.dp)
            )
        }
        if (meta != null && meta > 0) {
            BarraProgresoMeta(progreso, ritmoEsperado = ritmo, modifier = Modifier.fillMaxWidth().padding(top = Espacio.m), altura = 10.dp)
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = Espacio.s)) {
                Icon(
                    if (alRitmo) Icons.Rounded.TrendingUp else Icons.Rounded.TrendingDown,
                    contentDescription = null,
                    tint = if (alRitmo) c.exito else c.alerta,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(Modifier.width(Espacio.xs))
                Text(
                    when {
                        progreso >= 1f -> "Meta cumplida"
                        ritmo == null -> "${(progreso * 100).toInt()} % de la meta"
                        alRitmo -> "Vas al ritmo esperado"
                        else -> "Vas por debajo del ritmo esperado"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = if (alRitmo) c.exito else c.alerta
                )
            }
        }
    }
}

@Composable
private fun TarjetaMeta(titulo: String, horas: Double, meta: Double?) {
    val c = DocenCheckTema.colores
    Tarjeta(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconoCircular(Icons.Rounded.EmojiEvents, tono = TonoEstado.ALERTA, tamano = 44.dp)
            Spacer(Modifier.width(Espacio.m))
            Column(Modifier.weight(1f)) {
                Text(
                    if (meta != null) "$titulo: ${FormatoUi.horas(meta)}" else "$titulo sin configurar",
                    style = MaterialTheme.typography.titleMedium,
                    color = c.texto
                )
                Text(
                    when {
                        meta == null || meta <= 0 -> "La coordinación todavía no define esta meta."
                        horas >= meta -> "¡Cumpliste la meta! Sigue así."
                        else -> "Te faltan ${FormatoUi.horas(FormatoUi.faltan(horas, meta))}."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = c.textoSecundario
                )
            }
        }
    }
}

@Composable
private fun Leyenda() {
    val c = DocenCheckTema.colores
    Row(Modifier.fillMaxWidth().padding(vertical = Espacio.s), horizontalArrangement = Arrangement.SpaceEvenly) {
        listOf(ModalidadTrabajo.presencial, ModalidadTrabajo.home_office, null).forEach { m ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(m.icono(), contentDescription = null, tint = c.textoSecundario, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(Espacio.xs))
                Text(m.etiqueta(), style = MaterialTheme.typography.bodySmall, color = c.textoSecundario)
            }
        }
    }
}

@Suppress("unused")
private fun ProgresoHoras.sinMetas() = meta_semanal == null && meta_mensual == null && meta_semestral == null
