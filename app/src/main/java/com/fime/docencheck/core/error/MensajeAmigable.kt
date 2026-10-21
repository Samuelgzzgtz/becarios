package com.fime.docencheck.core.error

import androidx.camera.core.ImageCaptureException
import io.github.jan.supabase.auth.exception.AuthErrorCode
import io.github.jan.supabase.auth.exception.AuthRestException
import io.github.jan.supabase.exceptions.HttpRequestException
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.postgrest.exception.PostgrestRestException
import kotlinx.coroutines.CancellationException
import java.io.IOException

/**
 * Error cuyo mensaje ya está escrito para el usuario (validaciones de la app o
 * mensajes en español que devuelve el backend). [mensajeAmigable] lo muestra tal cual.
 */
class ErrorDeNegocio(mensaje: String) : Exception(mensaje)

const val MENSAJE_SIN_CONEXION = "Sin conexión con el servidor. Revisa tu internet e intenta de nuevo."
const val MENSAJE_SESION_EXPIRADA = "Tu sesión expiró. Cierra sesión y vuelve a entrar."
const val MENSAJE_CUENTA_INACTIVA = "Tu cuenta está inactiva; contacta a la coordinación."

/**
 * Como runCatching, pero sin tragarse la cancelación de la corrutina (runCatching
 * atrapa CancellationException y rompe la concurrencia estructurada).
 */
inline fun <T> intentar(bloque: () -> T): Result<T> =
    try {
        Result.success(bloque())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Throwable) {
        Result.failure(e)
    }

/** Fallo de red (sin señal, DNS, timeout): lo único que justifica guardar en cola offline. */
fun Throwable.esErrorDeRed(): Boolean {
    var actual: Throwable? = this
    var profundidad = 0
    while (actual != null && profundidad < 6) {
        if (actual is HttpRequestException || actual is IOException) return true
        if (actual is java.nio.channels.UnresolvedAddressException) return true
        actual = actual.cause.takeIf { it !== actual }
        profundidad++
    }
    return false
}

/** El trigger de asistencias rechazó un registro por duplicado (ver migración 0013). */
fun Throwable.esAsistenciaDuplicada(): Boolean =
    this is PostgrestRestException && hint == "asistencia_duplicada"

/** Sesión inválida o vencida: el registro es válido, pero hay que volver a iniciar sesión. */
fun Throwable.esErrorDeSesion(): Boolean = when (this) {
    is PostgrestRestException -> code == "PGRST301" || code == "PGRST303" || statusCode == 401
    is RestException -> statusCode == 401
    else -> false
}

/**
 * Traduce cualquier excepción a un mensaje en español sin texto técnico.
 * [predeterminado] se usa cuando no se reconoce el error.
 */
fun Throwable.mensajeAmigable(
    predeterminado: String = "Ocurrió un error inesperado. Intenta de nuevo."
): String {
    if (this is ErrorDeNegocio) return message ?: predeterminado
    if (esErrorDeRed()) return MENSAJE_SIN_CONEXION

    return when (this) {
        is AuthRestException -> mensajeDeAuth(this)
        is PostgrestRestException -> mensajeDePostgrest(this, predeterminado)
        is RestException -> when (statusCode) {
            401 -> MENSAJE_SESION_EXPIRADA
            403 -> "No tienes permiso para hacer esto."
            404 -> "No se encontró la información solicitada."
            413 -> "El archivo es demasiado grande."
            429 -> "Demasiados intentos. Espera un momento e intenta de nuevo."
            in 500..599 -> "El servidor no está disponible en este momento. Intenta más tarde."
            else -> predeterminado
        }
        is ImageCaptureException -> "La cámara no está lista. Espera un segundo e intenta de nuevo."
        else -> predeterminado
    }
}

private fun mensajeDeAuth(e: AuthRestException): String = when (e.errorCode) {
    AuthErrorCode.InvalidCredentials -> "Correo o contraseña incorrectos."
    AuthErrorCode.EmailNotConfirmed -> "Tu correo aún no está confirmado; contacta a la coordinación."
    AuthErrorCode.UserBanned -> "Tu cuenta está bloqueada; contacta a la coordinación."
    AuthErrorCode.OverRequestRateLimit -> "Demasiados intentos. Espera un momento e intenta de nuevo."
    else -> when (e.statusCode) {
        400 -> "Correo o contraseña incorrectos."
        401, 403 -> MENSAJE_SESION_EXPIRADA
        429 -> "Demasiados intentos. Espera un momento e intenta de nuevo."
        else -> "No se pudo validar tu sesión. Intenta de nuevo."
    }
}

private fun mensajeDePostgrest(e: PostgrestRestException, predeterminado: String): String {
    val texto = e.error
    return when (e.code) {
        // raise exception de nuestras funciones: el mensaje ya está en español.
        "P0001" -> texto.takeIf { it.isNotBlank() } ?: predeterminado
        "23505" -> when {
            texto.contains("transferencias_pendiente_idx") -> "Este becario ya tiene una solicitud de transferencia pendiente."
            texto.contains("matricula") -> "Esa matrícula ya está registrada."
            texto.contains("enrolamientos_faciales") -> "Este becario ya tiene biometría registrada."
            texto.contains("ingenieros_becarios") -> "Este becario ya tiene un ingeniero asignado."
            else -> "Ese registro ya existe."
        }
        "22P02", "22007", "22008" -> "Algún dato tiene un formato no válido."
        "23514" -> "Algún valor está fuera del rango permitido."
        "23503" -> "El registro está ligado a otros datos y no se puede modificar."
        "42501" -> "No tienes permiso para hacer esto."
        "PGRST116" -> "No se encontró la información solicitada."
        "PGRST301", "PGRST303" -> MENSAJE_SESION_EXPIRADA
        else -> when (e.statusCode) {
            401 -> MENSAJE_SESION_EXPIRADA
            403 -> "No tienes permiso para hacer esto."
            in 500..599 -> "El servidor no está disponible en este momento. Intenta más tarde."
            else -> predeterminado
        }
    }
}
