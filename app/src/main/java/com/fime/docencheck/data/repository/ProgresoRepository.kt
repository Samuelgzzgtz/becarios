package com.fime.docencheck.data.repository

import com.fime.docencheck.data.model.ProgresoBecario
import com.fime.docencheck.data.model.ProgresoHoras
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class ProgresoRepository(private val client: SupabaseClient) {

    suspend fun progresoDe(becarioId: String): ProgresoHoras =
        client.postgrest.rpc(
            "progreso_horas",
            buildJsonObject { put("p_becario", becarioId) }
        ).decodeSingle()

    /**
     * Progreso de todo el equipo visible para quien llama (ingeniero: sus becarios;
     * admin: todos) en UNA llamada (M-09), en lugar de un progreso_horas por becario.
     */
    suspend fun progresoEquipo(): List<ProgresoBecario> =
        client.postgrest.rpc("progreso_equipo").decodeList()
}
