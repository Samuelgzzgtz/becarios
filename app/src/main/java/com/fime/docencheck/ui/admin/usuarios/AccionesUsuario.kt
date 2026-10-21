package com.fime.docencheck.ui.admin.usuarios

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Apartment
import androidx.compose.material.icons.rounded.Badge
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PersonOff
import androidx.compose.material.icons.rounded.Restore
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.fime.docencheck.core.ui.DialogoConfirmacion
import com.fime.docencheck.data.model.EstadoUsuario
import com.fime.docencheck.data.model.Usuario
import com.fime.docencheck.ui.theme.AvatarIniciales
import com.fime.docencheck.ui.theme.BadgeEstado
import com.fime.docencheck.ui.theme.BotonDestructivo
import com.fime.docencheck.ui.theme.BotonSecundario
import com.fime.docencheck.ui.theme.CampoTexto
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.SegmentadoControl
import com.fime.docencheck.ui.theme.etiqueta
import com.fime.docencheck.ui.theme.tono

/** Diálogo de confirmación para dar de baja o reactivar (A-13). */
@Composable
internal fun DialogoCambioEstado(cambio: CambioEstadoPendiente?, onConfirmar: () -> Unit, onCancelar: () -> Unit) {
    cambio ?: return
    val baja = cambio.nuevoEstado != EstadoUsuario.activo
    DialogoConfirmacion(
        titulo = if (baja) "Dar de baja a ${cambio.usuario.nombre}" else "Reactivar cuenta",
        mensaje = if (baja) {
            "Ya no podrá iniciar sesión ni registrar asistencia. Su historial se conserva y puedes reactivarlo después."
        } else {
            "${cambio.usuario.nombre} podrá volver a iniciar sesión."
        },
        textoConfirmar = if (baja) "Dar de baja" else "Reactivar",
        icono = if (baja) Icons.Rounded.PersonOff else Icons.Rounded.Restore,
        destructivo = baja,
        onConfirmar = onConfirmar,
        onCancelar = onCancelar
    )
}

/**
 * Edición de datos de un usuario (A-13): nombre, matrícula y coordinación,
 * con validación en línea. Llama a `ListaUsuariosViewModel.editar`.
 */
@Composable
internal fun DialogoEditarUsuario(
    usuario: Usuario,
    onGuardar: (nombre: String, matricula: String, coordinacion: String?) -> Unit,
    onCancelar: () -> Unit
) {
    var nombre by rememberSaveable(usuario.id) { mutableStateOf(usuario.nombre) }
    var matricula by rememberSaveable(usuario.id) { mutableStateOf(usuario.matricula) }
    var coordinacion by rememberSaveable(usuario.id) { mutableStateOf(usuario.coordinacion.orEmpty()) }
    var intento by rememberSaveable { mutableStateOf(false) }
    val errorNombre = if (intento && nombre.isBlank()) "Escribe el nombre" else null
    val errorMatricula = if (intento && matricula.isBlank()) "Escribe la matrícula o número de empleado" else null
    val cambios = nombre.trim() != usuario.nombre || matricula.trim() != usuario.matricula || coordinacion.trim() != usuario.coordinacion.orEmpty()

    DialogoConfirmacion(
        titulo = "Editar datos",
        mensaje = "Los cambios se ven de inmediato en todas las pantallas.",
        icono = Icons.Rounded.Edit,
        textoConfirmar = "Guardar",
        confirmarHabilitado = cambios,
        onConfirmar = {
            intento = true
            if (nombre.isNotBlank() && matricula.isNotBlank()) {
                onGuardar(nombre.trim(), matricula.trim(), coordinacion.trim().ifBlank { null })
            }
        },
        onCancelar = onCancelar,
        contenidoExtra = {
            Column(verticalArrangement = Arrangement.spacedBy(Espacio.s)) {
                CampoTexto(nombre, { nombre = it }, "Nombre completo", icono = Icons.Rounded.Person, error = errorNombre)
                CampoTexto(matricula, { matricula = it }, "Matrícula / No. de empleado", icono = Icons.Rounded.Badge, error = errorMatricula)
                CampoTexto(coordinacion, { coordinacion = it }, "Coordinación (opcional)", icono = Icons.Rounded.Apartment, imeAction = androidx.compose.ui.text.input.ImeAction.Done)
            }
        }
    )
}

/** Encabezado de tarjeta de usuario: avatar, nombre, matrícula y badge de estado. */
@Composable
internal fun EncabezadoUsuario(usuario: Usuario, detalle: String? = null) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        AvatarIniciales(usuario.nombre, tamano = 44.dp)
        Spacer(Modifier.width(Espacio.m))
        Column(Modifier.weight(1f)) {
            Text(usuario.nombre, style = MaterialTheme.typography.titleMedium, color = DocenCheckTema.colores.texto, maxLines = 1)
            Text(
                detalle ?: "Matrícula ${usuario.matricula}",
                style = MaterialTheme.typography.bodySmall,
                color = DocenCheckTema.colores.textoSecundario,
                maxLines = 1
            )
        }
        BadgeEstado(usuario.estado.etiqueta(), usuario.estado.tono())
    }
}

/** Botón Dar de baja / Reactivar según el estado actual de la cuenta. */
@Composable
internal fun BotonCambioEstado(usuario: Usuario, ocupado: Boolean, onBaja: () -> Unit, onReactivar: () -> Unit) {
    if (usuario.estado == EstadoUsuario.activo) {
        BotonDestructivo("Dar de baja", onBaja, habilitado = !ocupado, cargando = ocupado, icono = Icons.Rounded.PersonOff, relleno = false)
    } else {
        BotonSecundario("Reactivar", onReactivar, habilitado = !ocupado, cargando = ocupado, icono = Icons.Rounded.Restore)
    }
}

/** Filtro por estado: Activos / Inactivos / Todos. */
@Composable
internal fun FiltroEstadoUsuarios(actual: EstadoUsuario?, onCambiar: (EstadoUsuario?) -> Unit) {
    val opciones = listOf(EstadoUsuario.activo, EstadoUsuario.inactivo, null)
    SegmentadoControl(
        opciones = listOf("Activos", "Inactivos", "Todos"),
        seleccionado = opciones.indexOf(actual),
        onSeleccionar = { onCambiar(opciones[it]) },
        modifier = Modifier.fillMaxWidth()
    )
}
