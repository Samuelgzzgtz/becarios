package com.fime.docencheck.data.repository

import com.fime.docencheck.core.error.ErrorDeNegocio
import com.fime.docencheck.core.error.esAsistenciaDuplicada
import com.fime.docencheck.core.error.esErrorDeRed
import com.fime.docencheck.core.error.esErrorDeSesion
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.data.local.AsistenciaPendienteDao
import com.fime.docencheck.data.local.AsistenciaPendienteEntity
import com.fime.docencheck.data.local.CacheLocal
import com.fime.docencheck.data.local.UltimoRegistro
import com.fime.docencheck.data.model.Asistencia
import com.fime.docencheck.data.model.AsistenciaUi
import com.fime.docencheck.data.model.ModalidadTrabajo
import com.fime.docencheck.data.model.TipoAsistencia
import com.fime.docencheck.data.model.siguienteTipoSegun
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant
import java.time.LocalDate

/** Cómo quedó un registro: ya en el servidor, o guardado en el teléfono para subirlo después. */
enum class ResultadoRegistro { SUBIDO, EN_COLA }

/** Resumen de una pasada de sincronización. */
data class ResultadoSincronizacion(val subidas: Int, val rechazadas: Int, val pendientes: Int)

class AsistenciaRepository(
    private val client: SupabaseClient,
    private val pendientesDao: AsistenciaPendienteDao,
    private val cache: CacheLocal,
    /** Pide a WorkManager una sincronización en cuanto haya red (no esperar al periódico de 15 min). */
    private val alEncolar: () -> Unit = {}
) {

    /** Evita que el worker y la app suban la misma cola al mismo tiempo. */
    private val candadoSincronizacion = Mutex()

    /**
     * Intenta subir la asistencia de inmediato. Solo los fallos de RED la mandan a
     * la cola local (auditoría C-01): un rechazo del servidor (duplicado, cuenta
     * inactiva, permisos) se devuelve como error para que el becario lo vea, en vez
     * de mostrarle "Registrado" sobre algo que nunca va a subir.
     */
    suspend fun registrar(
        becarioId: String,
        tipo: TipoAsistencia,
        modalidad: ModalidadTrabajo,
        latitud: Double?,
        longitud: Double?
    ): Result<ResultadoRegistro> = intentar {
        val ocurridoEn = Instant.now().toString()
        val asistencia = Asistencia(
            becario_id = becarioId,
            tipo = tipo,
            ocurrido_en = ocurridoEn,
            modalidad = modalidad,
            latitud = latitud,
            longitud = longitud
        )

        val subida = intentar { client.postgrest.from("asistencias").insert(asistencia) }
        val error = subida.exceptionOrNull()

        when {
            error == null -> {
                cache.guardarUltimoRegistro(becarioId, UltimoRegistro(tipo, ocurridoEn))
                ResultadoRegistro.SUBIDO
            }
            error.esErrorDeRed() -> {
                pendientesDao.insertar(
                    AsistenciaPendienteEntity(
                        becarioId = becarioId,
                        tipo = tipo.name,
                        ocurridoEn = ocurridoEn,
                        modalidad = modalidad.name,
                        latitud = latitud,
                        longitud = longitud
                    )
                )
                cache.guardarUltimoRegistro(becarioId, UltimoRegistro(tipo, ocurridoEn))
                alEncolar()
                ResultadoRegistro.EN_COLA
            }
            else -> throw ErrorDeNegocio(error.mensajeAmigable("No se pudo registrar tu asistencia."))
        }
    }

    /**
     * Llamado por SincronizarAsistenciasWorker (y al cerrar sesión). Procesa cada
     * registro por separado (auditoría A-12) y solo los del usuario con sesión: un
     * registro que falle ya no bloquea a los demás.
     *  - error de red / sesión vencida → se queda en cola, `intentos` + 1
     *  - duplicado (ya había subido)   → se borra de la cola
     *  - cualquier otro rechazo         → se marca con `error` y ya no se reintenta
     * Devuelve failure solo si quedó algo por reintentar (para que WorkManager reintente).
     */
    suspend fun sincronizarPendientes(): Result<ResultadoSincronizacion> = intentar {
        candadoSincronizacion.withLock {
            val uid = client.auth.currentUserOrNull()?.id
                ?: return@withLock ResultadoSincronizacion(0, 0, 0)

            var subidas = 0
            var rechazadas = 0
            var pendientes = 0

            for (pendiente in pendientesDao.porSubirDe(uid)) {
                val resultado = intentar {
                    client.postgrest.from("asistencias").insert(
                        Asistencia(
                            becario_id = pendiente.becarioId,
                            tipo = TipoAsistencia.valueOf(pendiente.tipo),
                            ocurrido_en = pendiente.ocurridoEn,
                            modalidad = ModalidadTrabajo.valueOf(pendiente.modalidad),
                            latitud = pendiente.latitud,
                            longitud = pendiente.longitud
                        )
                    )
                }
                val error = resultado.exceptionOrNull()
                when {
                    error == null || error.esAsistenciaDuplicada() -> {
                        pendientesDao.eliminar(pendiente)
                        subidas++
                    }
                    error.esErrorDeRed() || error.esErrorDeSesion() -> {
                        pendientesDao.actualizar(pendiente.copy(intentos = pendiente.intentos + 1))
                        pendientes++
                    }
                    else -> {
                        pendientesDao.actualizar(
                            pendiente.copy(
                                intentos = pendiente.intentos + 1,
                                error = error.mensajeAmigable("El servidor rechazó este registro.")
                            )
                        )
                        rechazadas++
                    }
                }
            }
            if (pendientes > 0) throw ErrorDeNegocio("Quedan $pendientes registro(s) por subir.")
            ResultadoSincronizacion(subidas, rechazadas, pendientes)
        }
    }

    suspend fun historial(becarioId: String, limite: Long = 50): List<Asistencia> =
        client.postgrest.from("asistencias")
            .select {
                filter { eq("becario_id", becarioId) }
                order("ocurrido_en", Order.DESCENDING)
                limit(limite)
            }
            .decodeList()

    suspend fun pendientesSinSubir(becarioId: String): Int = pendientesDao.contarPendientes(becarioId)

    suspend fun rechazadasSinSubir(becarioId: String): Int = pendientesDao.contarRechazadas(becarioId)

    /** Borra la cola local de un becario (al confirmar el cierre de sesión con pendientes). */
    suspend fun descartarPendientes(becarioId: String) = pendientesDao.eliminarDe(becarioId)

    /** Borra los registros que el servidor rechazó, una vez que el becario los vio. */
    suspend fun descartarRechazadas(becarioId: String) = pendientesDao.eliminarRechazadasDe(becarioId)

    /** Lo que sigue en el teléfono sin subir, para mostrarlo en Consulta con la etiqueta "Sin subir" (A-14). */
    suspend fun localesComoUi(becarioId: String, desde: LocalDate? = null, hasta: LocalDate? = null): List<AsistenciaUi> =
        pendientesDao.todasDe(becarioId)
            .filter { p ->
                val dia = FechaUi.fechaLocal(p.ocurridoEn) ?: return@filter true
                (desde == null || !dia.isBefore(desde)) && (hasta == null || !dia.isAfter(hasta))
            }
            .map { p ->
                AsistenciaUi(
                    asistencia = Asistencia(
                        becario_id = p.becarioId,
                        tipo = TipoAsistencia.valueOf(p.tipo),
                        ocurrido_en = p.ocurridoEn,
                        modalidad = ModalidadTrabajo.valueOf(p.modalidad)
                    ),
                    sinSubir = true,
                    rechazo = p.error
                )
            }

    /** Historial acotado a un rango [desde, hasta) de instantes ISO-8601. */
    suspend fun historialEntre(becarioId: String, desde: String, hasta: String): List<Asistencia> =
        client.postgrest.from("asistencias")
            .select {
                filter {
                    eq("becario_id", becarioId)
                    // supabase-kt guarda un filtro por columna: un gte + lt sueltos sobre
                    // ocurrido_en se pisan y solo llega el último. Con and() van los dos.
                    and {
                        gte("ocurrido_en", desde)
                        lt("ocurrido_en", hasta)
                    }
                }
                order("ocurrido_en", Order.DESCENDING)
            }
            .decodeList()

    /** Historial entre dos fechas LOCALES, ambas inclusivas. */
    suspend fun historialEntreFechas(becarioId: String, desde: LocalDate, hasta: LocalDate): List<Asistencia> =
        historialEntre(
            becarioId,
            FechaUi.inicioDia(desde).toString(),
            FechaUi.inicioDia(hasta.plusDays(1)).toString()
        )

    /**
     * Qué toca registrar ahora (auditoría C-04): decide por DÍA LOCAL, mirando lo
     * subido y lo que sigue en cola. Sin red usa el último registro guardado en el
     * teléfono (C-02) en vez de fallar.
     */
    suspend fun siguienteTipo(becarioId: String): TipoAsistencia {
        val remoto = intentar { historial(becarioId, limite = 1).firstOrNull() }
        remoto.getOrNull()?.let { ultimo ->
            ultimo.ocurrido_en?.let { cache.guardarUltimoRegistro(becarioId, UltimoRegistro(ultimo.tipo, it)) }
        }

        val candidatos = buildList {
            remoto.getOrNull()?.let { a -> FechaUi.parsear(a.ocurrido_en)?.let { add(a.tipo to it) } }
            if (remoto.isFailure) {
                cache.ultimoRegistro(becarioId)?.let { u -> FechaUi.parsear(u.ocurrido_en)?.let { add(u.tipo to it) } }
            }
            pendientesDao.porSubirDe(becarioId).forEach { p ->
                FechaUi.parsear(p.ocurridoEn)?.let { add(TipoAsistencia.valueOf(p.tipo) to it) }
            }
        }
        val ultimo = candidatos.maxByOrNull { it.second }
        return siguienteTipoSegun(ultimo?.first, ultimo?.second)
    }

    // ---------------------------------------------------------------------
    // Corrección manual (ingeniero asignado o admin; RLS de 0013). C-04.
    // ---------------------------------------------------------------------

    /** Agrega un registro con fecha/hora elegida (p. ej. la salida que el becario olvidó). */
    suspend fun agregarManual(
        becarioId: String,
        tipo: TipoAsistencia,
        ocurridoEn: Instant,
        modalidad: ModalidadTrabajo,
        verificadoPor: String
    ): Result<Unit> = intentar {
        client.postgrest.from("asistencias").insert(
            Asistencia(
                becario_id = becarioId,
                tipo = tipo,
                ocurrido_en = ocurridoEn.toString(),
                modalidad = modalidad,
                verificado_por = verificadoPor
            )
        )
        Unit
    }

    suspend fun eliminar(asistenciaId: String): Result<Unit> = intentar {
        client.postgrest.from("asistencias").delete { filter { eq("id", asistenciaId) } }
        Unit
    }
}
