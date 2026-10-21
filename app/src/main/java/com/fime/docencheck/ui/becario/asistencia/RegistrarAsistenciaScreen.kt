package com.fime.docencheck.ui.becario.asistencia

import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Login
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.CloudDone
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Face
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.ui.rememberPermisoCamara
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.data.model.TipoAsistencia
import com.fime.docencheck.facial.tomarFotoComoBitmap
import com.fime.docencheck.ui.theme.BotonPrimario
import com.fime.docencheck.ui.theme.BotonSecundario
import com.fime.docencheck.ui.theme.ChipEstadoCamara
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.EstadoGuia
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.GuiaRostro
import com.fime.docencheck.ui.theme.IconoCircular
import com.fime.docencheck.ui.theme.IconoSinConfigurar
import com.fime.docencheck.ui.theme.MarcoCamara
import com.fime.docencheck.ui.theme.PanelPermisoCamara
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.SegmentadoInformativo
import com.fime.docencheck.ui.theme.TonoEstado
import com.fime.docencheck.ui.theme.VistaCamara
import com.fime.docencheck.ui.theme.etiqueta
import com.fime.docencheck.ui.theme.icono
import java.time.Instant
import java.util.concurrent.Executors

@Composable
fun RegistrarAsistenciaScreen(onListo: () -> Unit) {
    val app = appActual()
    val contexto = LocalContext.current

    val viewModel: RegistrarAsistenciaViewModel = viewModel(
        factory = viewModelFactory {
            initializer {
                RegistrarAsistenciaViewModel(
                    contexto.applicationContext,
                    app.sessionManager,
                    app.enrolamientoRepository,
                    app.horarioRepository,
                    app.asistenciaRepository
                )
            }
        }
    )
    val estado by viewModel.estado.collectAsState()
    val infoHoy by viewModel.infoHoy.collectAsState()
    val permiso = rememberPermisoCamara()
    var errorCamara by remember { mutableStateOf(false) }

    val ejecutorCamara = remember { Executors.newSingleThreadExecutor() }
    val captura = remember { ImageCapture.Builder().build() }
    DisposableEffect(Unit) { onDispose { ejecutorCamara.shutdown() } }

    val guia = when (estado) {
        is EstadoRegistro.ListoParaCapturar -> EstadoGuia.BUSCANDO
        is EstadoRegistro.Procesando -> EstadoGuia.VERIFICANDO
        is EstadoRegistro.Exito -> EstadoGuia.EXITO
        is EstadoRegistro.Error -> EstadoGuia.ERROR
    }
    val textoGuia = when (estado) {
        is EstadoRegistro.ListoParaCapturar -> "Centra tu rostro en el óvalo"
        is EstadoRegistro.Procesando -> "Verificando tu rostro…"
        is EstadoRegistro.Exito -> "Identidad verificada"
        is EstadoRegistro.Error -> "No se pudo verificar"
    }

    PantallaConEncabezado(
        titulo = "Registrar asistencia",
        subtitulo = FechaUi.fechaCorta(FechaUi.hoy()),
        onVolver = onListo
    ) { padding ->
        if (!permiso.concedido) {
            PanelPermisoCamara(
                bloqueado = permiso.bloqueado,
                explicacion = "DocenCheck usa la cámara frontal para confirmar que eres tú quien registra la asistencia.",
                onSolicitar = permiso.solicitar,
                onVolver = onListo,
                modifier = Modifier.padding(padding)
            )
            return@PantallaConEncabezado
        }

        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = Espacio.pantalla)) {
            Spacer(Modifier.size(Espacio.l))
            val proximo = infoHoy?.proximoTipo
            SegmentadoInformativo(
                opciones = listOf("Entrada", "Salida"),
                seleccionado = when (proximo) {
                    TipoAsistencia.entrada -> 0
                    TipoAsistencia.salida -> 1
                    null -> -1
                },
                iconos = listOf(Icons.AutoMirrored.Rounded.Login, Icons.AutoMirrored.Rounded.Logout)
            )
            Text(
                "La app elige Entrada o Salida según tus registros de hoy.",
                style = MaterialTheme.typography.bodySmall,
                color = DocenCheckTema.colores.textoSecundario,
                modifier = Modifier.padding(top = Espacio.xs, bottom = Espacio.m)
            )

            MarcoCamara(Modifier.weight(1f)) {
                VistaCamara(
                    selector = CameraSelector.DEFAULT_FRONT_CAMERA,
                    captura = captura,
                    modifier = Modifier.fillMaxSize(),
                    onError = { errorCamara = true }
                )
                GuiaRostro(guia)
                ChipEstadoCamara(
                    estado = guia,
                    texto = if (errorCamara) "No se pudo abrir la cámara" else textoGuia,
                    modifier = Modifier.align(Alignment.TopCenter).padding(top = Espacio.l)
                )
                if (guia == EstadoGuia.BUSCANDO && !errorCamara) {
                    Text(
                        "Buena luz, sin lentes oscuros ni cubrebocas",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.align(Alignment.BottomCenter).padding(Espacio.l)
                    )
                }
            }

            AnimatedContent(
                targetState = estado,
                contentKey = { it::class },
                transitionSpec = { fadeIn() togetherWith fadeOut() },
                label = "panelRegistro"
            ) { actual ->
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(vertical = Espacio.l)
                        .semantics { liveRegion = LiveRegionMode.Polite }
                ) {
                    when (actual) {
                        is EstadoRegistro.Exito -> ResultadoRegistro(
                            icono = if (actual.enCola) Icons.Rounded.CloudDone else Icons.Rounded.CheckCircle,
                            tono = if (actual.enCola) TonoEstado.INFO else TonoEstado.EXITO,
                            titulo = if (actual.enCola) "${actual.tipo.etiqueta()} guardada en el teléfono"
                            else "${actual.tipo.etiqueta()} registrada a las ${FechaUi.hora(Instant.now())}",
                            mensaje = if (actual.enCola) "No hay conexión. Se subirá sola en cuanto vuelva la red." else "Listo, ya quedó en tu historial.",
                            textoPrincipal = "Listo",
                            onPrincipal = onListo
                        )

                        is EstadoRegistro.Error -> ResultadoRegistro(
                            icono = Icons.Rounded.ErrorOutline,
                            tono = TonoEstado.PELIGRO,
                            titulo = "No se registró la asistencia",
                            mensaje = actual.mensaje,
                            textoPrincipal = "Intentar de nuevo",
                            iconoPrincipal = Icons.Rounded.Refresh,
                            onPrincipal = viewModel::reiniciar,
                            textoSecundario = "Volver",
                            onSecundario = onListo
                        )

                        else -> {
                            infoHoy?.let { info ->
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = Espacio.m)) {
                                    Icon(
                                        if (info.modalidadConfigurada) info.modalidad.icono() else IconoSinConfigurar,
                                        contentDescription = null,
                                        tint = DocenCheckTema.colores.textoSecundario,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(Modifier.width(Espacio.s))
                                    // M-13: no se valida ubicación; no insinuarlo.
                                    Text(
                                        if (info.modalidadConfigurada) "Modalidad de hoy: ${info.modalidad.etiqueta()}"
                                        else "Modalidad sin configurar: se registra como presencial",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = DocenCheckTema.colores.textoSecundario
                                    )
                                }
                            }
                            BotonPrimario(
                                texto = when {
                                    actual is EstadoRegistro.Procesando -> "Verificando…"
                                    proximo == TipoAsistencia.salida -> "Registrar salida"
                                    proximo == TipoAsistencia.entrada -> "Registrar entrada"
                                    else -> "Verificar y registrar"
                                },
                                onClick = { viewModel.capturarYRegistrar { captura.tomarFotoComoBitmap(ejecutorCamara) } },
                                cargando = actual is EstadoRegistro.Procesando,
                                habilitado = !errorCamara,
                                icono = Icons.Rounded.Face,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth().padding(top = Espacio.s),
                                horizontalArrangement = androidx.compose.foundation.layout.Arrangement.Center
                            ) {
                                Icon(Icons.Rounded.Lock, contentDescription = null, tint = DocenCheckTema.colores.textoSecundario, modifier = Modifier.size(14.dp))
                                Spacer(Modifier.width(Espacio.xs))
                                Text(
                                    "Se compara con tu biometría en el teléfono; la foto no se guarda.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = DocenCheckTema.colores.textoSecundario
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ResultadoRegistro(
    icono: androidx.compose.ui.graphics.vector.ImageVector,
    tono: TonoEstado,
    titulo: String,
    mensaje: String,
    textoPrincipal: String,
    onPrincipal: () -> Unit,
    iconoPrincipal: androidx.compose.ui.graphics.vector.ImageVector? = null,
    textoSecundario: String? = null,
    onSecundario: (() -> Unit)? = null
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconoCircular(icono, tono = tono, tamano = 48.dp)
        Spacer(Modifier.width(Espacio.m))
        Column(Modifier.weight(1f)) {
            Text(titulo, style = MaterialTheme.typography.titleMedium, color = DocenCheckTema.colores.texto)
            Text(mensaje, style = MaterialTheme.typography.bodyMedium, color = DocenCheckTema.colores.textoSecundario)
        }
    }
    Box(Modifier.size(Espacio.l))
    BotonPrimario(texto = textoPrincipal, onClick = onPrincipal, icono = iconoPrincipal, modifier = Modifier.fillMaxWidth())
    if (textoSecundario != null && onSecundario != null) {
        BotonSecundario(texto = textoSecundario, onClick = onSecundario, modifier = Modifier.fillMaxWidth().padding(top = Espacio.s))
    }
}
