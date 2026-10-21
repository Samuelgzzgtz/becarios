package com.fime.docencheck.core.util

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.max

/**
 * Formatos de presentación (solo UI): horas, conteos y plurales en español de
 * México. Las fechas de negocio siguen en [FechaUi] (zona America/Monterrey).
 */
object FormatoUi {

    private val LOCALE: Locale = Locale.forLanguageTag("es-MX")
    private val simbolos = DecimalFormatSymbols(LOCALE)
    private val formatoHoras = DecimalFormat("#,##0.#", simbolos)
    private val formatoEntero = DecimalFormat("#,##0", simbolos)
    private val formatoDiaCompleto = DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", LOCALE)
    private val formatoDiaMesLargo = DateTimeFormatter.ofPattern("d 'de' MMMM", LOCALE)
    private val formatoFechaMedia = DateTimeFormatter.ofPattern("d MMM yyyy", LOCALE)

    /** 12.5 → "12.5"; 12.0 → "12". Un decimal como máximo. */
    fun numeroHoras(horas: Double): String = formatoHoras.format(horas)

    /** "12.5 h" */
    fun horas(horas: Double): String = "${numeroHoras(horas)} h"

    /** "12.5 / 20 h" o "12.5 h" si no hay meta. */
    fun horasDeMeta(horas: Double, meta: Double?): String =
        if (meta == null || meta <= 0) horas(horas) else "${numeroHoras(horas)} / ${numeroHoras(meta)} h"

    /** Horas que faltan para la meta (nunca negativo). */
    fun faltan(horas: Double, meta: Double): Double = max(0.0, meta - horas)

    /** "1,284" */
    fun entero(n: Int): String = formatoEntero.format(n)

    /** plural(1, "registro", "registros") = "1 registro"; plural(3, ...) = "3 registros". */
    fun plural(n: Int, singular: String, plural: String): String =
        "${entero(n)} ${if (n == 1) singular else plural}"

    /** "Martes 20 de octubre" */
    fun diaCompleto(fecha: LocalDate): String = formatoDiaCompleto.format(fecha).capitalizar()

    /** "20 de octubre" */
    fun diaMesLargo(fecha: LocalDate): String = formatoDiaMesLargo.format(fecha)

    /** "20 oct 2026" */
    fun fechaMedia(fecha: LocalDate): String = formatoFechaMedia.format(fecha).replace(".", "")

    /** "2026-10-26" (o con hora) → fecha local; null si no se puede leer. */
    fun fechaDeTexto(texto: String?): LocalDate? {
        if (texto.isNullOrBlank()) return null
        return runCatching { LocalDate.parse(texto.take(10)) }.getOrNull()
    }

    /** Letra del día para la cuadrícula L–D. */
    fun inicialDia(dia: DayOfWeek): String = when (dia) {
        DayOfWeek.MONDAY -> "L"
        DayOfWeek.TUESDAY -> "M"
        DayOfWeek.WEDNESDAY -> "M"
        DayOfWeek.THURSDAY -> "J"
        DayOfWeek.FRIDAY -> "V"
        DayOfWeek.SATURDAY -> "S"
        DayOfWeek.SUNDAY -> "D"
    }

    /** Nombre completo del día, para lectores de pantalla. */
    fun nombreDia(dia: DayOfWeek): String = when (dia) {
        DayOfWeek.MONDAY -> "Lunes"
        DayOfWeek.TUESDAY -> "Martes"
        DayOfWeek.WEDNESDAY -> "Miércoles"
        DayOfWeek.THURSDAY -> "Jueves"
        DayOfWeek.FRIDAY -> "Viernes"
        DayOfWeek.SATURDAY -> "Sábado"
        DayOfWeek.SUNDAY -> "Domingo"
    }

    /** Primer nombre para saludos ("Ana María López" → "Ana"). */
    fun primerNombre(nombre: String): String = nombre.trim().substringBefore(' ')

    /**
     * Fracción de la semana/mes ya transcurrida, para comparar el avance contra el
     * ritmo esperado (auditoría B-06) en vez de un umbral fijo del 50 %.
     * Semana: días hábiles (L–V) ya terminados / 5. Mes: días terminados / días del mes.
     */
    fun ritmoSemana(hoy: LocalDate = FechaUi.hoy()): Float {
        val terminados = (hoy.dayOfWeek.value - 1).coerceIn(0, 5)
        return terminados / 5f
    }

    fun ritmoMes(hoy: LocalDate = FechaUi.hoy()): Float =
        (hoy.dayOfMonth - 1).toFloat() / hoy.lengthOfMonth()

    private fun String.capitalizar(): String =
        replaceFirstChar { if (it.isLowerCase()) it.titlecase(LOCALE) else it.toString() }
}
