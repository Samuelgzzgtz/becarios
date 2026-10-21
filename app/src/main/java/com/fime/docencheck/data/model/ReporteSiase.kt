package com.fime.docencheck.data.model

import kotlinx.serialization.Serializable

@Serializable
enum class EstadoReporteSiase {
    pendiente, subido, confirmado, excluido, sin_reporte
}

/** El becario solo puede (re)subir mientras el reporte no ha sido revisado (auditoría A-01). */
val EstadoReporteSiase.permiteSubir: Boolean
    get() = this == EstadoReporteSiase.pendiente || this == EstadoReporteSiase.subido

/**
 * Fila de reportes_siase. `archivo_url` guarda la RUTA del objeto en el bucket
 * ("<becario>/<mes>/<archivo>"), no una URL (migración 0014, auditoría A-02).
 */
@Serializable
data class ReporteSiase(
    val id: String? = null,
    val becario_id: String,
    val periodo_id: String,
    val mes: String, // "yyyy-MM-01"
    val archivo_url: String? = null,
    val estado: EstadoReporteSiase = EstadoReporteSiase.pendiente,
    val fecha_firma: String? = null,
    val firmado_por: String? = null
)

/**
 * Fila de la RPC reportes_siase_mes() (0014): el estado EFECTIVO de cada becario
 * activo en un mes, con o sin fila, con la misma regla para los tres perfiles.
 */
@Serializable
data class ReporteSiaseMes(
    val becario_id: String,
    val nombre: String,
    val matricula: String,
    val reporte_id: String? = null,
    val mes: String,
    val archivo_ruta: String? = null,
    val estado: EstadoReporteSiase,
    val fecha_firma: String? = null,
    val firmado_por: String? = null,
    val actualizado: String? = null
)

/** Fila que devuelve la RPC estado_ventana_siase(). */
@Serializable
data class EstadoVentanaSiase(
    val abierta: Boolean,
    val fecha_apertura: String,
    val fecha_cierre: String,
    val dias_restantes: Int
)

@Serializable
data class PeriodoAcademico(
    val id: String,
    val nombre: String,
    val activo: Boolean,
    val tipo: String? = null,
    val fecha_inicio: String? = null,
    val fecha_fin: String? = null
)
