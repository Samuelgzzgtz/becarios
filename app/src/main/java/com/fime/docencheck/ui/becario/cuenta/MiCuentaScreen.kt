package com.fime.docencheck.ui.becario.cuenta

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Badge
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Engineering
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Apartment
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.TrendingDown
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fime.docencheck.core.ui.DialogoConfirmacion
import com.fime.docencheck.core.ui.EsqueletoLista
import com.fime.docencheck.core.ui.EstadoError
import com.fime.docencheck.core.ui.UiState
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.core.util.FormatoUi
import com.fime.docencheck.data.model.Perfil
import com.fime.docencheck.ui.theme.AvatarIniciales
import com.fime.docencheck.ui.theme.BadgeEstado
import com.fime.docencheck.ui.theme.BotonCerrarSesion
import com.fime.docencheck.ui.theme.CuadriculaDos
import com.fime.docencheck.ui.theme.Divisor
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.EncabezadoSeccion
import com.fime.docencheck.ui.theme.Espacio
import com.fime.docencheck.ui.theme.FilaInfo
import com.fime.docencheck.ui.theme.IconoCircular
import com.fime.docencheck.ui.theme.PantallaConEncabezado
import com.fime.docencheck.ui.theme.Tarjeta
import com.fime.docencheck.ui.theme.TarjetaIndicador
import com.fime.docencheck.ui.theme.TonoEstado
import com.fime.docencheck.ui.theme.etiqueta
import com.fime.docencheck.ui.theme.tono

