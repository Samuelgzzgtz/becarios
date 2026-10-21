package com.fime.docencheck.navigation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.navigation.NamedNavArgument
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.ui.CargandoCentrado
import com.fime.docencheck.core.ui.appActual
import com.fime.docencheck.data.model.Perfil
import com.fime.docencheck.data.model.Usuario
import com.fime.docencheck.ui.admin.configuracion.ConfiguracionScreen
import com.fime.docencheck.ui.admin.exportar.ExportarScreen
import com.fime.docencheck.ui.admin.mas.MasAdminScreen
import com.fime.docencheck.ui.admin.panel.PanelGeneralScreen
import com.fime.docencheck.ui.admin.reportes.ReporteHorasGlobalScreen
import com.fime.docencheck.ui.admin.reportes.ReportesSiaseLoteScreen
import com.fime.docencheck.ui.admin.semestres.GestionSemestresScreen
import com.fime.docencheck.ui.admin.transferencias.TransferenciasAdminScreen
import com.fime.docencheck.ui.admin.usuarios.AsignarIngenieroScreen
import com.fime.docencheck.ui.admin.usuarios.BecariosScreen
import com.fime.docencheck.ui.admin.usuarios.CrearUsuarioScreen
import com.fime.docencheck.ui.admin.usuarios.IngenierosScreen
import com.fime.docencheck.ui.becario.asistencia.RegistrarAsistenciaScreen
import com.fime.docencheck.ui.becario.consulta.ConsultaAsistenciasScreen
import com.fime.docencheck.ui.becario.cuenta.MiCuentaScreen
import com.fime.docencheck.ui.becario.home.HomeScreen
import com.fime.docencheck.ui.becario.reportehoras.ReporteHorasScreen
import com.fime.docencheck.ui.becario.siase.ReporteSiaseScreen
import com.fime.docencheck.ui.ingeniero.asistencias.ConsultaBecarioScreen
import com.fime.docencheck.ui.ingeniero.asistencias.ConsultaEquipoScreen
import com.fime.docencheck.ui.ingeniero.becarios.MisBecariosScreen
import com.fime.docencheck.ui.ingeniero.dashboard.DashboardScreen
import com.fime.docencheck.ui.ingeniero.enrolamiento.EnrolamientoFacialScreen
import com.fime.docencheck.ui.ingeniero.modalidad.ConfigurarModalidadScreen
import com.fime.docencheck.ui.ingeniero.siase.ReportesSiaseEquipoScreen
import com.fime.docencheck.ui.ingeniero.transferencia.SolicitarTransferenciaScreen
import com.fime.docencheck.ui.ingeniero.transferencia.TransferenciasScreen
import com.fime.docencheck.ui.login.LoginScreen
import com.fime.docencheck.ui.theme.BarraNavegacion
import com.fime.docencheck.ui.theme.DestinoNav

private val SOLO_BECARIO = setOf(Perfil.becario)
private val SOLO_INGENIERO = setOf(Perfil.ingeniero)
private val SOLO_ADMIN = setOf(Perfil.administrador)

/**
 * Grafo de la app. La barra inferior vive FUERA del NavHost (no se anima ni
 * parpadea al cambiar de pestaña) y solo aparece en los destinos principales
 * de cada perfil; las pantallas secundarias muestran "Volver" en el header.
 */
