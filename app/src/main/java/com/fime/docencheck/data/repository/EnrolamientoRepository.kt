package com.fime.docencheck.data.repository

import com.fime.docencheck.core.error.esErrorDeRed
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.data.local.CacheLocal
import com.fime.docencheck.data.model.EnrolamientoFacial
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class EnrolamientoRepository(
    private val client: SupabaseClient,
    private val cache: CacheLocal
) {

    /**
     * El becario lee solo el suyo (RLS); es lo que compara en el dispositivo al
     * verificar. Se guarda copia local para poder verificar sin red (C-02); si no
     * hay red se usa esa copia, y si tampoco hay copia se propaga el error de red.
     */
    suspend fun propio(becarioId: String): EnrolamientoFacial? {
        val remoto = intentar {
            client.postgrest.from("enrolamientos_faciales")
                .select {
                    filter {
                        eq("becario_id", becarioId)
                        eq("activo", true)
                    }
                }
                .decodeSingleOrNull<EnrolamientoFacial>()
        }
        remoto.onSuccess { cache.guardarEnrolamiento(becarioId, it) }

        val error = remoto.exceptionOrNull() ?: return remoto.getOrNull()
        if (error.esErrorDeRed()) {
            cache.enrolamiento(becarioId)?.let { return it }
        }
        throw error
    }

    /**
     * Da de alta (o reemplaza) la biometría de un becario con la RPC
     * enrolar_becario (0015): el ingeniero no puede LEER enrolamientos, así que el
     * "desactivar el anterior + insertar" tiene que hacerse del lado del servidor y
     * en una sola transacción (auditoría A-05). Devuelve true si reemplazó una existente.
     */
    suspend fun enrolar(
        becarioId: String,
        embedding: List<Float>,
        modelo: String,
        dimension: Int
    ): Result<Boolean> = intentar {
        client.postgrest.rpc(
            "enrolar_becario",
            buildJsonObject {
                put("p_becario", becarioId)
                put("p_embedding", buildJsonArray { embedding.forEach { add(JsonPrimitive(it)) } })
                put("p_modelo", modelo)
                put("p_dimension", dimension)
            }
        ).decodeAs<Boolean>()
    }

    /** ¿Ya tiene biometría? (para avisar que se va a reemplazar, M-08). */
    suspend fun tieneEnrolamiento(becarioId: String): Boolean =
        client.postgrest.rpc("tiene_enrolamiento", buildJsonObject { put("p_becario", becarioId) })
            .decodeAs<Boolean>()
}
