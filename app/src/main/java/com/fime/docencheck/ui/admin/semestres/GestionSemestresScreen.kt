package com.fime.docencheck.ui.admin.semestres

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.EventAvailable
import androidx.compose.material.icons.rounded.Label
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.ContenidoSegunEstado
import com.fime.docencheck.core.ui.DialogoConfirmacion
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.core.util.FormatoUi
import com.fime.docencheck.ui.admin.reportes.ReporteHorasGlobalViewModel
import com.fime.docencheck.ui.theme.AvisoBanner
import com.fime.docencheck.ui.theme.BadgeEstado
import com.fime.docencheck.ui.theme.BarraProgresoMeta
import com.fime.docencheck.ui.theme.BotonDestructivo
import com.fime.docencheck.ui.theme.BotonPrimario
import com.fime.docencheck.ui.theme.CampoTexto
import com.fime.docencheck.ui.theme.Divisor
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.EncabezadoSeccion
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.IconoCircular
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.SegmentadoControl
import com.fime.docencheck.ui.theme.SelectorFecha
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TonoEstado
import java.time.LocalDate
import java.time.temporal.ChronoUnit

@Composable
fun GestionSemestresScreen(
    onVolver: () -> Unit,
    /** Al terminar: regresa con un aviso para la pantalla anterior (B-07). */
    onTerminado: (String) -> Unit = { onVolver() }
) {
    val app = appActual()
    val viewModel: GestionSemestresViewModel = viewModel(
        factory = viewModelFactory { initializer { GestionSemestresViewModel(app.adminRepository, app.siaseRepository) } }
    )
    // Reutiliza el reporte global para la lista Cumplió / No cumplió (solo lectura).
    val horasVm: ReporteHorasGlobalViewModel = viewModel(
        factory = viewModelFactory { initializer { ReporteHorasGlobalViewModel(app.adminRepository, app.progresoRepository) } }
    )
    val estado by viewModel.estado.collectAsState()
    val becarios by horasVm.detalle.collectAsState()
    var verLista by rememberSaveable { mutableStateOf(false) }
    val formulario = (estado as? UiState.Listo)?.datos

    LaunchedEffect(formulario?.cerrado, formulario?.periodoAbierto) {
        val f = formulario ?: return@LaunchedEffect
        when {
            f.cerrado -> onTerminado("Semestre cerrado; nuevo periodo \"${f.nombre.trim()}\" activo")
            f.periodoAbierto -> onTerminado("Periodo \"${f.nombre.trim()}\" abierto")
        }
    }

    formulario?.let { f ->
        // C-05: confirmación con resumen y nombre escrito; no se puede deshacer.
        if (f.confirmando) {
            val vista = f.vistaPrevia
            val periodo = f.periodoActivo?.nombre.orEmpty()
            DialogoConfirmacion(
                titulo = "Cerrar \"$periodo\"",
                mensaje = buildString {
                    append("Se cerrará \"$periodo\"")
                    if (vista != null) {
                        append(" con ${FormatoUi.plural(vista.becarios_activos, "becario activo", "becarios activos")}; ${vista.becarios_cumplidos} cumplieron su meta semestral")
                    }
                    append(". Se abrirá \"${f.nombre.trim()}\". Las horas del periodo actual dejarán de contar en el progreso. Esta acción no se puede deshacer.")
                },
                textoConfirmar = "Cerrar periodo",
                destructivo = true,
                confirmarHabilitado = f.confirmacionValida,
                onConfirmar = viewModel::confirmarCierre,
                onCancelar = viewModel::cancelarCierre,
                contenidoExtra = {
                    CampoTexto(
                        valor = f.textoConfirmacion,
                        onCambio = viewModel::cambiarTextoConfirmacion,
                        etiqueta = "Escribe \"$periodo\" para confirmar",
                        imeAction = ImeAction.Done,
                        ayuda = if (f.confirmacionValida) "Nombre correcto" else null
                    )
                }
            )
        }
        f.resultado?.let { r ->
            DialogoConfirmacion(
                titulo = "Semestre cerrado",
                mensaje = "${r.becarios_cumplidos} de ${r.becarios_activos} becarios cumplieron su meta semestral. El periodo \"${r.periodo_nuevo}\" ya está activo.",
                icono = Icons.Rounded.EventAvailable,
                textoConfirmar = "Entendido",
                textoCancelar = "Cerrar",
                onConfirmar = viewModel::resultadoVisto,
                onCancelar = viewModel::resultadoVisto
            )
        }
    }

    PantallaConEncabezado(
        titulo = "Gestión de semestres",
        subtitulo = formulario?.periodoActivo?.nombre?.let { "Periodo activo: $it" } ?: "Periodos académicos",
        onVolver = onVolver,
        barraAccion = formulario?.let { f ->
            {
                if (f.hayPeriodoActivo) {
                    BotonDestructivo(
                        texto = "Cerrar semestre y abrir el nuevo",
                        onClick = viewModel::pedirCierre,
                        cargando = f.procesando,
                        icono = Icons.Rounded.Lock,
                        modifier = Modifier.fillMaxWidth()
                    )
                } else {
                    BotonPrimario(
                        texto = "Abrir periodo",
                        onClick = viewModel::abrirPeriodo,
                        cargando = f.procesando,
                        icono = Icons.Rounded.EventAvailable,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }
    ) { padding ->
        ContenidoSegunEstado(estado, viewModel::cargar, modifier = Modifier.padding(padding).consumeWindowInsets(padding)) { f ->
            Column(
                Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(Espacio.pantalla),
                verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
            ) {
                val periodo = f.periodoActivo
                // Periodo actual
                Tarjeta(Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconoCircular(Icons.Rounded.CalendarMonth, tono = if (periodo != null) TonoEstado.EXITO else TonoEstado.PELIGRO)
                        Spacer(Modifier.width(Espacio.m))
                        Column(Modifier.weight(1f)) {
                            Text("Periodo actual", style = MaterialTheme.typography.bodySmall, color = DocenCheckTema.colores.textoSecundario)
                            Text(periodo?.nombre ?: "Ninguno activo", style = MaterialTheme.typography.titleMedium, color = DocenCheckTema.colores.texto)
                        }
                        BadgeEstado(if (periodo != null) "Activo" else "Sin periodo", if (periodo != null) TonoEstado.EXITO else TonoEstado.PELIGRO)
                    }
                    val inicio = FormatoUi.fechaDeTexto(periodo?.fecha_inicio)
                    val fin = FormatoUi.fechaDeTexto(periodo?.fecha_fin)
                    if (inicio != null && fin != null) {
                        val restantes = ChronoUnit.DAYS.between(FechaUi.hoy(), fin).toInt()
                        Text(
                            "Del ${FormatoUi.fechaMedia(inicio)} al ${FormatoUi.fechaMedia(fin)}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = DocenCheckTema.colores.texto,
                            modifier = Modifier.padding(top = Espacio.m)
                        )
                        Text(
                            when {
                                restantes > 0 -> "Faltan ${FormatoUi.plural(restantes, "día", "días")} para el cierre"
                                restantes == 0 -> "Hoy termina el periodo"
                                else -> "El periodo terminó hace ${FormatoUi.plural(-restantes, "día", "días")}"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = if (restantes < 0) DocenCheckTema.colores.alerta else DocenCheckTema.colores.textoSecundario
                        )
                    }
                    if (periodo == null) {
                        Text(
                            "No hay periodo activo. Captura los datos abajo para abrir el primero.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = DocenCheckTema.colores.textoSecundario,
                            modifier = Modifier.padding(top = Espacio.m)
                        )
                    }
                }

                // Cumplimiento
                f.vistaPrevia?.let { v ->
                    Tarjeta(Modifier.fillMaxWidth()) {
                        EncabezadoSeccion("Cumplimiento del periodo", textoAccion = if (becarios.isNotEmpty()) (if (verLista) "Ocultar" else "Ver lista") else null, onAccion = { verLista = !verLista })
                        Text(
                            "${v.becarios_cumplidos} de ${FormatoUi.plural(v.becarios_activos, "becario", "becarios")} ya cumplieron su meta semestral.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = DocenCheckTema.colores.texto
                        )
                        BarraProgresoMeta(
                            progreso = if (v.becarios_activos > 0) v.becarios_cumplidos.toFloat() / v.becarios_activos else 0f,
                            modifier = Modifier.fillMaxWidth().padding(top = Espacio.s)
                        )
                        if (verLista) {
                            becarios.sortedBy { it.nombre }.forEachIndexed { i, b ->
                                if (i > 0) Divisor() else Spacer(Modifier.width(Espacio.s))
                                val cumplio = b.meta_semestral != null && b.horas_semestre >= b.meta_semestral
                                Row(Modifier.fillMaxWidth().padding(vertical = Espacio.s), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(b.nombre, style = MaterialTheme.typography.titleSmall, color = DocenCheckTema.colores.texto)
                                        Text(FormatoUi.horasDeMeta(b.horas_semestre, b.meta_semestral), style = MaterialTheme.typography.bodySmall, color = DocenCheckTema.colores.textoSecundario)
                                    }
                                    BadgeEstado(if (cumplio) "Cumplió" else "No cumplió", if (cumplio) TonoEstado.EXITO else TonoEstado.PELIGRO)
                                }
                            }
                        }
                    }
                }

                // Nuevo periodo
                Tarjeta(Modifier.fillMaxWidth()) {
                    EncabezadoSeccion(if (f.hayPeriodoActivo) "Siguiente periodo" else "Nuevo periodo")
                    Column(verticalArrangement = Arrangement.spacedBy(Espacio.m), modifier = Modifier.padding(top = Espacio.s)) {
                        CampoTexto(
                            valor = f.nombre,
                            onCambio = viewModel::cambiarNombre,
                            etiqueta = "Nombre del periodo",
                            placeholder = "Enero-Junio 2027",
                            icono = Icons.Rounded.Label,
                            imeAction = ImeAction.Done
                        )
                        Column {
                            Text("Tipo de periodo", style = MaterialTheme.typography.labelLarge, color = DocenCheckTema.colores.textoSecundario, modifier = Modifier.padding(bottom = Espacio.xs))
                            SegmentadoControl(
                                opciones = listOf("AD (agosto-diciembre)", "EJ (enero-junio)"),
                                seleccionado = TIPOS_PERIODO.indexOf(f.tipo).coerceAtLeast(0),
                                onSeleccionar = { viewModel.cambiarTipo(TIPOS_PERIODO[it]) }
                            )
                        }
                        val inicioNuevo = runCatching { LocalDate.parse(f.inicio.trim()) }.getOrNull()
                        val finNuevo = runCatching { LocalDate.parse(f.fin.trim()) }.getOrNull()
                        SelectorFecha(
                            etiqueta = "Fecha de inicio",
                            fecha = inicioNuevo,
                            onFecha = { viewModel.cambiarInicio(it.toString()) }
                        )
                        SelectorFecha(
                            etiqueta = "Fecha de fin",
                            fecha = finNuevo,
                            onFecha = { viewModel.cambiarFin(it.toString()) },
                            fechaMinima = inicioNuevo?.plusDays(1),
                            error = if (inicioNuevo != null && finNuevo != null && !finNuevo.isAfter(inicioNuevo)) "Debe ser posterior al inicio" else null
                        )
                    }
                }

                f.mensaje?.let { AvisoBanner(it, TonoEstado.PELIGRO, icono = Icons.Rounded.ErrorOutline) }
                if (f.hayPeriodoActivo) {
                    AvisoBanner(
                        titulo = "Acción irreversible",
                        texto = "Cerrar el semestre marca quién cumplió su meta, archiva las horas del periodo y activa el nuevo. Se te pedirá escribir el nombre del periodo para confirmar.",
                        tono = TonoEstado.ALERTA,
                        icono = Icons.Rounded.WarningAmber
                    )
                }
            }
        }
    }
}

@Suppress("unused")
@Composable
private fun AccionLista(texto: String, onClick: () -> Unit) = TextButton(onClick = onClick) { Text(texto) }
