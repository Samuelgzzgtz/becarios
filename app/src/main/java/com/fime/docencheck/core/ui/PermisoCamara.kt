package com.fime.docencheck.core.ui

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * Estado del permiso de cámara (auditoría A-17).
 *  - [concedido]: se puede usar la cámara.
 *  - [bloqueado]: el usuario eligió "No volver a preguntar"; solo se arregla en Ajustes.
 *  - [solicitar]: vuelve a pedir el permiso, o abre los Ajustes de la app si está bloqueado.
 */
class EstadoPermisoCamara(
    val concedido: Boolean,
    val bloqueado: Boolean,
    val solicitar: () -> Unit
)

@Composable
fun rememberPermisoCamara(): EstadoPermisoCamara {
    val contexto = LocalContext.current
    var concedido by remember { mutableStateOf(tienePermiso(contexto)) }
    var yaSePidio by rememberSaveable { mutableStateOf(false) }
    var bloqueado by remember { mutableStateOf(false) }

    val lanzador = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        concedido = ok
        yaSePidio = true
        // Tras una negativa, si el sistema ya no muestra la explicación es que quedó bloqueado.
        bloqueado = !ok && contexto.actividad()?.let {
            !ActivityCompat.shouldShowRequestPermissionRationale(it, Manifest.permission.CAMERA)
        } == true
    }

    // Al volver de Ajustes (o de cualquier otra app), se vuelve a revisar.
    RecargarAlReanudar {
        concedido = tienePermiso(contexto)
        if (concedido) bloqueado = false
    }

    // Primera vez en la pantalla: se pide solo, como antes.
    LaunchedEffect(Unit) {
        if (!concedido && !yaSePidio) lanzador.launch(Manifest.permission.CAMERA)
    }

    return EstadoPermisoCamara(
        concedido = concedido,
        bloqueado = bloqueado,
        solicitar = {
            if (bloqueado) {
                contexto.startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", contexto.packageName, null))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } else {
                lanzador.launch(Manifest.permission.CAMERA)
            }
        }
    )
}

private fun tienePermiso(contexto: Context): Boolean =
    ContextCompat.checkSelfPermission(contexto, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

private tailrec fun Context.actividad(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.actividad()
    else -> null
}
