package com.fime.docencheck.data.repository

import com.fime.docencheck.data.model.EstadoUsuario
import com.fime.docencheck.data.model.Perfil
import com.fime.docencheck.data.model.Usuario
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.Serializable

@Serializable
private data class AsignacionFila(val becario_id: String)

@Serializable
private data class AsignacionIngenieroFila(val ingeniero_id: String)

/** El equipo de becarios de un ingeniero: quién los tiene asignados y a quién se los puede transferir. */
class EquipoRepository(private val client: SupabaseClient) {

    /** Solo becarios activos (M-09: "Becarios activos" contaba también a los dados de baja). */
    suspend fun becariosAsignados(ingenieroId: String): List<Usuario> {
        val ids = client.postgrest.from("ingenieros_becarios")
            .select {
                filter {
                    eq("ingeniero_id", ingenieroId)
                    eq("activo", true)
                }
            }
            .decodeList<AsignacionFila>()
            .map { it.becario_id }

        if (ids.isEmpty()) return emptyList()

        return client.postgrest.from("usuarios")
            .select {
                filter {
                    isIn("id", ids)
                    eq("estado", EstadoUsuario.activo.name)
                }
            }
            .decodeList()
    }

    /** Un usuario por id (para mostrar a quién se está enrolando/transfiriendo, M-06/M-08). */
    suspend fun usuario(id: String): Usuario? =
        client.postgrest.from("usuarios")
            .select { filter { eq("id", id) } }
            .decodeSingleOrNull()

    /** El ingeniero actualmente asignado a un becario (lookup inverso), para Mi Cuenta. */
    suspend fun ingenieroDe(becarioId: String): Usuario? {
        val fila = client.postgrest.from("ingenieros_becarios")
            .select {
                filter {
                    eq("becario_id", becarioId)
                    eq("activo", true)
                }
            }
            .decodeSingleOrNull<AsignacionIngenieroFila>() ?: return null

        return usuario(fila.ingeniero_id)
    }

    /** Ingenieros ACTIVOS a los que se puede transferir (M-06). */
    suspend fun otrosIngenieros(propioId: String): List<Usuario> =
        client.postgrest.from("usuarios")
            .select {
                filter {
                    eq("perfil", Perfil.ingeniero.name)
                    eq("estado", EstadoUsuario.activo.name)
                    neq("id", propioId)
                }
            }
            .decodeList()
}
