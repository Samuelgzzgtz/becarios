package com.fime.docencheck.data.repository

import com.fime.docencheck.core.error.ErrorDeNegocio
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.data.model.EstadoTransferencia
import com.fime.docencheck.data.model.EstadoUsuario
import com.fime.docencheck.data.model.FilaExportacion
import com.fime.docencheck.data.model.Perfil
import com.fime.docencheck.data.model.Transferencia
import com.fime.docencheck.data.model.TransferenciaDetalle
import com.fime.docencheck.data.model.Usuario
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.LocalDate

/** Fila de la RPC indicadores_admin() (0016, auditoría M-05). */
@Serializable
data class IndicadoresSistema(
    val becarios_activos: Int,
    val ingenieros_activos: Int,
    val becarios_sin_asignar: Int,
    val transferencias_pendientes: Int,
    /** Reportes 'subido' de cualquier mes: lo que hay que firmar. */
    val siase_por_firmar: Int,
    /** Becarios activos que no han entregado el reporte del mes en curso. */
    val siase_sin_entregar: Int,
    val periodo_nombre: String? = null,
    val periodo_fin: String? = null,
    val ventana_abierta: Boolean? = null,
    val ventana_dias_restantes: Int? = null
)

@Serializable
data class MetasGlobales(val meta_semanal: Double, val meta_mensual: Double, val meta_semestral: Double)

@Serializable
data class VentanaConfig(val dia_apertura: Int, val dia_cierre: Int)

/** Resumen para el diálogo de confirmación del cierre de semestre (C-05). */
@Serializable
data class VistaPreviaCierre(
    val periodo_id: String,
    val nombre: String,
    val fecha_inicio: String,
    val fecha_fin: String,
    val becarios_activos: Int,
    val becarios_cumplidos: Int
)

/** Lo que devuelve cerrar_semestre(): se muestra antes de salir de la pantalla (C-05). */
@Serializable
data class ResultadoCierre(
    val periodo_cerrado: String,
    val periodo_nuevo: String,
    val becarios_activos: Int,
    val becarios_cumplidos: Int
)

/** CSV generado y cuántos registros trae (A-16). */
data class ExportacionCsv(val contenido: String, val registros: Int)

@Serializable
private data class PeticionCrearUsuario(
    val email: String,
    val password: String,
    val perfil: String,
    val nombre: String,
    val matricula: String,
    val coordinacion: String? = null
)

@Serializable
private data class RespuestaCrearUsuario(val id: String? = null, val email: String? = null, val error: String? = null)

@Serializable
private data class AsignacionVigente(val ingeniero_id: String)

private val jsonTolerante = Json { ignoreUnknownKeys = true }

class AdminRepository(private val client: SupabaseClient) {

    suspend fun indicadores(): IndicadoresSistema =
        client.postgrest.rpc("indicadores_admin").decodeSingle()

    /** Por omisión solo activos; con [incluirInactivos] trae todos (para poder reactivar, A-13). */
    suspend fun listarPorPerfil(perfil: Perfil, incluirInactivos: Boolean = false): List<Usuario> =
        client.postgrest.from("usuarios")
            .select {
                filter {
                    eq("perfil", perfil.name)
                    if (!incluirInactivos) eq("estado", EstadoUsuario.activo.name)
                }
                order("nombre", Order.ASCENDING)
            }
            .decodeList()

    /** Crea la cuenta vía Edge Function: crear en auth.users exige la service_role key,
     * que nunca debe vivir en el APK. Ver backend/supabase/functions/admin-crear-usuario. */
    suspend fun crearUsuario(
        email: String,
        password: String,
        perfil: Perfil,
        nombre: String,
        matricula: String,
        coordinacion: String?
    ): Result<Unit> = intentar {
        val respuesta = client.functions.invoke(
            "admin-crear-usuario",
            PeticionCrearUsuario(email.trim().lowercase(), password, perfil.name, nombre.trim(), matricula.trim(), coordinacion?.trim())
        )
        val cuerpo = jsonTolerante.decodeFromString<RespuestaCrearUsuario>(respuesta.bodyAsText())
        // La edge function devuelve los errores de negocio ya en español (M-01).
        if (cuerpo.error != null) throw ErrorDeNegocio(cuerpo.error)
    }

