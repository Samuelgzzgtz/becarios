package com.fime.docencheck.data.repository

import com.fime.docencheck.core.error.esErrorDeRed
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.data.local.CacheLocal
import com.fime.docencheck.data.model.ModalidadTrabajo
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.Serializable

@Serializable
data class DiaHorario(val dia_semana: Int, val modalidad: ModalidadTrabajo)

@Serializable
private data class NuevoDiaHorario(val becario_id: String, val dia_semana: Int, val modalidad: ModalidadTrabajo)

/**
 * Modalidad del día. `configurada = false` significa que el ingeniero no ha
 * definido ese día; se registra como presencial por omisión, pero la UI no debe
 * presentarlo como si estuviera configurado (M-07).
 */
data class ModalidadHoy(val modalidad: ModalidadTrabajo, val configurada: Boolean)

class HorarioRepository(
    private val client: SupabaseClient,
    private val cache: CacheLocal
) {

    /**
     * dia_semana en la tabla usa 0 = domingo, igual que Postgres extract(dow). El
     * día se calcula en hora de Monterrey (A-06). Sin red usa el patrón guardado (C-02).
     */
    suspend fun modalidadDeHoy(becarioId: String): ModalidadHoy {
        val diaSemana = FechaUi.diaSemanaTabla()
        val semana = semanaConRespaldo(becarioId)
        val fila = semana.firstOrNull { it.dia_semana == diaSemana }
        return ModalidadHoy(fila?.modalidad ?: ModalidadTrabajo.presencial, configurada = fila != null)
    }

    /** El patrón semanal completo, para que el ingeniero lo edite. */
    suspend fun semanaDe(becarioId: String): List<DiaHorario> =
        client.postgrest.from("horarios_modalidad")
            .select {
                filter { eq("becario_id", becarioId) }
            }
            .decodeList()

    /** Como [semanaDe], guardando copia local; sin red devuelve la copia (o falla si no hay). */
    suspend fun semanaConRespaldo(becarioId: String): List<DiaHorario> {
        val remoto = intentar { semanaDe(becarioId) }
        remoto.onSuccess { cache.guardarHorario(becarioId, it) }
        val error = remoto.exceptionOrNull() ?: return remoto.getOrThrow()
        if (error.esErrorDeRed()) cache.horario(becarioId)?.let { return it }
        throw error
    }

    /**
     * Da de alta o reemplaza la modalidad de un día. `dia_semana` tiene un
     * índice único junto con `becario_id`, así que upsert reemplaza el valor
     * existente en vez de duplicar la fila.
     */
    suspend fun configurarDia(becarioId: String, diaSemana: Int, modalidad: ModalidadTrabajo): Result<Unit> =
        intentar {
            client.postgrest.from("horarios_modalidad").upsert(
                NuevoDiaHorario(becarioId, diaSemana, modalidad)
            ) {
                onConflict = "becario_id,dia_semana"
            }
            Unit
        }

    /** "No aplica": el becario no trabaja ese día (borra la fila; política horarios_delete). */
    suspend fun quitarDia(becarioId: String, diaSemana: Int): Result<Unit> = intentar {
        client.postgrest.from("horarios_modalidad").delete {
            filter {
                eq("becario_id", becarioId)
                eq("dia_semana", diaSemana)
            }
        }
        Unit
    }
}
