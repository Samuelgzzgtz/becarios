package com.fime.docencheck.ui.login

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Login
import androidx.compose.material.icons.rounded.AlternateEmail
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.data.model.Usuario
import com.fime.docencheck.ui.theme.AvisoBanner
import com.fime.docencheck.ui.theme.BotonPrimario
import com.fime.docencheck.ui.theme.CampoContrasena
import com.fime.docencheck.ui.theme.CampoTexto
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.LogoDC
import com.fime.docencheck.ui.theme.Neutro0
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TonoEstado

@Composable
fun LoginScreen(onSesionIniciada: (Usuario) -> Unit) {
    val app = appActual()
    val viewModel: LoginViewModel = viewModel(
        factory = viewModelFactory { initializer { LoginViewModel(app.authRepository) } }
    )
    val estado by viewModel.estado.collectAsState()
    val foco = LocalFocusManager.current

    LaunchedEffect(estado.usuarioAutenticado) {
        estado.usuarioAutenticado?.let {
            viewModel.navegacionHecha()
            onSesionIniciada(it)
        }
    }

    // M-14: mientras se revisa la sesión guardada se muestra el splash, no el formulario.
    Crossfade(targetState = estado.verificandoSesion, label = "login") { verificando ->
        if (verificando) {
            PantallaVerificando()
        } else {
            Column(
                Modifier
                    .fillMaxSize()
                    .background(DocenCheckTema.colores.fondo)
                    .imePadding()
                    .verticalScroll(rememberScrollState())
            ) {
                EncabezadoMarca()

                Tarjeta(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Espacio.pantalla)
                        .padding(top = Espacio.xl)
                        .widthIn(max = 480.dp)
                        .align(Alignment.CenterHorizontally),
                    relleno = androidx.compose.foundation.layout.PaddingValues(Espacio.xl)
                ) {
                    Text(
                        "Inicia sesión",
                        style = MaterialTheme.typography.titleLarge,
                        color = DocenCheckTema.colores.texto,
                        modifier = Modifier.semantics { heading() }
                    )
                    Text(
                        "Usa tu correo institucional y tu contraseña.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = DocenCheckTema.colores.textoSecundario,
                        modifier = Modifier.padding(top = Espacio.xs, bottom = Espacio.l)
                    )

                    CampoTexto(
                        valor = estado.email,
                        onCambio = viewModel::onEmailCambia,
                        etiqueta = "Correo institucional",
                        placeholder = "nombre@uanl.edu.mx",
                        icono = Icons.Rounded.AlternateEmail,
                        teclado = KeyboardType.Email,
                        imeAction = ImeAction.Next,
                        onIme = { foco.moveFocus(FocusDirection.Down) }
                    )
                    Spacer(Modifier.height(Espacio.m))
                    CampoContrasena(
                        valor = estado.password,
                        onCambio = viewModel::onPasswordCambia,
                        etiqueta = "Contraseña",
                        icono = Icons.Rounded.Lock,
                        imeAction = ImeAction.Done,
                        onIme = {
                            foco.clearFocus()
                            viewModel.iniciarSesion()
                        }
                    )

                    AnimatedVisibility(
                        visible = estado.error != null,
                        enter = fadeIn() + expandVertically(),
                        exit = fadeOut() + shrinkVertically()
                    ) {
                        AvisoBanner(
                            texto = estado.error.orEmpty(),
                            tono = TonoEstado.PELIGRO,
                            icono = Icons.Rounded.ErrorOutline,
                            modifier = Modifier.padding(top = Espacio.l)
                        )
                    }

                    BotonPrimario(
                        texto = if (estado.cargando) "Entrando…" else "Iniciar sesión",
                        onClick = {
                            foco.clearFocus()
                            viewModel.iniciarSesion()
                        },
                        cargando = estado.cargando,
                        icono = Icons.AutoMirrored.Rounded.Login,
                        modifier = Modifier.fillMaxWidth().padding(top = Espacio.xl)
                    )
                }

                Text(
                    "Te llevamos a tu panel según tu perfil: becario, ingeniero o administración.",
                    style = MaterialTheme.typography.bodySmall,
                    color = DocenCheckTema.colores.textoSecundario,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Espacio.xxl, vertical = Espacio.xl)
                        .navigationBarsPadding()
                )
            }
        }
    }
}

/** Franja verde con el logo: identidad institucional y barra de estado legible. */
@Composable
private fun EncabezadoMarca() {
    val c = DocenCheckTema.colores
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 32.dp, bottomEnd = 32.dp))
            .background(Brush.linearGradient(listOf(c.headerInicio, c.headerFin)))
            .statusBarsPadding()
            .padding(top = Espacio.xxl, bottom = Espacio.xxl),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        LogoDC(tamano = 88.dp, modifier = Modifier.background(Neutro0.copy(alpha = 0.12f), androidx.compose.foundation.shape.CircleShape).padding(6.dp))
        Text(
            "DocenCheck",
            style = MaterialTheme.typography.headlineMedium,
            color = c.sobreHeader,
            modifier = Modifier.padding(top = Espacio.l).semantics { heading() }
        )
        Text(
            "Control de becarios · FIME UANL",
            style = MaterialTheme.typography.bodyMedium,
            color = c.sobreHeaderSecundario
        )
    }
}

@Composable
private fun PantallaVerificando() {
    val c = DocenCheckTema.colores
    Box(
        Modifier
            .fillMaxSize()
            .background(Brush.linearGradient(listOf(c.headerInicio, c.headerFin))),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            LogoDC(tamano = 96.dp)
            Text("DocenCheck", style = MaterialTheme.typography.headlineMedium, color = c.sobreHeader, modifier = Modifier.padding(top = Espacio.l))
            CircularProgressIndicator(color = c.sobreHeader, strokeWidth = 3.dp, modifier = Modifier.padding(top = Espacio.xl))
            Text(
                "Verificando tu sesión…",
                style = MaterialTheme.typography.bodyMedium,
                color = c.sobreHeaderSecundario,
                modifier = Modifier.padding(top = Espacio.m)
            )
        }
    }
}