@Composable
fun DocenCheckNavGraph(navController: NavHostController = rememberNavController()) {
    val alSalir: () -> Unit = {
        navController.navigate(Rutas.LOGIN) { popUpTo(0) { inclusive = true } }
        // irAPestana guarda el estado de cada pestaña (saveState/restoreState). Sin
        // esto, el siguiente usuario que entra en el teléfono heredaba los ViewModels
        // de la sesión anterior (filtros, becario elegido, etc.).
        (DESTINOS_BECARIO + DESTINOS_INGENIERO + DESTINOS_ADMIN).forEach { navController.clearBackStack(it.ruta) }
    }
    val volver: () -> Unit = { navController.popBackStack() }
    val pestana: (String) -> Unit = { navController.irAPestana(it) }

    val entrada by navController.currentBackStackEntryAsState()
    val rutaActual = entrada?.destination?.route
    val destinos = destinosPara(rutaActual)
    // Se recuerdan los últimos destinos para que la barra salga con animación.
    val memoria = remember { arrayOf<List<DestinoNav>>(emptyList()) }
    if (destinos != null) memoria[0] = destinos
    val ultimosDestinos = memoria[0]

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        bottomBar = {
            AnimatedVisibility(
                visible = destinos != null,
                enter = slideInVertically { it } + fadeIn(),
                exit = slideOutVertically { it } + fadeOut()
            ) {
                BarraNavegacion(ultimosDestinos, rutaActual) { navController.irAPestana(it.ruta) }
            }
        }
    ) { relleno ->
        NavHost(
            navController = navController,
            startDestination = Rutas.LOGIN,
            modifier = Modifier.padding(relleno).consumeWindowInsets(relleno)
        ) {

            composable(Rutas.LOGIN) {
                LoginScreen(onSesionIniciada = { usuario -> irSegunPerfil(navController, usuario) })
            }

            // ---------------------------------------------------------------
            // Becario: Inicio · Horas · Registros · SIASE · Cuenta
            // ---------------------------------------------------------------
            protegida(Rutas.BECARIO_HOME, SOLO_BECARIO, alSalir) {
                HomeScreen(
                    onRegistrarAsistencia = { navController.navigate(Rutas.BECARIO_REGISTRAR_ASISTENCIA) },
                    onReporteHoras = { pestana(Rutas.BECARIO_REPORTE_HORAS) },
                    onConsultaAsistencias = { pestana(Rutas.BECARIO_CONSULTA_ASISTENCIAS) },
                    onReporteSiase = { pestana(Rutas.BECARIO_REPORTE_SIASE) },
                    onMiCuenta = { pestana(Rutas.BECARIO_MI_CUENTA) }
                )
            }

            protegida(Rutas.BECARIO_REGISTRAR_ASISTENCIA, SOLO_BECARIO, alSalir) {
                RegistrarAsistenciaScreen(onListo = volver)
            }

            protegida(Rutas.BECARIO_REPORTE_HORAS, SOLO_BECARIO, alSalir) {
                ReporteHorasScreen(onVolver = null)
            }

            protegida(Rutas.BECARIO_CONSULTA_ASISTENCIAS, SOLO_BECARIO, alSalir) {
                ConsultaAsistenciasScreen(onVolver = null)
            }

            protegida(Rutas.BECARIO_REPORTE_SIASE, SOLO_BECARIO, alSalir) {
                ReporteSiaseScreen(onVolver = null)
            }

            protegida(Rutas.BECARIO_MI_CUENTA, SOLO_BECARIO, alSalir) {
                MiCuentaScreen(onVolver = null, onSesionCerrada = alSalir)
            }

            // ---------------------------------------------------------------
            // Ingeniero: Inicio · Becarios · Asistencias · SIASE · Cuenta
            // ---------------------------------------------------------------
            protegida(Rutas.INGENIERO_DASHBOARD, SOLO_INGENIERO, alSalir) {
                DashboardScreen(
                    onMisBecarios = { pestana(Rutas.INGENIERO_MIS_BECARIOS) },
                    onReportesSiase = { pestana(Rutas.INGENIERO_REPORTES_SIASE) },
                    onTransferencias = { navController.navigate(Rutas.INGENIERO_TRANSFERENCIAS) },
                    onMiCuenta = { pestana(Rutas.INGENIERO_MI_CUENTA) },
                    onConsultaEquipo = { pestana(Rutas.INGENIERO_CONSULTA_EQUIPO) },
                    onBecario = { becarioId -> navController.navigate(Rutas.consultaBecario(becarioId)) }
                )
            }

            protegida(Rutas.INGENIERO_MIS_BECARIOS, SOLO_INGENIERO, alSalir) { entrada ->
                val avisos = remember(entrada) { entrada.avisosAlVolver() }
                MisBecariosScreen(
                    onVolver = null,
                    onEnrolar = { becarioId -> navController.navigate(Rutas.enrolamiento(becarioId)) },
                    onModalidad = { becarioId -> navController.navigate(Rutas.modalidad(becarioId)) },
                    onTransferir = { becarioId -> navController.navigate(Rutas.solicitarTransferencia(becarioId)) },
                    onConsultarAsistencias = { becarioId -> navController.navigate(Rutas.consultaBecario(becarioId)) },
                    onVerTransferencias = { navController.navigate(Rutas.INGENIERO_TRANSFERENCIAS) },
                    avisosExternos = avisos
                )
            }

            protegida(Rutas.INGENIERO_CONSULTA_EQUIPO, SOLO_INGENIERO, alSalir) {
                ConsultaEquipoScreen(onBecario = { becarioId -> navController.navigate(Rutas.consultaBecario(becarioId)) })
            }

            protegida(Rutas.INGENIERO_MI_CUENTA, SOLO_INGENIERO, alSalir) {
                MiCuentaScreen(
                    onVolver = null,
                    onSesionCerrada = alSalir,
                    onTransferencias = { navController.navigate(Rutas.INGENIERO_TRANSFERENCIAS) }
                )
            }

            protegida(Rutas.INGENIERO_ENROLAMIENTO, SOLO_INGENIERO, alSalir, listOf(argBecario())) { entrada ->
                val becarioId = entrada.arguments?.getString(Rutas.ARG_BECARIO_ID) ?: return@protegida
                EnrolamientoFacialScreen(becarioId = becarioId, onListo = volver, onVolver = volver)
            }

            protegida(Rutas.INGENIERO_MODALIDAD, SOLO_INGENIERO, alSalir, listOf(argBecario())) { entrada ->
                val becarioId = entrada.arguments?.getString(Rutas.ARG_BECARIO_ID) ?: return@protegida
                ConfigurarModalidadScreen(becarioId = becarioId, onVolver = volver)
            }

            protegida(Rutas.INGENIERO_SOLICITAR_TRANSFERENCIA, SOLO_INGENIERO, alSalir, listOf(argBecario())) { entrada ->
                val becarioId = entrada.arguments?.getString(Rutas.ARG_BECARIO_ID) ?: return@protegida
                SolicitarTransferenciaScreen(
                    becarioId = becarioId,
                    onVolver = volver,
                    onEnviada = navController::volverConAviso
                )
            }

            protegida(Rutas.INGENIERO_CONSULTA_BECARIO, SOLO_INGENIERO, alSalir, listOf(argBecario())) { entrada ->
                val becarioId = entrada.arguments?.getString(Rutas.ARG_BECARIO_ID) ?: return@protegida
                ConsultaBecarioScreen(becarioId = becarioId, onVolver = volver)
            }

            protegida(Rutas.INGENIERO_REPORTES_SIASE, SOLO_INGENIERO, alSalir) {
                ReportesSiaseEquipoScreen(onVolver = null)
            }

            protegida(Rutas.INGENIERO_TRANSFERENCIAS, SOLO_INGENIERO, alSalir) {
                TransferenciasScreen(onVolver = volver, onIrABecarios = { pestana(Rutas.INGENIERO_MIS_BECARIOS) })
            }

            // ---------------------------------------------------------------
            // Administrador: Inicio · Becarios · Ingenieros · Traspasos · Más
            // ---------------------------------------------------------------
            protegida(Rutas.ADMIN_PANEL, SOLO_ADMIN, alSalir) { entrada ->
                val avisos = remember(entrada) { entrada.avisosAlVolver() }
                PanelGeneralScreen(
                    onSemestres = { navController.navigate(Rutas.ADMIN_SEMESTRES) },
                    onIngenieros = { pestana(Rutas.ADMIN_INGENIEROS) },
                    onBecarios = { pestana(Rutas.ADMIN_BECARIOS) },
                    onTransferencias = { pestana(Rutas.ADMIN_TRANSFERENCIAS) },
                    onReporteHorasGlobal = { navController.navigate(Rutas.ADMIN_REPORTE_HORAS_GLOBAL) },
                    onReportesSiase = { navController.navigate(Rutas.ADMIN_REPORTES_SIASE_LOTE) },
                    onConfiguracion = { navController.navigate(Rutas.ADMIN_CONFIGURACION) },
                    onExportar = { navController.navigate(Rutas.ADMIN_EXPORTAR) },
                    onMiCuenta = { navController.navigate(Rutas.ADMIN_MI_CUENTA) },
                    avisosExternos = avisos
                )
            }

            protegida(Rutas.ADMIN_MAS, SOLO_ADMIN, alSalir) { entrada ->
                val avisos = remember(entrada) { entrada.avisosAlVolver() }
                MasAdminScreen(
                    onReportesSiase = { navController.navigate(Rutas.ADMIN_REPORTES_SIASE_LOTE) },
                    onSemestres = { navController.navigate(Rutas.ADMIN_SEMESTRES) },
                    onReporteHorasGlobal = { navController.navigate(Rutas.ADMIN_REPORTE_HORAS_GLOBAL) },
                    onConfiguracion = { navController.navigate(Rutas.ADMIN_CONFIGURACION) },
                    onExportar = { navController.navigate(Rutas.ADMIN_EXPORTAR) },
                    onMiCuenta = { navController.navigate(Rutas.ADMIN_MI_CUENTA) },
                    avisosExternos = avisos
                )
            }

            protegida(Rutas.ADMIN_MI_CUENTA, SOLO_ADMIN, alSalir) {
                MiCuentaScreen(onVolver = volver, onSesionCerrada = alSalir)
            }

            protegida(Rutas.ADMIN_SEMESTRES, SOLO_ADMIN, alSalir) {
                GestionSemestresScreen(onVolver = volver, onTerminado = navController::volverConAviso)
            }

            protegida(Rutas.ADMIN_INGENIEROS, SOLO_ADMIN, alSalir) { entrada ->
                val avisos = remember(entrada) { entrada.avisosAlVolver() }
                IngenierosScreen(
                    onVolver = null,
                    onNuevo = { navController.navigate(Rutas.crearUsuario(Perfil.ingeniero.name)) },
                    avisosExternos = avisos
                )
            }

            protegida(Rutas.ADMIN_BECARIOS, SOLO_ADMIN, alSalir) { entrada ->
                val avisos = remember(entrada) { entrada.avisosAlVolver() }
                BecariosScreen(
                    onVolver = null,
                    onNuevo = { navController.navigate(Rutas.crearUsuario(Perfil.becario.name)) },
                    onAsignar = { becarioId -> navController.navigate(Rutas.asignarIngeniero(becarioId)) },
                    avisosExternos = avisos
                )
            }

            protegida(
                Rutas.ADMIN_CREAR_USUARIO,
                SOLO_ADMIN,
                alSalir,
                listOf(navArgument(Rutas.ARG_PERFIL) { type = NavType.StringType })
            ) { entrada ->
                val perfil = entrada.arguments?.getString(Rutas.ARG_PERFIL)
                    ?.let { nombre -> Perfil.entries.firstOrNull { it.name == nombre } }
                    ?: Perfil.becario
                CrearUsuarioScreen(perfil = perfil, onVolver = volver, onCreado = navController::volverConAviso)
            }

            protegida(Rutas.ADMIN_ASIGNAR_INGENIERO, SOLO_ADMIN, alSalir, listOf(argBecario())) { entrada ->
                val becarioId = entrada.arguments?.getString(Rutas.ARG_BECARIO_ID) ?: return@protegida
                AsignarIngenieroScreen(becarioId = becarioId, onVolver = volver, onAsignado = navController::volverConAviso)
            }

            protegida(Rutas.ADMIN_TRANSFERENCIAS, SOLO_ADMIN, alSalir) {
                TransferenciasAdminScreen(onVolver = null)
            }

            protegida(Rutas.ADMIN_REPORTE_HORAS_GLOBAL, SOLO_ADMIN, alSalir) {
                ReporteHorasGlobalScreen(onVolver = volver)
            }

            protegida(Rutas.ADMIN_REPORTES_SIASE_LOTE, SOLO_ADMIN, alSalir) {
                ReportesSiaseLoteScreen(onVolver = volver)
            }

            protegida(Rutas.ADMIN_CONFIGURACION, SOLO_ADMIN, alSalir) {
                ConfiguracionScreen(onVolver = volver)
            }

            protegida(Rutas.ADMIN_EXPORTAR, SOLO_ADMIN, alSalir) {
                ExportarScreen(onVolver = volver)
            }
        }
    }
}

