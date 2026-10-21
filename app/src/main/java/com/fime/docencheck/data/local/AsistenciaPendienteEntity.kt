package com.fime.docencheck.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Cache local de una asistencia que no se pudo subir al momento de registrarse
 * (corte de red). WorkManager reintenta hasta que se sube; ver plan, "Persistencia
 * local" y "Automatización en segundo plano".
 *
 * `error` != null significa que el servidor la rechazó de forma permanente
 * (p. ej. cuenta inactiva): ya no se reintenta, pero se conserva para avisar
 * al becario en vez de perderla en silencio.
 */
@Entity(tableName = "asistencias_pendientes")
data class AsistenciaPendienteEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val becarioId: String,
    val tipo: String, // "entrada" | "salida"
    val ocurridoEn: String, // ISO-8601, capturado en el momento del registro
    val modalidad: String, // "presencial" | "home_office"
    val latitud: Double?,
    val longitud: Double?,
    val intentos: Int = 0,
    val error: String? = null
)
