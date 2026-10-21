package com.fime.docencheck.data.local

import android.content.Context
import com.fime.docencheck.data.model.EnrolamientoFacial
import com.fime.docencheck.data.model.TipoAsistencia
import com.fime.docencheck.data.model.Usuario
import com.fime.docencheck.data.repository.DiaHorario
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

@Serializable
data class UltimoRegistro(val tipo: TipoAsistencia, val ocurrido_en: String)

/**
 * Lo mínimo para que "Registrar asistencia" funcione sin red (auditoría C-02):
 * el perfil del usuario, su embedding facial, su patrón semanal y su último
 * registro. Vive en almacenamiento privado de la app (allowBackup=false) y se
 * borra completo al cerrar sesión.
 *
 * Nota: el embedding es dato biométrico. Igual que en la base (ver README de
 * migraciones, "cifrado del embedding"), hoy queda protegido solo por el
 * sandbox de la app; cifrarlo es parte de la misma decisión pendiente.
 */
class CacheLocal(context: Context) {

    private val prefs = context.getSharedPreferences("docencheck_cache", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    fun guardarUsuario(usuario: Usuario) = escribir(CLAVE_USUARIO, Usuario.serializer(), usuario)
    fun usuario(): Usuario? = leer(CLAVE_USUARIO, Usuario.serializer())

    fun guardarEnrolamiento(becarioId: String, enrolamiento: EnrolamientoFacial?) {
        if (enrolamiento == null) prefs.edit().remove("enrolamiento_$becarioId").apply()
        else escribir("enrolamiento_$becarioId", EnrolamientoFacial.serializer(), enrolamiento)
    }
    fun enrolamiento(becarioId: String): EnrolamientoFacial? =
        leer("enrolamiento_$becarioId", EnrolamientoFacial.serializer())

    fun guardarHorario(becarioId: String, dias: List<DiaHorario>) =
        escribir("horario_$becarioId", ListSerializer(DiaHorario.serializer()), dias)
    fun horario(becarioId: String): List<DiaHorario>? =
        leer("horario_$becarioId", ListSerializer(DiaHorario.serializer()))

    fun guardarUltimoRegistro(becarioId: String, registro: UltimoRegistro) =
        escribir("ultimo_registro_$becarioId", UltimoRegistro.serializer(), registro)
    fun ultimoRegistro(becarioId: String): UltimoRegistro? =
        leer("ultimo_registro_$becarioId", UltimoRegistro.serializer())

    fun limpiar() {
        prefs.edit().clear().apply()
    }

    private fun <T> escribir(clave: String, serializer: KSerializer<T>, valor: T) {
        prefs.edit().putString(clave, json.encodeToString(serializer, valor)).apply()
    }

    private fun <T> leer(clave: String, serializer: KSerializer<T>): T? =
        prefs.getString(clave, null)?.let { texto ->
            runCatching { json.decodeFromString(serializer, texto) }.getOrNull()
        }

    private companion object {
        const val CLAVE_USUARIO = "usuario"
    }
}
