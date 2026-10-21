package com.fime.docencheck.ui.ingeniero.enrolamiento

import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Cameraswitch
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.CloudUpload
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.DialogoConfirmacion
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.ui.rememberPermisoCamara
import com.fime.docencheck.facial.tomarFotoComoBitmap
import com.fime.docencheck.ui.theme.AvisoBanner
import com.fime.docencheck.ui.theme.BotonPrimario
import com.fime.docencheck.ui.theme.BotonSecundario
import com.fime.docencheck.ui.theme.ChipEstadoCamara
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.EstadoGuia
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.GuiaRostro
import com.fime.docencheck.ui.theme.IconoCircular
import com.fime.docencheck.ui.theme.MarcoCamara
import com.fime.docencheck.ui.theme.PanelPermisoCamara
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.TonoEstado
import com.fime.docencheck.ui.theme.VistaCamara
import java.util.concurrent.Executors

@Composable
fun EnrolamientoFacialScreen(becarioId: String, onListo: () -> Unit, onVolver: () -> Unit) {
    val app = appActual()
    val contexto = LocalContext.current

    val viewModel: EnrolamientoFacialViewModel = viewModel(
        factory = viewModelFactory {
            initializer {
                EnrolamientoFacialViewModel(contexto.applicationContext, becarioId, app.enrolamientoRepository, app.equipoRepository)
            }
        }
    )
    val estado by viewModel.estado.collectAsState()
    val nombreBecario by viewModel.nombreBecario.collectAsState()
    val tieneBiometria by viewModel.tieneBiometria.collectAsState()
    val fotosValidas by viewModel.fotosValidas.collectAsState()
    val permiso = rememberPermisoCamara()
    // B-10: se puede elegir la cámara; la trasera es cómoda para el ingeniero, la frontal coincide con la de asistencia.
    var frontal by rememberSaveable { mutableStateOf(false) }
    var errorCamara by remember { mutableStateOf(false) }

    val ejecutorCamara = remember { Executors.newSingleThreadExecutor() }
    val captura = remember { ImageCapture.Builder().build() }
    DisposableEffect(Unit) { onDispose { ejecutorCamara.shutdown() } }

    if (estado is EstadoEnrolamiento.ConfirmarReemplazo) {
        DialogoConfirmacion(
            titulo = "Reemplazar biometría",
            mensaje = "${nombreBecario ?: "Este becario"} ya tiene biometría registrada. Si continúas, la anterior dejará de usarse y se usará la nueva.",
            textoConfirmar = "Reemplazar",
            destructivo = true,
            onConfirmar = viewModel::confirmarReemplazo,
            onCancelar = viewModel::cancelarReemplazo
        )
    }

    val guia = when (estado) {
        is EstadoEnrolamiento.Capturando -> EstadoGuia.BUSCANDO
        is EstadoEnrolamiento.Procesando, is EstadoEnrolamiento.Guardando -> EstadoGuia.VERIFICANDO
        is EstadoEnrolamiento.Guardado -> EstadoGuia.EXITO
        is EstadoEnrolamiento.Error -> EstadoGuia.ERROR
        is EstadoEnrolamiento.ConfirmarReemplazo -> EstadoGuia.EXITO
    }

    PantallaConEncabezado(
        titulo = "Enrolamiento facial",
        subtitulo = nombreBecario?.let { "Becario: $it" },
        onVolver = onVolver
    ) { padding ->
        if (!permiso.concedido) {
            PanelPermisoCamara(
                bloqueado = permiso.bloqueado,
                explicacion = "Para enrolar al becario hay que tomarle 5 fotos del rostro. Con ellas se calcula su biometría.",
                onSolicitar = permiso.solicitar,
                onVolver = onVolver,
                modifier = Modifier.padding(padding)
            )
            return@PantallaConEncabezado
        }

        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = Espacio.pantalla)) {
            Spacer(Modifier.size(Espacio.m))
            if (tieneBiometria == true && estado is EstadoEnrolamiento.Capturando) {
                AvisoBanner(
                    texto = "Este becario ya tiene biometría; al terminar se reemplazará.",
                    tono = TonoEstado.ALERTA,
                    icono = Icons.Rounded.WarningAmber,
                    modifier = Modifier.padding(bottom = Espacio.m)
                )
            }

            MarcoCamara(Modifier.weight(1f)) {
                VistaCamara(
                    selector = if (frontal) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA,
                    captura = captura,
                    modifier = Modifier.fillMaxSize(),
                    onError = { errorCamara = true }
                )
                GuiaRostro(guia)
                ChipEstadoCamara(
                    estado = guia,
                    texto = when {
                        errorCamara -> "No se pudo abrir la cámara"
                        estado is EstadoEnrolamiento.Procesando -> "Analizando la foto…"
                        estado is EstadoEnrolamiento.Guardando -> "Guardando biometría…"
                        estado is EstadoEnrolamiento.Guardado -> "Biometría guardada"
                        estado is EstadoEnrolamiento.Error -> "Revisa el mensaje"
                        else -> "Centra el rostro en el óvalo"
                    },
                    modifier = Modifier.align(Alignment.TopCenter).padding(top = Espacio.l)
                )
                FilledTonalIconButton(
                    onClick = { errorCamara = false; frontal = !frontal },
                    modifier = Modifier.align(Alignment.BottomEnd).padding(Espacio.m),
                    colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = Color.Black.copy(alpha = 0.55f), contentColor = Color.White)
                ) {
                    Icon(Icons.Rounded.Cameraswitch, contentDescription = if (frontal) "Usar cámara trasera" else "Usar cámara frontal")
                }
            }

            Column(Modifier.fillMaxWidth().padding(vertical = Espacio.l)) {
                // Conteo real de fotos válidas: antes un error de foto mostraba "5 de 5" y
                // mientras se analizaba una foto, "0 de 5".
                IndicadorFotos(listas = fotosValidas)
                when (val actual = estado) {
                    is EstadoEnrolamiento.Guardado -> Resultado(
                        icono = Icons.Rounded.CheckCircle,
                        tono = TonoEstado.EXITO,
                        titulo = if (actual.reemplazo) "Biometría reemplazada" else "Biometría guardada",
                        mensaje = "${nombreBecario ?: "El becario"} ya puede registrar su asistencia con el rostro."
                    ) {
                        BotonPrimario("Listo", onListo, modifier = Modifier.fillMaxWidth())
                    }

                    is EstadoEnrolamiento.Error -> Resultado(
                        icono = Icons.Rounded.ErrorOutline,
                        tono = TonoEstado.PELIGRO,
                        titulo = if (actual.puedeReintentarGuardado) "No se pudo guardar" else "Foto no válida",
                        mensaje = actual.mensaje
                    ) {
                        BotonPrimario(
                            texto = if (actual.puedeReintentarGuardado) "Reintentar guardado" else "Tomar la foto de nuevo",
                            onClick = if (actual.puedeReintentarGuardado) viewModel::reintentarGuardado else viewModel::reintentarCaptura,
                            icono = if (actual.puedeReintentarGuardado) Icons.Rounded.CloudUpload else Icons.Rounded.Refresh,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    else -> {
                        val listas = (actual as? EstadoEnrolamiento.Capturando)?.fotosListas ?: 0
                        Text(
                            if (actual is EstadoEnrolamiento.Guardando) "Guardando las $CAPTURAS_REQUERIDAS fotos…"
                            else "Foto ${(listas + 1).coerceAtMost(CAPTURAS_REQUERIDAS)} de $CAPTURAS_REQUERIDAS. Pide al becario que mire a la cámara; varía un poco el ángulo entre fotos.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = DocenCheckTema.colores.textoSecundario,
                            modifier = Modifier.padding(vertical = Espacio.m)
                        )
                        BotonPrimario(
                            texto = when (actual) {
                                is EstadoEnrolamiento.Procesando -> "Analizando…"
                                is EstadoEnrolamiento.Guardando -> "Guardando…"
                                else -> "Capturar foto"
                            },
                            onClick = { viewModel.capturarYProcesar { captura.tomarFotoComoBitmap(ejecutorCamara) } },
                            cargando = actual is EstadoEnrolamiento.Procesando || actual is EstadoEnrolamiento.Guardando,
                            habilitado = actual is EstadoEnrolamiento.Capturando && !errorCamara,
                            icono = Icons.Rounded.CameraAlt,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }
        }
    }
}

/** Puntos 1–5: cuántas fotos válidas lleva (M-08). */
@Composable
private fun IndicadorFotos(listas: Int) {
    val c = DocenCheckTema.colores
    Row(
        Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) { contentDescription = "$listas de $CAPTURAS_REQUERIDAS fotos tomadas" },
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        repeat(CAPTURAS_REQUERIDAS) { i ->
            val lleno = i < listas
            val color by animateColorAsState(if (lleno) MaterialTheme.colorScheme.primary else c.pistaProgreso, label = "punto")
            Box(
                Modifier
                    .padding(horizontal = Espacio.xs)
                    .size(if (i == listas) 14.dp else 10.dp)
                    .background(color, CircleShape)
            )
        }
    }
}

@Composable
private fun Resultado(
    icono: androidx.compose.ui.graphics.vector.ImageVector,
    tono: TonoEstado,
    titulo: String,
    mensaje: String,
    acciones: @Composable () -> Unit
) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = Espacio.m)) {
        IconoCircular(icono, tono = tono, tamano = 48.dp)
        Spacer(Modifier.width(Espacio.m))
        Column(Modifier.weight(1f)) {
            Text(titulo, style = MaterialTheme.typography.titleMedium, color = DocenCheckTema.colores.texto)
            Text(mensaje, style = MaterialTheme.typography.bodyMedium, color = DocenCheckTema.colores.textoSecundario)
        }
    }
    acciones()
}

@Suppress("unused")
@Composable
private fun BotonVolver(onVolver: () -> Unit) = BotonSecundario("Volver", onVolver, modifier = Modifier.fillMaxWidth())
