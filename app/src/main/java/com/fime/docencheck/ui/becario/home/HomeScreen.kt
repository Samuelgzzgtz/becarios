package com.fime.docencheck.ui.becario.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.CloudUpload
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Face
import androidx.compose.material.icons.rounded.Insights
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.BloqueEsqueleto
import com.fime.docencheck.core.ui.ContenedorRefrescable
import com.fime.docencheck.core.ui.EstadoError
import com.fime.docencheck.core.ui.RecargarAlReanudar
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.core.util.FormatoUi
import com.fime.docencheck.data.model.EstadoVentanaSiase
import com.fime.docencheck.data.model.ProgresoHoras
import com.fime.docencheck.data.model.TipoAsistencia
import com.fime.docencheck.ui.theme.AvisoBanner
import com.fime.docencheck.ui.theme.BadgeEstado
import com.fime.docencheck.ui.theme.BotonPrimario
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.EncabezadoSeccion
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.FilaProgreso
import com.fime.docencheck.ui.theme.IconoCircular
import com.fime.docencheck.ui.theme.IconoSinConfigurar
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TonoEstado
import com.fime.docencheck.ui.theme.etiqueta
import com.fime.docencheck.ui.theme.icono

@Composable
fun HomeScreen(
    onRegistrarAsistencia: () -> Unit,
    onReporteHoras: () -> Unit,
    onConsultaAsistencias: () -> Unit,
    onReporteSiase: () -> Unit,
    @Suppress("UNUSED_PARAMETER") onMiCuenta: () -> Unit = {}
) {
    val app = appActual()
    val viewModel: HomeViewModel = viewModel(
        factory = viewModelFactory {
            initializer {
                HomeViewModel(
                    app.sessionManager,
                    app.progresoRepository,
                    app.asistenciaRepository,
                    app.horarioRepository,
                    app.siaseRepository
                )
            }
        }
    )
    RecargarAlReanudar(viewModel::cargar)
    val estado by viewModel.estado.collectAsState()
    val pendientes by viewModel.pendientesSinSubir.collectAsState()
    val rechazadas by viewModel.rechazadas.collectAsState()
    val hoy by viewModel.hoy.collectAsState()
    val errorHoy by viewModel.errorHoy.collectAsState()
    val nombre by viewModel.nombre.collectAsState()
    val ventana by viewModel.ventanaSiase.collectAsState()

    PantallaConEncabezado(
        titulo = if (nombre.isBlank()) "Hola" else "Hola, ${FormatoUi.primerNombre(nombre)}",
        subtitulo = FormatoUi.diaCompleto(FechaUi.hoy())
    ) { padding ->
        ContenedorRefrescable(onRefrescar = viewModel::cargar, marcaDatos = estado, modifier = Modifier.padding(padding)) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(Espacio.pantalla),
                verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
            ) {
                item(key = "hoy") {
                    TarjetaHoy(hoy = hoy, errorHoy = errorHoy, onRegistrar = onRegistrarAsistencia, onReintentar = viewModel::cargar)
                }

                if (pendientes > 0) {
                    item(key = "pendientes") {
                        AvisoBanner(
                            titulo = "Sin subir: ${FormatoUi.plural(pendientes, "registro", "registros")}",
                            texto = "Están guardados en tu teléfono y se suben solos cuando haya conexión.",
                            tono = TonoEstado.INFO,
                            icono = Icons.Rounded.CloudUpload
                        )
                    }
                }

                if (rechazadas > 0) {
                    item(key = "rechazadas") {
                        AvisoBanner(
                            titulo = "El servidor rechazó ${FormatoUi.plural(rechazadas, "registro", "registros")}",
                            texto = "Se guardaron sin conexión y no se pudieron subir. Revísalos y avisa a tu ingeniero si hace falta corregirlos.",
                            tono = TonoEstado.PELIGRO,
                            icono = Icons.Rounded.ErrorOutline,
                            textoAccion = "Ver registros",
                            onAccion = onConsultaAsistencias,
                            textoAccionSecundaria = "Descartar",
                            onAccionSecundaria = viewModel::descartarRechazadas
                        )
                    }
                }

                item(key = "progreso") { TarjetaProgreso(estado, viewModel::cargar, onReporteHoras) }

                ventana?.let { v -> item(key = "siase") { TarjetaSiase(v, onReporteSiase) } }
            }
        }
    }
}

