package com.fime.docencheck.data.local

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update

@Dao
interface AsistenciaPendienteDao {

    @Insert
    suspend fun insertar(pendiente: AsistenciaPendienteEntity): Long

    @Query("SELECT * FROM asistencias_pendientes ORDER BY ocurridoEn ASC")
    suspend fun obtenerTodas(): List<AsistenciaPendienteEntity>

    /** Las que todavía se deben reintentar (sin rechazo permanente), de un becario. */
    @Query("SELECT * FROM asistencias_pendientes WHERE becarioId = :becarioId AND error IS NULL ORDER BY ocurridoEn ASC")
    suspend fun porSubirDe(becarioId: String): List<AsistenciaPendienteEntity>

    @Query("SELECT * FROM asistencias_pendientes WHERE becarioId = :becarioId ORDER BY ocurridoEn DESC")
    suspend fun todasDe(becarioId: String): List<AsistenciaPendienteEntity>

    @Query("SELECT COUNT(*) FROM asistencias_pendientes WHERE becarioId = :becarioId AND error IS NULL")
    suspend fun contarPendientes(becarioId: String): Int

    @Query("SELECT COUNT(*) FROM asistencias_pendientes WHERE becarioId = :becarioId AND error IS NOT NULL")
    suspend fun contarRechazadas(becarioId: String): Int

    @Query("DELETE FROM asistencias_pendientes WHERE becarioId = :becarioId")
    suspend fun eliminarDe(becarioId: String)

    @Query("DELETE FROM asistencias_pendientes WHERE becarioId = :becarioId AND error IS NOT NULL")
    suspend fun eliminarRechazadasDe(becarioId: String)

    @Update
    suspend fun actualizar(pendiente: AsistenciaPendienteEntity)

    @Delete
    suspend fun eliminar(pendiente: AsistenciaPendienteEntity)
}