private fun argBecario(): NamedNavArgument = navArgument(Rutas.ARG_BECARIO_ID) { type = NavType.StringType }

/**
 * Destino que solo se muestra si el perfil de la sesión está en [permitidos]
 * (auditoría B-12). Si no hay perfil en memoria (p. ej. el sistema restauró la
 * pila tras matar el proceso), lo carga primero; sin sesión o con otro perfil,
 * manda al login con la pila limpia.
 */
private fun NavGraphBuilder.protegida(
    ruta: String,
    permitidos: Set<Perfil>,
    alSalir: () -> Unit,
    argumentos: List<NamedNavArgument> = emptyList(),
    contenido: @Composable (NavBackStackEntry) -> Unit
) {
    composable(ruta, arguments = argumentos) { entrada ->
        val sesion = appActual().sessionManager
        var perfil by remember { mutableStateOf(sesion.usuarioEnMemoria()?.perfil) }
        var verificado by remember { mutableStateOf(perfil != null) }

        LaunchedEffect(Unit) {
            if (!verificado) {
                perfil = intentar { sesion.usuarioAutenticado()?.perfil }.getOrNull()
                verificado = true
            }
        }

        when {
            !verificado -> CargandoCentrado(texto = "Verificando tu sesión…")
            perfil != null && perfil in permitidos -> contenido(entrada)
            else -> LaunchedEffect(Unit) { alSalir() }
        }
    }
}

private fun irSegunPerfil(navController: NavHostController, usuario: Usuario) {
    val destino = when (usuario.perfil) {
        Perfil.becario -> Rutas.BECARIO_HOME
        Perfil.ingeniero -> Rutas.INGENIERO_DASHBOARD
        Perfil.administrador -> Rutas.ADMIN_PANEL
    }
    navController.navigate(destino) {
        popUpTo(Rutas.LOGIN) { inclusive = true }
    }
}
