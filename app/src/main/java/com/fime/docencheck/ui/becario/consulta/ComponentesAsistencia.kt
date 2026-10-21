package com.fime.docencheck.ui.becario.consulta

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.DateRange
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Face
import androidx.compose.material.icons.rounded.HowToReg
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.core.util.FormatoUi
import com.fime.docencheck.data.model.AsistenciaUi
import com.fime.docencheck.data.model.horasPorDia
import com.fime.docencheck.ui.theme.BadgeEstado
import com.fime.docencheck.ui.theme.DialogoRangoFechas
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.IconoCircular
import com.fime.docencheck.ui.theme.NumeroMediano
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TonoEstado
import com.fime.docencheck.ui.theme.etiqueta
import com.fime.docencheck.ui.theme.icono
import com.fime.docencheck.ui.theme.tono
import java.time.LocalDate

/**
 * Tarjeta de un registro: ícono y badge Entrada (verde) / Salida (ámbar), hora
 * grande, modalidad con ícono y cómo se verificó; "Sin subir" o el rechazo si
 * sigue en el teléfono (A-14, M-03).
 */
@Composable
fun TarjetaAsistencia(
    item: AsistenciaUi,
    modifier: Modifier = Modifier,
    nombreBecario: String? = null,
    onEliminar: (() -> Unit)? = null
) {
    val a = item.asistencia
    val instante = FechaUi.parsear(a.ocurrido_en)
    val hora = instante?.let { FechaUi.hora(it) } ?: "—"
    val c = DocenCheckTema.colores
    Tarjeta(modifier = modifier.fillMaxWidth(), relleno = PaddingValues(start = Espacio.l, top = Espacio.m, bottom = Espacio.m, end = Espacio.xs)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconoCircular(a.tipo.icono(), tono = a.tipo.tono(), tamano = 44.dp)
            Spacer(Modifier.width(Espacio.m))
            Column(Modifier.weight(1f)) {
                nombreBecario?.let {
                    Text(it, style = MaterialTheme.typography.titleSmall, color = c.texto, maxLines = 1)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(hora, style = NumeroMediano, color = c.texto)
                    Spacer(Modifier.width(Espacio.s))
                    BadgeEstado(a.tipo.etiqueta(), a.tipo.tono())
                }
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = Espacio.xxs)) {
                    Icon(a.modalidad.icono(), contentDescription = null, tint = c.textoSecundario, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(Espacio.xs))
                    Text(a.modalidad.etiqueta(), style = MaterialTheme.typography.bodySmall, color = c.textoSecundario)
                    Text("  ·  ", style = MaterialTheme.typography.bodySmall, color = c.textoSecundario)
                    Icon(
                        if (a.verificado_por != null) Icons.Rounded.HowToReg else Icons.Rounded.Face,
                        contentDescription = null,
                        tint = c.textoSecundario,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(Espacio.xs))
                    Text(
                        if (a.verificado_por != null) "Registro manual" else "Verificación facial",
                        style = MaterialTheme.typography.bodySmall,
                        color = c.textoSecundario
                    )
                }
                when {
                    item.rechazo != null -> Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = Espacio.xs)) {
                        Icon(Icons.Rounded.ErrorOutline, contentDescription = null, tint = c.peligro, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(Espacio.xs))
                        Text("No se subió: ${item.rechazo}", style = MaterialTheme.typography.bodySmall, color = c.peligro)
                    }
                    item.sinSubir -> BadgeEstado(
                        "Sin subir · se sube al haber conexión",
                        TonoEstado.INFO,
                        icono = Icons.Rounded.CloudOff,
                        modifier = Modifier.padding(top = Espacio.xs)
                    )
                }
            }
            if (onEliminar != null && a.id != null && !item.sinSubir) {
                IconButton(onClick = onEliminar) {
                    Icon(Icons.Rounded.DeleteOutline, contentDescription = "Eliminar registro de las $hora", tint = c.textoSecundario)
                }
            } else {
                Spacer(Modifier.width(Espacio.m))
            }
        }
    }
}

private fun etiquetaDia(fecha: LocalDate?): String {
    if (fecha == null) return "Sin fecha"
    val hoy = FechaUi.hoy()
    return when (fecha) {
        hoy -> "Hoy · ${FechaUi.fechaCorta(fecha)}"
        hoy.minusDays(1) -> "Ayer · ${FechaUi.fechaCorta(fecha)}"
        else -> FormatoUi.diaCompleto(fecha)
    }
}

/**
 * Lista agrupada por día local, con el total de horas trabajadas de ese día
 * (mismo emparejamiento que el servidor, `horasPorDia`).
 */