@Composable
fun MiCuentaScreen(
    onVolver: (() -> Unit)?,
    onSesionCerrada: () -> Unit,
    onTransferencias: (() -> Unit)? = null
) {
    val app = appActual()
    val viewModel: MiCuentaViewModel = viewModel(
        factory = viewModelFactory {
            initializer { MiCuentaViewModel(app.authRepository, app.equipoRepository, app.asistenciaRepository) }
        }
    )
    val resumenVm: ResumenCuentaViewModel = viewModel(
        factory = viewModelFactory {
            initializer { ResumenCuentaViewModel(app.progresoRepository, app.adminRepository, app.siaseRepository) }
        }
    )
    val estado by viewModel.estado.collectAsState()
    val cierre by viewModel.cierre.collectAsState()
    val resumen by resumenVm.resumen.collectAsState()

    LaunchedEffect(cierre) { if (cierre == CierreSesion.Cerrada) onSesionCerrada() }
    val usuario = (estado as? UiState.Listo)?.datos?.usuario
    LaunchedEffect(usuario?.perfil) { usuario?.perfil?.let(resumenVm::cargar) }

    (cierre as? CierreSesion.ConfirmarConPendientes)?.let { pendientes ->
        DialogoConfirmacion(
            titulo = "Tienes registros sin subir",
            mensaje = "${FormatoUi.plural(pendientes.pendientes, "registro de asistencia no se ha", "registros de asistencia no se han")} podido subir por falta de conexión. " +
                "Si cierras sesión ahora se perderán. Conéctate a internet y espera a que se suban, o confirma para salir de todos modos.",
            textoConfirmar = "Salir y descartarlos",
            destructivo = true,
            onConfirmar = viewModel::confirmarCierreConPendientes,
            onCancelar = viewModel::cancelarCierre
        )
    }

    PantallaConEncabezado(titulo = "Mi cuenta", onVolver = onVolver) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(Espacio.pantalla),
            verticalArrangement = Arrangement.spacedBy(Espacio.entreTarjetas)
        ) {
            when (val actual = estado) {
                is UiState.Cargando -> EsqueletoLista(tarjetas = 2, relleno = androidx.compose.foundation.layout.PaddingValues(0.dp))
                is UiState.Error -> EstadoError(actual.mensaje, viewModel::cargar)
                is UiState.Listo -> {
                    val u = actual.datos.usuario
                    // Encabezado de perfil
                    Tarjeta(Modifier.fillMaxWidth()) {
                        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                            AvatarIniciales(u.nombre, tamano = 80.dp)
                            Text(
                                u.nombre,
                                style = MaterialTheme.typography.titleLarge,
                                color = DocenCheckTema.colores.texto,
                                modifier = Modifier.padding(top = Espacio.m)
                            )
                            BadgeEstado(
                                when (u.perfil) {
                                    Perfil.administrador -> "Administrador general"
                                    else -> u.perfil.etiqueta()
                                },
                                TonoEstado.EXITO,
                                icono = Icons.Rounded.VerifiedUser,
                                modifier = Modifier.padding(top = Espacio.s)
                            )
                        }
                    }

                    // Indicadores por perfil
                    when (u.perfil) {
                        Perfil.ingeniero -> if (resumen.indicadorA != null) {
                            CuadriculaDos(
                                listOf(
                                    { m -> TarjetaIndicador("${resumen.indicadorA}", "Becarios a cargo", Icons.Rounded.Groups, m) },
                                    { m -> TarjetaIndicador("${resumen.indicadorB ?: 0}", "Con ritmo bajo", Icons.Rounded.TrendingDown, m, alerta = (resumen.indicadorB ?: 0) > 0) }
                                )
                            )
                        }
                        Perfil.administrador -> if (resumen.indicadorA != null) {
                            CuadriculaDos(
                                listOf(
                                    { m -> TarjetaIndicador("${resumen.indicadorA}", "Becarios activos", Icons.Rounded.Groups, m) },
                                    { m -> TarjetaIndicador("${resumen.indicadorB ?: 0}", "Supervisores FIME", Icons.Rounded.Engineering, m) }
                                )
                            )
                        }
                        Perfil.becario -> Unit
                    }

                    // Detalles
                    Tarjeta(Modifier.fillMaxWidth()) {
                        EncabezadoSeccion(
                            when (u.perfil) {
                                Perfil.becario -> "Detalles de becario"
                                Perfil.ingeniero -> "Detalles de ingeniero"
                                Perfil.administrador -> "Información institucional"
                            }
                        )
                        FilaInfo(
                            if (u.perfil == Perfil.becario) "Matrícula" else "No. de empleado",
                            icono = Icons.Rounded.Badge,
                            valor = u.matricula
                        )
                        Divisor()
                        FilaInfo("Coordinación", icono = Icons.Rounded.Apartment, valor = u.coordinacion ?: "Sin registrar")
                        if (u.perfil == Perfil.becario) {
                            Divisor()
                            FilaInfo("Ingeniero asignado", icono = Icons.Rounded.Engineering, valor = actual.datos.ingenieroAsignado?.nombre
                                ?: if (actual.datos.ingenieroNoDisponible) "No disponible sin conexión" else "Sin asignar")
                            Divisor()
                            FilaInfo("Estado", icono = Icons.Rounded.VerifiedUser) {
                                BadgeEstado(u.estado.etiqueta(), u.estado.tono())
                            }
                        }
                        Divisor()
                        FilaInfo("Semestre actual", icono = Icons.Rounded.CalendarMonth, valor = resumen.periodo ?: "—")
                    }

                    if (u.perfil == Perfil.ingeniero && onTransferencias != null) {
                        Tarjeta(Modifier.fillMaxWidth(), onClick = onTransferencias) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                IconoCircular(Icons.Rounded.SwapHoriz, tono = TonoEstado.INFO)
                                Column(Modifier.weight(1f).padding(horizontal = Espacio.m)) {
                                    Text("Mis solicitudes de transferencia", style = MaterialTheme.typography.titleSmall, color = DocenCheckTema.colores.texto)
                                    Text("Consulta su estado", style = MaterialTheme.typography.bodySmall, color = DocenCheckTema.colores.textoSecundario)
                                }
                                Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = DocenCheckTema.colores.textoSecundario)
                            }
                        }
                    }
                }
            }

            // Siempre visible, aunque la cuenta no haya cargado (A-12).
            BotonCerrarSesion(
                onClick = viewModel::cerrarSesion,
                cargando = cierre == CierreSesion.EnCurso,
                modifier = Modifier.fillMaxWidth().padding(top = Espacio.s)
            )
            Text(
                "DocenCheck · FIME UANL",
                style = MaterialTheme.typography.bodySmall,
                color = DocenCheckTema.colores.textoSecundario,
                modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = Espacio.s)
            )
        }
    }
}
