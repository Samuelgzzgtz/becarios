package com.fime.docencheck.core.util

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.Locale

/**
 * Todas las fechas de negocio se calculan en hora de Monterrey, igual que las
 * funciones SQL (migración 0012). No usar ZoneId.systemDefault(): un teléfono
 * con otra zona (o en UTC) movería las fronteras de día/semana/mes.
 */
object FechaUi {

    val ZONA: ZoneId = ZoneId.of("America/Monterrey")
    private val LOCALE: Locale = Locale.forLanguageTag("es-MX")

    private val formatoFechaCorta = DateTimeFormatter.ofPattern("EEE d MMM", LOCALE)
    private val formatoFechaLarga = DateTimeFormatter.ofPattern("d 'de' MMMM yyyy", LOCALE)
    private val formatoHora = DateTimeFormatter.ofPattern("H:mm", LOCALE)
    private val formatoMes = DateTimeFormatter.ofPattern("MMMM yyyy", LOCALE)
    private val formatoDiaMes = DateTimeFormatter.ofPattern("dd/MM", LOCALE)

    fun hoy(): LocalDate = LocalDate.now(ZONA)

    /** Primer día del mes en curso (lo que la tabla reportes_siase usa como "mes"). */
    fun mesActual(): LocalDate = hoy().withDayOfMonth(1)

    fun lunesDe(fecha: LocalDate = hoy()): LocalDate =
        fecha.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))

    /** Medianoche local de esa fecha, como instante absoluto. */
    fun inicioDia(fecha: LocalDate): Instant = fecha.atStartOfDay(ZONA).toInstant()

    /** 0 = domingo .. 6 = sábado, igual que horarios_modalidad.dia_semana. */
    fun diaSemanaTabla(fecha: LocalDate = hoy()): Int =
        fecha.dayOfWeek.let { if (it == DayOfWeek.SUNDAY) 0 else it.value }

    /**
     * Acepta tanto el formato de Postgres ("2026-10-20T15:03:12.123+00:00") como
     * el de Instant.toString() ("...Z"). Devuelve null si no se puede leer.
     */
    fun parsear(texto: String?): Instant? {
        if (texto.isNullOrBlank()) return null
        return runCatching { OffsetDateTime.parse(texto).toInstant() }
            .recoverCatching { Instant.parse(texto) }
            .getOrNull()
    }

    fun fechaLocal(instante: Instant): LocalDate = instante.atZone(ZONA).toLocalDate()

    fun fechaLocal(texto: String?): LocalDate? = parsear(texto)?.let(::fechaLocal)

    /** "Lun 20 oct" */
    fun fechaCorta(instante: Instant): String =
        formatoFechaCorta.format(instante.atZone(ZONA)).replace(".", "").capitalizar()

    fun fechaCorta(fecha: LocalDate): String =
        formatoFechaCorta.format(fecha).replace(".", "").capitalizar()

    /** "9:03" */
    fun hora(instante: Instant): String = formatoHora.format(instante.atZone(ZONA))

    /** "Lun 20 oct · 9:03"; cadena vacía si no se puede leer. */
    fun fechaHora(texto: String?): String =
        parsear(texto)?.let { "${fechaCorta(it)} · ${hora(it)}" } ?: ""

    /** "20 de octubre 2026" */
    fun fechaLarga(fecha: LocalDate): String = formatoFechaLarga.format(fecha)

    /** "Octubre 2026" */
    fun mesLargo(mes: LocalDate): String = formatoMes.format(mes).capitalizar()

    /** "2026-10-01" → "Octubre 2026"; si no se puede leer, devuelve el texto tal cual. */
    fun parsearMes(texto: String): String =
        runCatching { mesLargo(LocalDate.parse(texto)) }.getOrDefault(texto)

    /** "20/10" */
    fun diaMes(fecha: LocalDate): String = formatoDiaMes.format(fecha)

    private fun String.capitalizar(): String = replaceFirstChar { if (it.isLowerCase()) it.titlecase(LOCALE) else it.toString() }
}
