package com.fime.docencheck.data.repository

import com.fime.docencheck.core.error.ErrorDeNegocio
import com.fime.docencheck.core.error.MENSAJE_CUENTA_INACTIVA
import com.fime.docencheck.core.error.intentar
import com.fime.docencheck.core.session.SessionManager
import com.fime.docencheck.data.local.CacheLocal
import com.fime.docencheck.data.model.EstadoUsuario
import com.fime.docencheck.data.model.Usuario
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.SignOutScope
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import kotlinx.coroutines.CancellationException

class AuthRepository(
    private val client: SupabaseClient,
    private val sessionManager: SessionManager,
    private val cache: CacheLocal
) {

    /** El correo se recorta y se pasa a minúsculas: el autocompletado suele agregar un espacio (M-20). */
    suspend fun iniciarSesion(email: String, password: String): Result<Usuario> = intentar {
        client.auth.signInWith(Email) {
            this.email = email.trim().lowercase()
            this.password = password
        }
        val usuario = sessionManager.refrescar()
        if (usuario == null) {
            cerrarSesionLocal()
            throw ErrorDeNegocio("La cuenta no tiene un perfil asignado; contacta a la coordinación.")
        }
        verificarActivo(usuario)
    }

    /**
     * La sesión guardada, si hay. Un usuario dado de baja no entra (A-13): se le
     * cierra la sesión y se lanza un error con el motivo. Sin red y sin copia
     * local del perfil, lanza el error de red para que la pantalla ofrezca reintentar.
     */
    suspend fun sesionActiva(): Usuario? {
        val usuario = sessionManager.usuarioAutenticado() ?: return null
        return verificarActivo(usuario)
    }

    /**
     * Cierra la sesión aunque no haya red (A-11): si el aviso al servidor falla, se
     * borra la sesión local de todos modos. Siempre limpia la copia local del perfil.
     */
    suspend fun cerrarSesion() {
        try {
            client.auth.signOut()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            cerrarSesionLocal()
        }
        sessionManager.limpiar()
        cache.limpiar()
    }

    private suspend fun verificarActivo(usuario: Usuario): Usuario {
        if (usuario.estado != EstadoUsuario.activo) {
            cerrarSesionLocal()
            sessionManager.limpiar()
            cache.limpiar()
            throw ErrorDeNegocio(MENSAJE_CUENTA_INACTIVA)
        }
        return usuario
    }

    private suspend fun cerrarSesionLocal() {
        try {
            client.auth.signOut(SignOutScope.LOCAL)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            runCatching { client.auth.clearSession() }
        }
    }
}
