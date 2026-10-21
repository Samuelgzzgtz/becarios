package com.fime.docencheck.core.session

import com.fime.docencheck.core.error.ErrorDeNegocio
import com.fime.docencheck.core.error.esErrorDeRed
import com.fime.docencheck.data.local.CacheLocal
import com.fime.docencheck.data.model.Usuario
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * El perfil (becario/ingeniero/administrador) vive en la tabla usuarios, no en el
 * JWT: se pide una vez tras login/reanudar sesión y se guarda en memoria. Es lo que
 * decide a qué grafo de navegación entra la app (plan, "Alcance y stack").
 *
 * Cambios de la auditoría:
 *  - M-14: espera a que supabase-kt termine de cargar la sesión guardada antes de
 *    preguntar por el usuario (si no, en arranque en frío podía regresar null).
 *  - C-02/A-11: si no hay red, usa la copia local del perfil del mismo usuario en
 *    vez de lanzar (así un becario puede registrar asistencia offline tras reabrir la app).
 *  - Un Mutex evita que varias pantallas disparen la misma consulta a la vez.
 */
class SessionManager(
    private val client: SupabaseClient,
    private val cache: CacheLocal
) {

    @Volatile
    private var usuarioActual: Usuario? = null
    private val candado = Mutex()

    /** El perfil ya cargado, sin red ni suspensión (para guardas de navegación). */
    fun usuarioEnMemoria(): Usuario? = usuarioActual

    /**
     * El usuario autenticado, o null si no hay sesión. Puede lanzar si no hay red
     * Y no hay copia local del perfil.
     */
    suspend fun usuarioAutenticado(): Usuario? = candado.withLock {
        client.auth.awaitInitialization()

        val uid = client.auth.currentUserOrNull()?.id
        if (uid == null) {
            usuarioActual = null
            return@withLock null
        }
        usuarioActual?.takeIf { it.id == uid }?.let { return@withLock it }

        val usuario = try {
            client.postgrest.from("usuarios")
                .select { filter { eq("id", uid) } }
                .decodeSingleOrNull<Usuario>()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            val copia = cache.usuario()?.takeIf { it.id == uid }
            if (e.esErrorDeRed() && copia != null) copia else throw e
        }

        usuario?.let(cache::guardarUsuario)
        usuarioActual = usuario
        usuario
    }

    /** Como [usuarioAutenticado], pero sin sesión lanza un error legible. */
    suspend fun requerirUsuario(): Usuario =
        usuarioAutenticado() ?: throw ErrorDeNegocio("Tu sesión terminó. Vuelve a iniciar sesión.")

    /** Olvida la copia en memoria y vuelve a leer el perfil (p. ej. para revisar el estado al iniciar sesión). */
    suspend fun refrescar(): Usuario? {
        usuarioActual = null
        return usuarioAutenticado()
    }

    fun limpiar() {
        usuarioActual = null
    }
}
