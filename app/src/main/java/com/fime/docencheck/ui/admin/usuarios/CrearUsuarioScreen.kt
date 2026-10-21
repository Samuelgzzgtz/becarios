package com.fime.docencheck.ui.admin.usuarios

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AlternateEmail
import androidx.compose.material.icons.rounded.Apartment
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Badge
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PersonAdd
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.data.model.Perfil
import com.fime.docencheck.ui.theme.AvisoBanner
import com.fime.docencheck.ui.theme.BotonPrimario
import com.fime.docencheck.ui.theme.CampoContrasena
import com.fime.docencheck.ui.theme.CampoTexto
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.EncabezadoSeccion
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TonoEstado
import java.security.SecureRandom

private val FORMATO_CORREO_UI = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

/** Contraseña temporal legible para dictarla (sin 0/O ni 1/l). */
private fun generarContrasena(): String {
    val letras = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
    val azar = SecureRandom()
    return (1..10).map { letras[azar.nextInt(letras.length)] }.joinToString("")
}

@Composable
fun CrearUsuarioScreen(
    perfil: Perfil,
    onVolver: () -> Unit,
    /** Al crear: regresa con un aviso "Cuenta creada" (B-07). */
    onCreado: (String) -> Unit = { onVolver() }
) {
    val app = appActual()
    val viewModel: CrearUsuarioViewModel = viewModel(
        factory = viewModelFactory { initializer { CrearUsuarioViewModel(perfil, app.adminRepository) } }
    )
    val estado by viewModel.estado.collectAsState()
    val foco = LocalFocusManager.current
    var intento by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(estado.guardado) { if (estado.guardado) onCreado("Cuenta de ${estado.nombre.trim()} creada") }

    val esIngeniero = perfil == Perfil.ingeniero
    // Validación en línea: se muestra al intentar guardar (mismas reglas que el ViewModel).
    val errNombre = if (intento && estado.nombre.isBlank()) "Escribe el nombre completo" else null
    val errMatricula = if (intento && estado.matricula.isBlank()) (if (esIngeniero) "Escribe el número de empleado" else "Escribe la matrícula") else null
    val errCorreo = when {
        !intento -> null
        estado.email.isBlank() -> "Escribe el correo"
        !FORMATO_CORREO_UI.matches(estado.email.trim()) -> "El correo no tiene un formato válido"
        else -> null
    }
    val errPassword = if (intento && estado.password.length < 6) "Mínimo 6 caracteres" else null

    val guardar = {
        intento = true
        foco.clearFocus()
        viewModel.guardar()
    }

    PantallaConEncabezado(
        titulo = if (esIngeniero) "Nuevo ingeniero" else "Nuevo becario",
        subtitulo = "Crea la cuenta de acceso",
        onVolver = onVolver,
        barraAccion = {
            BotonPrimario(
                texto = "Crear cuenta",
                onClick = guardar,
                cargando = estado.guardando,
                icono = Icons.Rounded.PersonAdd,
                modifier = Modifier.fillMaxWidth()
            )
        }
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .consumeWindowInsets(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(Espacio.pantalla),
            verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
        ) {
            Tarjeta(Modifier.fillMaxWidth()) {
                EncabezadoSeccion("Datos personales")
                Column(verticalArrangement = Arrangement.spacedBy(Espacio.s), modifier = Modifier.padding(top = Espacio.s)) {
                    CampoTexto(estado.nombre, viewModel::cambiarNombre, "Nombre completo", icono = Icons.Rounded.Person, error = errNombre)
                    CampoTexto(
                        estado.matricula, viewModel::cambiarMatricula,
                        if (esIngeniero) "Número de empleado" else "Matrícula",
                        icono = Icons.Rounded.Badge, error = errMatricula,
                        teclado = KeyboardType.Ascii
                    )
                    CampoTexto(
                        estado.coordinacion, viewModel::cambiarCoordinacion, "Coordinación (opcional)",
                        icono = Icons.Rounded.Apartment, ayuda = "Ejemplo: Coordinación de Sistemas"
                    )
                }
            }
            Tarjeta(Modifier.fillMaxWidth()) {
                EncabezadoSeccion("Acceso")
                Column(verticalArrangement = Arrangement.spacedBy(Espacio.s), modifier = Modifier.padding(top = Espacio.s)) {
                    CampoTexto(
                        estado.email, viewModel::cambiarEmail, "Correo institucional",
                        icono = Icons.Rounded.AlternateEmail, error = errCorreo,
                        teclado = KeyboardType.Email, placeholder = "nombre@uanl.edu.mx"
                    )
                    CampoContrasena(
                        estado.password, viewModel::cambiarPassword, "Contraseña temporal",
                        icono = Icons.Rounded.Key, error = errPassword,
                        ayuda = "Compártela con la persona; mínimo 6 caracteres.",
                        imeAction = ImeAction.Done,
                        onIme = { guardar() },
                        visibleInicial = true
                    )
                    TextButton(onClick = { viewModel.cambiarPassword(generarContrasena()) }) {
                        androidx.compose.material3.Icon(Icons.Rounded.AutoAwesome, contentDescription = null)
                        Text("  Generar contraseña segura")
                    }
                }
            }
            estado.error?.let { AvisoBanner(it, TonoEstado.PELIGRO, icono = Icons.Rounded.ErrorOutline) }
            Text(
                "La persona podrá entrar de inmediato con su correo y esta contraseña.",
                style = MaterialTheme.typography.bodySmall,
                color = DocenCheckTema.colores.textoSecundario
            )
        }
    }
}