@Composable
private fun TarjetaHoy(
    hoy: TarjetaHoyUiState?,
    errorHoy: String?,
    onRegistrar: () -> Unit,
    onReintentar: () -> Unit
) {
    val c = DocenCheckTema.colores
    Tarjeta(modifier = Modifier.fillMaxWidth()) {
        EncabezadoSeccion("Hoy")
        when {
            hoy != null -> {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = Espacio.s)) {
                    IconoCircular(
                        if (hoy.modalidadConfigurada) hoy.modalidad.icono() else IconoSinConfigurar,
                        tono = if (hoy.modalidadConfigurada) TonoEstado.EXITO else TonoEstado.NEUTRO,
                        tamano = 48.dp
                    )
                    Spacer(Modifier.width(Espacio.m))
                    Column(Modifier.weight(1f)) {
                        Text(
                            if (hoy.modalidadConfigurada) hoy.modalidad.etiqueta() else "Modalidad sin configurar",
                            style = MaterialTheme.typography.titleMedium,
                            color = c.texto
                        )
                        Text(
                            if (hoy.proximoRegistro == TipoAsistencia.entrada) "Aún no registras tu entrada" else "Entrada registrada · falta tu salida",
                            style = MaterialTheme.typography.bodyMedium,
                            color = c.textoSecundario
                        )
                    }
                    BadgeEstado(
                        if (hoy.proximoRegistro == TipoAsistencia.entrada) "Toca entrada" else "Toca salida",
                        if (hoy.proximoRegistro == TipoAsistencia.entrada) TonoEstado.EXITO else TonoEstado.ALERTA
                    )
                }
                if (!hoy.modalidadConfigurada) {
                    Text(
                        "Tu ingeniero no ha definido este día; se registrará como presencial.",
                        style = MaterialTheme.typography.bodySmall,
                        color = c.textoSecundario,
                        modifier = Modifier.padding(top = Espacio.s)
                    )
                }
            }
            errorHoy != null -> EstadoError(errorHoy, onReintentar)
            else -> Column(Modifier.padding(top = Espacio.s)) {
                BloqueEsqueleto(Modifier.fillMaxWidth(0.6f), alto = 20.dp)
                BloqueEsqueleto(Modifier.fillMaxWidth(0.4f).padding(top = Espacio.s))
            }
        }
        BotonPrimario(
            texto = when (hoy?.proximoRegistro) {
                TipoAsistencia.salida -> "Registrar salida"
                TipoAsistencia.entrada -> "Registrar entrada"
                null -> "Registrar asistencia"
            },
            onClick = onRegistrar,
            icono = Icons.Rounded.Face,
            modifier = Modifier.fillMaxWidth().padding(top = Espacio.l)
        )
    }
}

@Composable
private fun TarjetaProgreso(estado: UiState<ProgresoHoras>, onReintentar: () -> Unit, onVerDetalle: () -> Unit) {
    Tarjeta(modifier = Modifier.fillMaxWidth()) {
        EncabezadoSeccion("Progreso de horas", icono = Icons.Rounded.Insights, textoAccion = "Detalle", onAccion = onVerDetalle)
        when (estado) {
            is UiState.Cargando -> Column {
                repeat(3) {
                    BloqueEsqueleto(Modifier.fillMaxWidth(0.5f).padding(top = Espacio.m))
                    BloqueEsqueleto(Modifier.fillMaxWidth().padding(top = Espacio.s), alto = 8.dp)
                }
            }
            is UiState.Error -> EstadoError(estado.mensaje, onReintentar)
            is UiState.Listo -> {
                val p = estado.datos
                FilaProgreso("Semana", p.horas_semana, p.meta_semanal, ritmoEsperado = FormatoUi.ritmoSemana())
                FilaProgreso("Mes", p.horas_mes, p.meta_mensual, ritmoEsperado = FormatoUi.ritmoMes())
                FilaProgreso("Semestre", p.horas_semestre, p.meta_semestral)
                Text(
                    "La marca en la barra indica dónde deberías ir a estas alturas.",
                    style = MaterialTheme.typography.bodySmall,
                    color = DocenCheckTema.colores.textoSecundario,
                    modifier = Modifier.padding(top = Espacio.xs)
                )
            }
        }
    }
}

@Composable
private fun TarjetaSiase(ventana: EstadoVentanaSiase, onAbrir: () -> Unit) {
    val c = DocenCheckTema.colores
    val apertura = FormatoUi.fechaDeTexto(ventana.fecha_apertura)
    val cierre = FormatoUi.fechaDeTexto(ventana.fecha_cierre)
    Tarjeta(modifier = Modifier.fillMaxWidth(), onClick = onAbrir) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconoCircular(Icons.Rounded.Description, tono = if (ventana.abierta) TonoEstado.ALERTA else TonoEstado.NEUTRO)
            Spacer(Modifier.width(Espacio.m))
            Column(Modifier.weight(1f)) {
                Text("Reporte mensual SIASE", style = MaterialTheme.typography.titleMedium, color = c.texto)
                if (apertura != null && cierre != null) {
                    Text(
                        "Del ${FormatoUi.diaMesLargo(apertura)} al ${FormatoUi.diaMesLargo(cierre)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = c.textoSecundario
                    )
                }
            }
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = c.textoSecundario)
        }
        AnimatedVisibility(visible = true) {
            BadgeEstado(
                texto = if (ventana.abierta) {
                    "Ventana abierta · " + if (ventana.dias_restantes <= 0) "último día" else "quedan ${FormatoUi.plural(ventana.dias_restantes, "día", "días")}"
                } else "Ventana cerrada",
                tono = if (ventana.abierta) TonoEstado.ALERTA else TonoEstado.NEUTRO,
                modifier = Modifier.padding(top = Espacio.m)
            )
        }
    }
}
