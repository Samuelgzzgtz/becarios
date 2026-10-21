package com.fime.docencheck.data.repository

import com.fime.docencheck.core.error.ErrorDeNegocio
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.data.model.EstadoTransferencia
import com.fime.docencheck.data.model.Transferencia
import com.fime.docencheck.data.model.TransferenciaDetalle
import com.fime.docencheck.data.model.Usuario
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order

class TransferenciaRepository(private val client: SupabaseClient) {

    suspend fun solicitar(
        becarioId: String,
        ingenieroOrigen: String,
        ingenieroDestino: String,
        motivo: String
    ): Result<Unit> = intentar {
        if (pendienteDe(becarioId) != null) {
            throw ErrorDeNegocio("Este becario ya tiene una solicitud de transferencia pendiente.")
        }
        client.postgrest.from("transferencias").insert(
            Transferencia(
                becario_id = becarioId,
                ingeniero_origen = ingenieroOrigen,
                ingeniero_destino = ingenieroDestino,
                motivo = motivo.trim()
            )
        )
        Unit
    }

    /** La solicitud pendiente de un becario, si hay (para avisar antes de llenar el formulario, M-06). */
    suspend fun pendienteDe(becarioId: String): Transferencia? =
        client.postgrest.from("transferencias")
            .select {
                filter {
                    eq("becario_id", becarioId)
                    eq("estado", EstadoTransferencia.pendiente.name)
                }
            }
            .decodeSingleOrNull()

    suspend fun delEquipo(ingenieroId: String): List<Transferencia> =
        client.postgrest.from("transferencias")
            .select {
                filter {
                    or {
                        eq("ingeniero_origen", ingenieroId)
                        eq("ingeniero_destino", ingenieroId)
                    }
                }
                order("created_at", Order.DESCENDING)
            }
            .decodeList()

    /** [delEquipo] con becario, origen y destino resueltos (M-06). */
    suspend fun delEquipoConDetalle(ingenieroId: String): List<TransferenciaDetalle> =
        conDetalle(client, delEquipo(ingenieroId))
}

/**
 * Resuelve los nombres de becario/origen/destino en una sola consulta a usuarios.
 * Lo que RLS no deje ver (p. ej. un becario que ya no es del ingeniero) queda en null.
 */
internal suspend fun conDetalle(client: SupabaseClient, transferencias: List<Transferencia>): List<TransferenciaDetalle> {
    if (transferencias.isEmpty()) return emptyList()
    val ids = transferencias.flatMap { listOf(it.becario_id, it.ingeniero_origen, it.ingeniero_destino) }.distinct()
    val usuarios = client.postgrest.from("usuarios")
        .select { filter { isIn("id", ids) } }
        .decodeList<Usuario>()
        .associateBy { it.id }
    return transferencias.map {
        TransferenciaDetalle(it, usuarios[it.becario_id], usuarios[it.ingeniero_origen], usuarios[it.ingeniero_destino])
    }
}
