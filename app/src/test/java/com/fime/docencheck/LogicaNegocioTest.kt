package com.fime.docencheck

import com.fime.docencheck.core.error.ErrorDeNegocio
import com.fime.docencheck.core.error.MENSAJE_SIN_CONEXION
import com.fime.docencheck.core.error.mensajeAmigable
import com.fime.docencheck.core.util.FechaUi
import com.fime.docencheck.data.model.Asistencia
import com.fime.docencheck.data.model.EstadoReporteSiase
import com.fime.docencheck.data.model.ModalidadTrabajo
import com.fime.docencheck.data.model.ProgresoBecario
import com.fime.docencheck.data.model.TipoAsistencia
import com.fime.docencheck.data.model.horasPorDia
import com.fime.docencheck.data.model.permiteSubir
import com.fime.docencheck.data.model.siguienteTipoSegun
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.LocalDate
import java.time.ZonedDateTime

class LogicaNegocioTest {

    private fun local(fecha: String, hora: String): String =
        ZonedDateTime.of(LocalDate.parse(fecha), java.time.LocalTime.parse(hora), FechaUi.ZONA).toInstant().toString()

    private fun registro(tipo: TipoAsistencia, iso: String) =
        Asistencia(becario_id = "b", tipo = tipo, ocurrido_en = iso, modalidad = ModalidadTrabajo.presencial)

    // C-04: una entrada olvidada no se empareja con la salida del día siguiente.
    @Test
    fun entradaOlvidadaNoSumaVeinticuatroHoras() {
        val horas = horasPorDia(
            listOf(
                registro(TipoAsistencia.entrada, local("2026-10-19", "09:00")),
                registro(TipoAsistencia.salida, local("2026-10-20", "09:00"))
            )
        )
        assertTrue(horas.isEmpty())
    }

    @Test
    fun turnoNormalSumaSusHorasEnElDiaLocal() {
        val horas = horasPorDia(
            listOf(
                registro(TipoAsistencia.entrada, local("2026-10-20", "09:00")),
                registro(TipoAsistencia.salida, local("2026-10-20", "13:30"))
            )
        )
        assertEquals(4.5, horas[LocalDate.parse("2026-10-20")]!!, 0.001)
    }

    // A-06: un turno nocturno local (19:00–22:00 en Monterrey = día siguiente en UTC) cuenta en su día local.
    @Test
    fun turnoNocturnoCuentaEnElDiaLocal() {
        val horas = horasPorDia(
            listOf(
                registro(TipoAsistencia.entrada, local("2026-10-20", "19:00")),
                registro(TipoAsistencia.salida, local("2026-10-20", "22:00"))
            )
        )
        assertEquals(3.0, horas[LocalDate.parse("2026-10-20")]!!, 0.001)
    }

    // B-09: el formato de Postgres (+00:00, microsegundos) se lee igual que el de Instant.
    @Test
    fun parseaFormatoPostgresYZulu() {
        assertNotNull(FechaUi.parsear("2026-10-20T15:03:12.123456+00:00"))
        assertNotNull(FechaUi.parsear("2026-10-20T15:03:12Z"))
        assertNull(FechaUi.parsear("no es fecha"))
    }

    // C-04: decide por día local.
    @Test
    fun siguienteTipoSegunElDia() {
        val hoy = LocalDate.parse("2026-10-20")
        val entradaDeAyer = FechaUi.parsear(local("2026-10-19", "09:00"))
        val entradaDeHoy = FechaUi.parsear(local("2026-10-20", "09:00"))
        assertEquals(TipoAsistencia.entrada, siguienteTipoSegun(TipoAsistencia.entrada, entradaDeAyer, hoy))
        assertEquals(TipoAsistencia.salida, siguienteTipoSegun(TipoAsistencia.entrada, entradaDeHoy, hoy))
        assertEquals(TipoAsistencia.entrada, siguienteTipoSegun(TipoAsistencia.salida, entradaDeHoy, hoy))
        assertEquals(TipoAsistencia.entrada, siguienteTipoSegun(null, null, hoy))
    }

    // M-09: el lunes temprano (0 días laborales terminados) nadie está en riesgo.
    @Test
    fun nadieEnRiesgoSinDiasTerminados() {
        val lunes = ProgresoBecario("b", "N", "M", null, 0.0, 0.0, 0.0, 20.0, 80.0, 480.0, 5, 0)
        assertFalse(lunes.enRiesgo)
        val jueves = lunes.copy(dias_laborales_transcurridos = 3, horas_semana = 4.0) // esperadas 12 h
        assertTrue(jueves.enRiesgo)
        val juevesBien = jueves.copy(horas_semana = 11.0)
        assertFalse(juevesBien.enRiesgo)
    }

    // A-01: solo pendiente/subido admiten re-subida.
    @Test
    fun soloPendienteOSubidoPermitenSubir() {
        assertTrue(EstadoReporteSiase.pendiente.permiteSubir)
        assertTrue(EstadoReporteSiase.subido.permiteSubir)
        assertFalse(EstadoReporteSiase.confirmado.permiteSubir)
        assertFalse(EstadoReporteSiase.excluido.permiteSubir)
        assertFalse(EstadoReporteSiase.sin_reporte.permiteSubir)
    }

    // M-01: mensajes sin texto técnico.
    @Test
    fun mensajesAmigables() {
        assertEquals("Texto de negocio", ErrorDeNegocio("Texto de negocio").mensajeAmigable())
        assertEquals(MENSAJE_SIN_CONEXION, IOException("Unable to resolve host").mensajeAmigable())
        assertEquals("predeterminado", IllegalStateException("NullPointer at x.y").mensajeAmigable("predeterminado"))
    }
}
