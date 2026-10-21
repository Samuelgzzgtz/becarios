package com.fime.docencheck.data.repository

import com.fime.docencheck.core.error.ErrorDeNegocio
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.data.model.EstadoReporteSiase
import com.fime.docencheck.data.model.EstadoVentanaSiase
import com.fime.docencheck.data.model.PeriodoAcademico
import com.fime.docencheck.data.model.ReporteSiase
import com.fime.docencheck.data.model.ReporteSiaseMes
import com.fime.docencheck.data.model.Usuario
import com.fime.docencheck.data.model.permiteSubir
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.storage.storage
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.LocalDate
import kotlin.time.Duration.Companion.minutes

private const val BUCKET_SIASE = "siase"

/** Un reporte que espera firma, con el nombre del becario (para "pendientes de meses anteriores", A-03). */
data class ReportePorFirmar(val reporte: ReporteSiase, val becario: Usuario?)

@Serializable
private data class FilaReporteNuevo(
    val becario_id: String,
    val periodo_id: String,
    val mes: String,
    val archivo_url: String,
    val estado: EstadoReporteSiase
)

class SiaseRepository(private val client: SupabaseClient) {

    suspend fun estadoVentana(): EstadoVentanaSiase =
        client.postgrest.rpc("estado_ventana_siase").decodeSingle()

    suspend fun periodoActivo(): PeriodoAcademico? =
        client.postgrest.from("periodos_academicos")
            .select {
                filter { eq("activo", true) }
            }
            .decodeSingleOrNull()

    suspend fun reporteDelMes(becarioId: String, mes: String): ReporteSiase? =
        client.postgrest.from("reportes_siase")
            .select {
                filter {
                    eq("becario_id", becarioId)
                    eq("mes", mes)
                }
            }
            .decodeSingleOrNull()

    /**
     * Estado EFECTIVO de cada becario visible para un mes (RPC reportes_siase_mes,
     * 0014): resuelve "sin_reporte" sin depender de pg_cron (A-04) y aplica la
     * misma regla para becario, ingeniero y admin (M-04).
     */
    suspend fun reportesDelMes(mes: LocalDate): List<ReporteSiaseMes> =
        client.postgrest.rpc(
            "reportes_siase_mes",
            buildJsonObject { put("p_mes", mes.withDayOfMonth(1).toString()) }
        ).decodeList()

    /**
     * Reportes 'subido' de meses ANTERIORES a [mesVisible] (A-03): siguen
     * esperando firma aunque ya cambió el mes. RLS limita a lo que quien llama puede ver.
     */
    suspend fun porFirmarAntesDe(mesVisible: LocalDate): List<ReportePorFirmar> {
        val reportes = client.postgrest.from("reportes_siase")
            .select {
                filter {
                    eq("estado", EstadoReporteSiase.subido.name)
                    lt("mes", mesVisible.withDayOfMonth(1).toString())
                }
                order("mes", Order.DESCENDING)
            }
            .decodeList<ReporteSiase>()
        if (reportes.isEmpty()) return emptyList()

        val becarios = client.postgrest.from("usuarios")
            .select { filter { isIn("id", reportes.map { it.becario_id }.distinct()) } }
            .decodeList<Usuario>()
            .associateBy { it.id }
        return reportes.map { ReportePorFirmar(it, becarios[it.becario_id]) }
    }

    /**
     * Sube el PDF/imagen a Storage y crea o actualiza la fila de estatus. Guarda
     * la RUTA del objeto, no una URL firmada que caduca (A-02). Antes de subir
     * revisa que el reporte siga abierto, para no sobrescribir un archivo ya
     * revisado (A-01; el backend también lo bloquea).
     */
    suspend fun subirReporte(
        becarioId: String,
        periodoId: String,
        mes: String,
        archivo: ByteArray,
        nombreArchivo: String
    ): Result<String> = intentar {
        val existente = reporteDelMes(becarioId, mes)
        if (existente != null && !existente.estado.permiteSubir) {
            throw ErrorDeNegocio("Este reporte ya fue revisado por tu ingeniero; ya no se puede reemplazar.")
        }

        val ruta = "$becarioId/$mes/${nombreSeguro(nombreArchivo)}"
        client.storage.from(BUCKET_SIASE).upload(ruta, archivo) { upsert = true }

        if (existente == null) {
            client.postgrest.from("reportes_siase").insert(
                FilaReporteNuevo(
                    becario_id = becarioId,
                    periodo_id = periodoId,
                    mes = mes,
                    archivo_url = ruta,
                    estado = EstadoReporteSiase.subido
                )
            )
        } else {
            client.postgrest.from("reportes_siase").update(
                mapOf(
                    "archivo_url" to ruta,
                    "estado" to EstadoReporteSiase.subido.name
                )
            ) {
                filter { eq("id", existente.id!!) }
            }
        }
        ruta
    }

    /**
     * URL temporal para abrir el archivo (A-02). Acepta también filas viejas que
     * todavía guarden una URL completa.
     */
    suspend fun urlParaVer(rutaOUrl: String): Result<String> = intentar {
        if (rutaOUrl.startsWith("http")) return@intentar rutaOUrl
        client.storage.from(BUCKET_SIASE).createSignedUrl(rutaOUrl, expiresIn = 10.minutes)
    }

    /** Los últimos meses de reportes de un becario, para la lista "Historial de reportes". */
    suspend fun historialDe(becarioId: String, limite: Long = 6): List<ReporteSiase> =
        client.postgrest.from("reportes_siase")
            .select {
                filter { eq("becario_id", becarioId) }
                order("mes", Order.DESCENDING)
                limit(limite)
            }
            .decodeList()

    /**
     * Confirma (firma) o excluye reportes con la RPC firmar_reportes_siase (0014):
     * quién firma y cuándo los pone el servidor, y solo cambia filas en estado
     * válido, así que un doble toque no duplica nada. Devuelve cuántas cambió.
     */
    suspend fun firmar(reporteIds: List<String>, estado: EstadoReporteSiase = EstadoReporteSiase.confirmado): Result<Int> =
        intentar {
            if (reporteIds.isEmpty()) throw ErrorDeNegocio("Selecciona al menos un reporte.")
            client.postgrest.rpc(
                "firmar_reportes_siase",
                buildJsonObject {
                    put("p_ids", buildJsonArray { reporteIds.forEach { add(JsonPrimitive(it)) } })
                    put("p_estado", estado.name)
                }
            ).decodeAs<Int>()
        }

    suspend fun aprobar(reporteId: String): Result<Int> = firmar(listOf(reporteId))

    private fun nombreSeguro(nombre: String): String {
        val limpio = nombre.trim().replace(Regex("[^A-Za-z0-9._-]"), "_").take(80)
        return limpio.ifBlank { "reporte_siase" }
    }
}