fun LazyListScope.asistenciasPorDia(
    lista: List<AsistenciaUi>,
    nombreDe: ((AsistenciaUi) -> String?)? = null,
    agruparPorBecario: Boolean = false,
    onEliminar: ((AsistenciaUi) -> Unit)? = null
) {
    val grupos = lista.groupBy { FechaUi.fechaLocal(it.asistencia.ocurrido_en) }
    grupos.forEach { (fecha, delDia) ->
        item(key = "dia-$fecha") {
            val horas = if (agruparPorBecario) {
                delDia.groupBy { it.asistencia.becario_id }.values.sumOf { g -> horasPorDia(g.map { it.asistencia }).values.sum() }
            } else {
                horasPorDia(delDia.map { it.asistencia }).values.sum()
            }
            Row(
                Modifier.fillMaxWidth().padding(top = Espacio.s, bottom = Espacio.xxs),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    etiquetaDia(fecha),
                    style = MaterialTheme.typography.titleSmall,
                    color = DocenCheckTema.colores.texto,
                    modifier = Modifier.weight(1f).semantics { heading() }
                )
                if (horas > 0) {
                    Text(
                        "${FormatoUi.horas(horas)} trabajadas",
                        style = MaterialTheme.typography.labelMedium,
                        color = DocenCheckTema.colores.textoSecundario
                    )
                }
            }
        }
        items(delDia, key = { "${it.asistencia.id ?: it.asistencia.ocurrido_en}-${it.asistencia.becario_id}-${it.sinSubir}" }) { item ->
            TarjetaAsistencia(
                item = item,
                nombreBecario = nombreDe?.invoke(item),
                onEliminar = onEliminar?.let { { it(item) } }
            )
        }
    }
}

/** Atajos de fecha + calendario de rango. Muestra el rango activo con botón para quitarlo. */
@Composable
fun FiltrosFecha(
    filtro: FiltroFechas?,
    onSemanaActual: () -> Unit,
    onSemanaPasada: (() -> Unit)?,
    onRango: (LocalDate, LocalDate) -> Unit,
    onLimpiar: (() -> Unit)?,
    modifier: Modifier = Modifier
) {
    var calendario by rememberSaveable { mutableStateOf(false) }
    val lunes = FechaUi.lunesDe()
    val esSemanaActual = filtro != null && filtro.desde == lunes && filtro.hasta == FechaUi.hoy()
    val esSemanaPasada = filtro != null && filtro.desde == lunes.minusWeeks(1) && filtro.hasta == lunes.minusDays(1)
    val esRango = filtro != null && !esSemanaActual && !esSemanaPasada
    val colores = FilterChipDefaults.filterChipColors(
        selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
        selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer,
        selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimaryContainer
    )
    Column(modifier) {
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(Espacio.s)
        ) {
            if (onLimpiar != null) {
                FilterChip(selected = filtro == null, onClick = onLimpiar, label = { Text("Recientes") }, colors = colores)
            }
            FilterChip(selected = esSemanaActual, onClick = onSemanaActual, label = { Text("Esta semana") }, colors = colores)
            if (onSemanaPasada != null) {
                FilterChip(selected = esSemanaPasada, onClick = onSemanaPasada, label = { Text("Semana pasada") }, colors = colores)
            }
            FilterChip(
                selected = esRango,
                onClick = { calendario = true },
                label = { Text(if (esRango && filtro != null) "${FechaUi.diaMes(filtro.desde)} – ${FechaUi.diaMes(filtro.hasta)}" else "Elegir fechas") },
                leadingIcon = { Icon(Icons.Rounded.DateRange, contentDescription = null, modifier = Modifier.size(18.dp)) },
                colors = colores
            )
        }
        if (filtro != null) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = Espacio.xs)) {
                Text(
                    "Del ${FechaUi.fechaCorta(filtro.desde)} al ${FechaUi.fechaCorta(filtro.hasta)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = DocenCheckTema.colores.textoSecundario,
                    modifier = Modifier.weight(1f)
                )
                if (onLimpiar != null) {
                    IconButton(onClick = onLimpiar, modifier = Modifier.semantics { contentDescription = "Quitar filtro de fechas" }) {
                        Icon(Icons.Rounded.Close, contentDescription = null, tint = DocenCheckTema.colores.textoSecundario)
                    }
                }
            }
        }
    }
    if (calendario) {
        DialogoRangoFechas(
            desdeInicial = filtro?.desde,
            hastaInicial = filtro?.hasta,
            fechaMaxima = FechaUi.hoy(),
            onConfirmar = { d, h -> calendario = false; onRango(d, h) },
            onCancelar = { calendario = false }
        )
    }
}