    /** Edita los datos de una cuenta (solo admin, por RLS y el trigger usuarios_proteger_campos). */
    suspend fun actualizarUsuario(id: String, nombre: String, matricula: String, coordinacion: String?): Result<Unit> = intentar {
        if (nombre.isBlank() || matricula.isBlank()) throw ErrorDeNegocio("El nombre y la matrícula son obligatorios.")
        client.postgrest.from("usuarios").update(
            buildJsonObject {
                put("nombre", nombre.trim())
                put("matricula", matricula.trim())
                put("coordinacion", coordinacion?.trim()?.ifBlank { null })
            }
        ) { filter { eq("id", id) } }
        Unit
    }

    /** Dar de baja / reactivar (RPC cambiar_estado_usuario, 0015; A-13). */
    suspend fun cambiarEstadoUsuario(id: String, estado: EstadoUsuario): Result<Unit> = intentar {
        client.postgrest.rpc(
            "cambiar_estado_usuario",
            buildJsonObject {
                put("p_usuario", id)
                put("p_estado", estado.name)
            }
        )
        Unit
    }

    /** El ingeniero vigente de un becario, para mostrar "Asignado actualmente" (A-10). */
    suspend fun ingenieroAsignadoDe(becarioId: String): String? =
        client.postgrest.from("ingenieros_becarios")
            .select {
                filter {
                    eq("becario_id", becarioId)
                    eq("activo", true)
                }
            }
            .decodeSingleOrNull<AsignacionVigente>()
            ?.ingeniero_id

    /** Asignación atómica en el servidor (RPC asignar_ingeniero, 0015; A-10). */
    suspend fun asignarBecario(becarioId: String, ingenieroId: String): Result<Unit> = intentar {
        client.postgrest.rpc(
            "asignar_ingeniero",
            buildJsonObject {
                put("p_becario", becarioId)
                put("p_ingeniero", ingenieroId)
            }
        )
        Unit
    }

    suspend fun transferenciasPendientes(): List<TransferenciaDetalle> {
        val pendientes = client.postgrest.from("transferencias")
            .select {
                filter { eq("estado", EstadoTransferencia.pendiente.name) }
                order("created_at", Order.ASCENDING)
            }
            .decodeList<Transferencia>()
        return conDetalle(client, pendientes)
    }

    /**
     * Aprobar/rechazar en una sola transacción con bloqueo de fila (RPC
     * resolver_transferencia, 0015; C-06). Si otro admin o un segundo toque ya
     * la resolvió, el servidor responde "Esta solicitud ya fue resuelta".
     */
    suspend fun resolverTransferencia(transferenciaId: String, aprobar: Boolean): Result<EstadoTransferencia> = intentar {
        client.postgrest.rpc(
            "resolver_transferencia",
            buildJsonObject {
                put("p_transferencia", transferenciaId)
                put("p_aprobar", aprobar)
            }
        ).decodeAs<EstadoTransferencia>()
    }

    suspend fun metasGlobales(): MetasGlobales? =
        client.postgrest.from("metas_horas")
            .select { filter { filter("becario_id", FilterOperator.IS, null) } }
            .decodeSingleOrNull()

    suspend fun ventana(): VentanaConfig? =
        client.postgrest.from("ventana_siase").select().decodeSingleOrNull()

    /** Metas + ventana en una sola transacción (RPC guardar_configuracion, 0015; M-10). */
    suspend fun guardarConfiguracion(
        semanal: Double,
        mensual: Double,
        semestral: Double,
        diaApertura: Int,
        diaCierre: Int
    ): Result<Unit> = intentar {
        client.postgrest.rpc(
            "guardar_configuracion",
            buildJsonObject {
                put("p_meta_semanal", semanal)
                put("p_meta_mensual", mensual)
                put("p_meta_semestral", semestral)
                put("p_dia_apertura", diaApertura)
                put("p_dia_cierre", diaCierre)
            }
        )
        Unit
    }

