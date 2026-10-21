package com.fime.docencheck.data.model

import com.fime.docencheck.core.util.FechaUi
import kotlinx.serialization.Serializable
import java.time.Duration
import java.time.Instant
import java.time.LocalDate

@Serializable
enum class TipoAsistencia {
    entrada, salida
}

/**
 * Horas por día local (Monterrey). Igual que horas_trabajadas() en SQL (0012):
 * una entrada solo se empareja con la salida inmediata siguiente si ambas son
 * del mismo día; una entrada sin salida ese día no suma (turno abierto).
 */
fun horasPorDia(asistencias: List<Asistencia>): Map<LocalDate, Double> {
    val ordenadas = asistencias
        .mapNotNull { a -> FechaUi.parsear(a.ocurrido_en)?.let { it to a.tipo } }
        .sortedBy { it.first }
    val resultado = mutableMapOf<LocalDate, Double>()

    ordenadas.zipWithNext().forEach { (actual, siguiente) ->
        val (inicio, tipo) = actual
        val (fin, tipoSiguiente) = siguiente
        if (tipo == TipoAsistencia.entrada && tipoSiguiente == TipoAsistencia.salida) {
            val dia = FechaUi.fechaLocal(inicio)
            if (dia == FechaUi.fechaLocal(fin)) {
                val horas = Duration.between(inicio, fin).toMinutes() / 60.0
                resultado[dia] = (resultado[dia] ?: 0.0) + horas.coerceAtLeast(0.0)
            }
        }
    }
    return resultado
}

/**
 * El siguiente registro esperado, decidido por día local (auditoría C-04): si
 * el último fue una entrada de HOY, toca salida; en cualquier otro caso (salida,
 * o una entrada de un día anterior que quedó sin salida) toca entrada.
 */
fun siguienteTipoSegun(ultimoTipo: TipoAsistencia?, ultimoInstante: Instant?, hoy: LocalDate = FechaUi.hoy()): TipoAsistencia =
    if (ultimoTipo == TipoAsistencia.entrada && ultimoInstante != null && FechaUi.fechaLocal(ultimoInstante) == hoy) {
        TipoAsistencia.salida
    } else {
        TipoAsistencia.entrada
    }

@Serializable
enum class ModalidadTrabajo {
    presencial, home_office
}

@Serializable
data class Asistencia(
    val id: String? = null,
    val becario_id: String,
    val tipo: TipoAsistencia,
    val ocurrido_en: String? = null, // lo pone el default de la columna (now())
    val modalidad: ModalidadTrabajo,
    val latitud: Double? = null,
    val longitud: Double? = null,
    val verificado_por: String? = null
)

/** Una asistencia lista para pintar: remota, o todavía en la cola local del teléfono. */
data class AsistenciaUi(val asistencia: Asistencia, val sinSubir: Boolean = false, val rechazo: String? = null)

/** Fila que devuelve la RPC progreso_horas(). */
@Serializable
data class ProgresoHoras(
    val becario_id: String,
    val horas_semana: Double,
    val horas_mes: Double,
    val horas_semestre: Double,
    val meta_semanal: Double?,
    val meta_mensual: Double?,
    val meta_semestral: Double?
)

/** Fila que devuelve la RPC progreso_equipo() (migración 0016). */
@Serializable
data class ProgresoBecario(
    val becario_id: String,
    val nombre: String,
    val matricula: String,
    val ingeniero_id: String? = null,
    val horas_semana: Double,
    val horas_mes: Double,
    val horas_semestre: Double,
    val meta_semanal: Double? = null,
    val meta_mensual: Double? = null,
    val meta_semestral: Double? = null,
    val dias_laborales_semana: Int = 5,
    val dias_laborales_transcurridos: Int = 0
) {
    /** Horas que ya debería llevar esta semana: solo cuentan días laborales terminados (auditoría M-09). */
    val horasEsperadasSemana: Double
        get() {
            val meta = meta_semanal ?: return 0.0
            if (dias_laborales_semana <= 0) return 0.0
            return meta * dias_laborales_transcurridos / dias_laborales_semana
        }

    /** En riesgo: va por debajo del 80 % de lo esperado a la fecha (y ya hubo al menos un día laboral). */
    val enRiesgo: Boolean
        get() = dias_laborales_transcurridos > 0 && horas_semana < horasEsperadasSemana * 0.8

    fun aProgresoHoras(): ProgresoHoras = ProgresoHoras(
        becario_id, horas_semana, horas_mes, horas_semestre, meta_semanal, meta_mensual, meta_semestral
    )
}

/** Fila de exportar_asistencias() (0016): fecha y hora ya en hora local. */
@Serializable
data class FilaExportacion(
    val id: String,
    val matricula: String,
    val nombre: String,
    val tipo: String,
    val modalidad: String,
    val fecha: String,
    val hora: String
)
