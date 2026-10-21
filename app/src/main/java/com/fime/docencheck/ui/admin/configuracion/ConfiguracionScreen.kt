package com.fime.docencheck.ui.admin.configuracion

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.EmojiEvents
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.ContenidoSegunEstado
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.ui.theme.AvisoBanner
import com.fime.docencheck.ui.theme.BotonPrimario
import com.fime.docencheck.ui.theme.CampoTexto
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.EncabezadoSeccion
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TonoEstado

@Composable
fun ConfiguracionScreen(onVolver: () -> Unit) {
    val app = appActual()
    val viewModel: ConfiguracionViewModel = viewModel(
        factory = viewModelFactory { initializer { ConfiguracionViewModel(app.adminRepository) } }
    )
    val estado by viewModel.estado.collectAsState()
    val foco = LocalFocusManager.current
    val formulario = (estado as? UiState.Listo)?.datos

    PantallaConEncabezado(
        titulo = "Configuración",
        subtitulo = "Metas de horas y ventana SIASE",
        onVolver = onVolver,
        barraAccion = formulario?.let { f ->
            {
                BotonPrimario(
                    texto = "Guardar cambios",
                    onClick = { foco.clearFocus(); viewModel.guardar() },
                    cargando = f.guardando,
                    icono = Icons.Rounded.Save,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    ) { padding ->
        ContenidoSegunEstado(estado, viewModel::cargar, modifier = Modifier.padding(padding).consumeWindowInsets(padding)) { f ->
            val err = f.erroresCampo
            val siguiente: () -> Unit = { foco.moveFocus(FocusDirection.Down) }
            Column(
                Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(Espacio.pantalla),
                verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
            ) {
                AnimatedVisibility(visible = f.mensaje != null) {
                    AvisoBanner(
                        texto = f.mensaje.orEmpty(),
                        tono = if (f.mensajeEsExito) TonoEstado.EXITO else TonoEstado.PELIGRO,
                        icono = if (f.mensajeEsExito) Icons.Rounded.CheckCircle else Icons.Rounded.ErrorOutline
                    )
                }
                Tarjeta(Modifier.fillMaxWidth()) {
                    EncabezadoSeccion("Metas requeridas", icono = Icons.Rounded.EmojiEvents)
                    Text(
                        "Horas que cada becario debe cumplir. Acepta decimales (20.5 o 20,5).",
                        style = MaterialTheme.typography.bodySmall,
                        color = DocenCheckTema.colores.textoSecundario,
                        modifier = Modifier.padding(bottom = Espacio.s)
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(Espacio.s)) {
                        CampoHoras(f.metaSemanal, viewModel::cambiarMetaSemanal, "Meta semanal", err[CampoConfiguracion.META_SEMANAL], siguiente)
                        CampoHoras(f.metaMensual, viewModel::cambiarMetaMensual, "Meta mensual", err[CampoConfiguracion.META_MENSUAL], siguiente)
                        CampoHoras(f.metaSemestral, viewModel::cambiarMetaSemestral, "Meta semestral", err[CampoConfiguracion.META_SEMESTRAL], siguiente)
                    }
                }
                Tarjeta(Modifier.fillMaxWidth()) {
                    EncabezadoSeccion("Ventana SIASE", icono = Icons.Rounded.CalendarMonth)
                    Text(
                        "Días del mes en que los becarios pueden subir su reporte.",
                        style = MaterialTheme.typography.bodySmall,
                        color = DocenCheckTema.colores.textoSecundario,
                        modifier = Modifier.padding(bottom = Espacio.s)
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(Espacio.m)) {
                        CampoTexto(
                            f.diaApertura, viewModel::cambiarDiaApertura, "Abre el día",
                            error = err[CampoConfiguracion.DIA_APERTURA], teclado = KeyboardType.Number,
                            onIme = siguiente, modifier = Modifier.weight(1f)
                        )
                        CampoTexto(
                            f.diaCierre, viewModel::cambiarDiaCierre, "Cierra el día",
                            error = err[CampoConfiguracion.DIA_CIERRE], teclado = KeyboardType.Number,
                            imeAction = ImeAction.Done, onIme = { foco.clearFocus() }, modifier = Modifier.weight(1f)
                        )
                    }
                    val a = f.diaApertura.trim().toIntOrNull()
                    val c = f.diaCierre.trim().toIntOrNull()
                    if (a != null && c != null && a in 1..31 && c in 1..31 && a <= c) {
                        Text(
                            "Los becarios podrán entregar del día $a al $c de cada mes.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = DocenCheckTema.colores.texto,
                            modifier = Modifier.padding(top = Espacio.s)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CampoHoras(valor: String, onCambio: (String) -> Unit, etiqueta: String, error: String?, onIme: () -> Unit) {
    CampoTexto(
        valor = valor,
        onCambio = onCambio,
        etiqueta = etiqueta,
        error = error,
        teclado = KeyboardType.Decimal,
        onIme = onIme,
        finalCampo = { Text("h", style = MaterialTheme.typography.bodyLarge, color = DocenCheckTema.colores.textoSecundario, modifier = Modifier.padding(end = Espacio.l)) }
    )
}
