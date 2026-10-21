package com.fime.docencheck.navigation

object Rutas {
    const val LOGIN = "login"

    // Becario (Fase 3)
    const val BECARIO_HOME = "becario/home"
    const val BECARIO_REGISTRAR_ASISTENCIA = "becario/registrar_asistencia"
    const val BECARIO_REPORTE_HORAS = "becario/reporte_horas"
    const val BECARIO_CONSULTA_ASISTENCIAS = "becario/consulta_asistencias"
    const val BECARIO_REPORTE_SIASE = "becario/reporte_siase"
    const val BECARIO_MI_CUENTA = "becario/mi_cuenta"

    // Ingeniero (Fase 4)
    const val INGENIERO_DASHBOARD = "ingeniero/dashboard"
    const val INGENIERO_MIS_BECARIOS = "ingeniero/mis_becarios"
    const val INGENIERO_REPORTES_SIASE = "ingeniero/reportes_siase"
    const val INGENIERO_TRANSFERENCIAS = "ingeniero/transferencias"

    /** Consulta de asistencias de todo el equipo (auditoría M-17). */
    const val INGENIERO_CONSULTA_EQUIPO = "ingeniero/consulta_equipo"

    /** Mi cuenta en la barra del ingeniero (misma pantalla, variante por perfil; M-15). */
    const val INGENIERO_MI_CUENTA = "ingeniero/mi_cuenta"

    const val ARG_BECARIO_ID = "becarioId"

    const val INGENIERO_ENROLAMIENTO = "ingeniero/becario/{$ARG_BECARIO_ID}/enrolamiento"
    const val INGENIERO_MODALIDAD = "ingeniero/becario/{$ARG_BECARIO_ID}/modalidad"
    const val INGENIERO_SOLICITAR_TRANSFERENCIA = "ingeniero/becario/{$ARG_BECARIO_ID}/transferir"
    const val INGENIERO_CONSULTA_BECARIO = "ingeniero/becario/{$ARG_BECARIO_ID}/asistencias"

    fun enrolamiento(becarioId: String) = "ingeniero/becario/$becarioId/enrolamiento"
    fun modalidad(becarioId: String) = "ingeniero/becario/$becarioId/modalidad"
    fun solicitarTransferencia(becarioId: String) = "ingeniero/becario/$becarioId/transferir"
    fun consultaBecario(becarioId: String) = "ingeniero/becario/$becarioId/asistencias"

    // Administrador (Fase 5)
    const val ADMIN_PANEL = "admin/panel"
    const val ADMIN_SEMESTRES = "admin/semestres"
    const val ADMIN_INGENIEROS = "admin/ingenieros"
    const val ADMIN_BECARIOS = "admin/becarios"
    const val ADMIN_TRANSFERENCIAS = "admin/transferencias"
    const val ADMIN_REPORTE_HORAS_GLOBAL = "admin/reporte_horas"
    const val ADMIN_REPORTES_SIASE_LOTE = "admin/reportes_siase"
    const val ADMIN_CONFIGURACION = "admin/configuracion"
    const val ADMIN_EXPORTAR = "admin/exportar"

    /** Pestaña "Más" del administrador: el resto de las herramientas. */
    const val ADMIN_MAS = "admin/mas"
    const val ADMIN_MI_CUENTA = "admin/mi_cuenta"

    const val ARG_PERFIL = "perfil"
    const val ADMIN_CREAR_USUARIO = "admin/usuarios/{$ARG_PERFIL}/nuevo"
    const val ADMIN_ASIGNAR_INGENIERO = "admin/becario/{$ARG_BECARIO_ID}/asignar"

    fun crearUsuario(perfil: String) = "admin/usuarios/$perfil/nuevo"
    fun asignarIngeniero(becarioId: String) = "admin/becario/$becarioId/asignar"
}
