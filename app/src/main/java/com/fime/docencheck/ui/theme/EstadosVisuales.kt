package com.fime.docencheck.ui.theme

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Login
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.Business
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.CloudUpload
import androidx.compose.material.icons.rounded.DoNotDisturbOn
import androidx.compose.material.icons.rounded.HelpOutline
import androidx.compose.material.icons.rounded.HourglassEmpty
import androidx.compose.material.icons.rounded.HighlightOff
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.ui.graphics.vector.ImageVector
import com.fime.docencheck.data.model.EstadoReporteSiase
import com.fime.docencheck.data.model.EstadoTransferencia
import com.fime.docencheck.data.model.EstadoUsuario
import com.fime.docencheck.data.model.ModalidadTrabajo
import com.fime.docencheck.data.model.Perfil
import com.fime.docencheck.data.model.TipoAsistencia

/*
 * Una sola fuente de verdad para mostrar enums: etiqueta legible, tono del
 * badge e ícono (auditoría M-03: nunca el valor crudo ni texto sin color).
 */

// ---- Reporte SIASE ----------------------------------------------------------

fun EstadoReporteSiase.etiqueta(): String = when (this) {
    EstadoReporteSiase.pendiente -> "Pendiente"
    EstadoReporteSiase.subido -> "En revisión"
    EstadoReporteSiase.confirmado -> "Confirmado"
    EstadoReporteSiase.excluido -> "Exento"
    EstadoReporteSiase.sin_reporte -> "Sin reporte"
}

fun EstadoReporteSiase.tono(): TonoEstado = when (this) {
    EstadoReporteSiase.pendiente -> TonoEstado.ALERTA
    EstadoReporteSiase.subido -> TonoEstado.INFO
    EstadoReporteSiase.confirmado -> TonoEstado.EXITO
    EstadoReporteSiase.excluido -> TonoEstado.NEUTRO
    EstadoReporteSiase.sin_reporte -> TonoEstado.PELIGRO
}

fun EstadoReporteSiase.icono(): ImageVector = when (this) {
    EstadoReporteSiase.pendiente -> Icons.Rounded.HourglassEmpty
    EstadoReporteSiase.subido -> Icons.Rounded.CloudUpload
    EstadoReporteSiase.confirmado -> Icons.Rounded.CheckCircle
    EstadoReporteSiase.excluido -> Icons.Rounded.DoNotDisturbOn
    EstadoReporteSiase.sin_reporte -> Icons.Rounded.HighlightOff
}

// ---- Transferencias ---------------------------------------------------------

fun EstadoTransferencia.etiqueta(): String = when (this) {
    EstadoTransferencia.pendiente -> "Pendiente"
    EstadoTransferencia.aprobada -> "Aprobada"
    EstadoTransferencia.rechazada -> "Rechazada"
}

fun EstadoTransferencia.tono(): TonoEstado = when (this) {
    EstadoTransferencia.pendiente -> TonoEstado.ALERTA
    EstadoTransferencia.aprobada -> TonoEstado.EXITO
    EstadoTransferencia.rechazada -> TonoEstado.PELIGRO
}

// ---- Usuarios ---------------------------------------------------------------

fun EstadoUsuario.etiqueta(): String = when (this) {
    EstadoUsuario.activo -> "Activo"
    EstadoUsuario.inactivo -> "Inactivo"
    EstadoUsuario.egresado -> "Egresado"
}

fun EstadoUsuario.tono(): TonoEstado = when (this) {
    EstadoUsuario.activo -> TonoEstado.EXITO
    EstadoUsuario.inactivo -> TonoEstado.NEUTRO
    EstadoUsuario.egresado -> TonoEstado.INFO
}

fun Perfil.etiqueta(): String = when (this) {
    Perfil.becario -> "Becario"
    Perfil.ingeniero -> "Ingeniero"
    Perfil.administrador -> "Administrador"
}

// ---- Asistencias ------------------------------------------------------------

fun TipoAsistencia.etiqueta(): String = when (this) {
    TipoAsistencia.entrada -> "Entrada"
    TipoAsistencia.salida -> "Salida"
}

/** Entrada en verde, Salida en ámbar (plan de frontend). */
fun TipoAsistencia.tono(): TonoEstado = when (this) {
    TipoAsistencia.entrada -> TonoEstado.EXITO
    TipoAsistencia.salida -> TonoEstado.ALERTA
}

fun TipoAsistencia.icono(): ImageVector = when (this) {
    TipoAsistencia.entrada -> Icons.AutoMirrored.Rounded.Login
    TipoAsistencia.salida -> Icons.AutoMirrored.Rounded.Logout
}

/** null = día sin configurar / no aplica. */
fun ModalidadTrabajo?.etiqueta(): String = when (this) {
    ModalidadTrabajo.presencial -> "Presencial"
    ModalidadTrabajo.home_office -> "Home office"
    null -> "No aplica"
}

fun ModalidadTrabajo?.icono(): ImageVector = when (this) {
    ModalidadTrabajo.presencial -> Icons.Rounded.Business
    ModalidadTrabajo.home_office -> Icons.Rounded.Home
    null -> Icons.Rounded.Block
}

/** Ícono para "sin configurar" (distinto de "no aplica"). */
val IconoSinConfigurar: ImageVector get() = Icons.Rounded.HelpOutline

val IconoHora: ImageVector get() = Icons.Rounded.Schedule