    suspend fun vistaPreviaCierre(): VistaPreviaCierre? =
        client.postgrest.rpc("vista_previa_cierre").decodeList<VistaPreviaCierre>().firstOrNull()

    /**
     * [periodoActual] es el periodo que el admin vio al confirmar: si ya no es el
     * activo (doble envío, otro admin), el servidor rechaza en vez de cerrar
     * también el periodo recién abierto (C-05).
     */
    suspend fun cerrarSemestre(
        nombre: String,
        tipo: String,
        inicio: LocalDate,
        fin: LocalDate,
        periodoActual: String
    ): Result<ResultadoCierre> = intentar {
        client.postgrest.rpc(
            "cerrar_semestre",
            buildJsonObject {
                put("p_nuevo_nombre", nombre.trim())
                put("p_nuevo_tipo", tipo)
                put("p_nuevo_inicio", inicio.toString())
                put("p_nuevo_fin", fin.toString())
                put("p_periodo_actual", periodoActual)
            }
        ).decodeSingle<ResultadoCierre>()
    }

    /** Crear el primer periodo cuando no hay ninguno activo (RPC abrir_periodo, 0015; M-11). */
    suspend fun abrirPeriodo(nombre: String, tipo: String, inicio: LocalDate, fin: LocalDate): Result<Unit> = intentar {
        client.postgrest.rpc(
            "abrir_periodo",
            buildJsonObject {
                put("p_nombre", nombre.trim())
                put("p_tipo", tipo)
                put("p_inicio", inicio.toString())
                put("p_fin", fin.toString())
            }
        )
        Unit
    }

    /**
     * CSV, no .xlsx real: Excel/Sheets lo abren igual y evita cargar una librería
     * pesada de formatos de oficina solo para esto. Correcciones de A-16:
     *  - páginas de 1000 (PostgREST corta ahí) hasta traer todo;
     *  - campos escapados según RFC 4180 y BOM UTF-8 para que Excel lea acentos;
     *  - incluye becarios inactivos y fecha/hora ya en hora de Monterrey.
     * [desde] y [hasta] son fechas locales, ambas inclusivas.
     */
    suspend fun exportarAsistenciasCsv(desde: LocalDate, hasta: LocalDate): ExportacionCsv {
        if (hasta.isBefore(desde)) throw ErrorDeNegocio("La fecha final no puede ser anterior a la inicial.")

        val filas = mutableListOf<FilaExportacion>()
        var offset = 0
        while (true) {
            val pagina = client.postgrest.rpc(
                "exportar_asistencias",
                buildJsonObject {
                    put("p_desde", desde.toString())
                    put("p_hasta", hasta.toString())
                    put("p_offset", offset)
                    put("p_limite", TAMANO_PAGINA)
                }
            ).decodeList<FilaExportacion>()
            filas += pagina
            if (pagina.size < TAMANO_PAGINA) break
            offset += TAMANO_PAGINA
        }

        val encabezado = listOf("matricula", "nombre", "tipo", "modalidad", "fecha", "hora")
        val lineas = buildList {
            add(encabezado.joinToString(",") { campoCsv(it) })
            filas.forEach { f ->
                add(listOf(f.matricula, f.nombre, f.tipo, f.modalidad, f.fecha, f.hora).joinToString(",") { campoCsv(it) })
            }
        }
        return ExportacionCsv(contenido = "﻿" + lineas.joinToString("\r\n") + "\r\n", registros = filas.size)
    }

    private fun campoCsv(valor: String): String =
        if (valor.any { it == ',' || it == '"' || it == '\n' || it == '\r' }) {
            "\"" + valor.replace("\"", "\"\"") + "\""
        } else {
            valor
        }

    private companion object {
        const val TAMANO_PAGINA = 1000
    }
}
