package com.fime.docencheck

import android.app.Application
import androidx.work.BackoffPolicy
import androidx.work.Configuration
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.fime.docencheck.core.session.SessionManager
import com.fime.docencheck.core.supabase.SupabaseProvider
import com.fime.docencheck.data.local.AppDatabase
import com.fime.docencheck.data.local.CacheLocal
import com.fime.docencheck.data.repository.AdminRepository
import com.fime.docencheck.data.repository.AsistenciaRepository
import com.fime.docencheck.data.repository.AuthRepository
import com.fime.docencheck.data.repository.EnrolamientoRepository
import com.fime.docencheck.data.repository.EquipoRepository
import com.fime.docencheck.data.repository.HorarioRepository
import com.fime.docencheck.data.repository.ProgresoRepository
import com.fime.docencheck.data.repository.SiaseRepository
import com.fime.docencheck.data.repository.TransferenciaRepository
import com.fime.docencheck.worker.DocenCheckWorkerFactory
import com.fime.docencheck.worker.SincronizarAsistenciasWorker
import java.util.concurrent.TimeUnit

/**
 * Sin framework de inyección de dependencias: el alcance de la app no lo
 * justifica todavía. Las pantallas leen estos repositorios vía
 * (LocalContext.current.applicationContext as DocenCheckApp).
 */
class DocenCheckApp : Application(), Configuration.Provider {

    private val database: AppDatabase by lazy { AppDatabase.crear(this) }

    val cacheLocal: CacheLocal by lazy { CacheLocal(this) }

    val sessionManager: SessionManager by lazy { SessionManager(SupabaseProvider.client, cacheLocal) }

    val authRepository: AuthRepository by lazy {
        AuthRepository(SupabaseProvider.client, sessionManager, cacheLocal)
    }

    val asistenciaRepository: AsistenciaRepository by lazy {
        AsistenciaRepository(
            SupabaseProvider.client,
            database.asistenciaPendienteDao(),
            cacheLocal,
            alEncolar = ::sincronizarEnCuantoHayaRed
        )
    }

    val progresoRepository: ProgresoRepository by lazy { ProgresoRepository(SupabaseProvider.client) }

    val siaseRepository: SiaseRepository by lazy { SiaseRepository(SupabaseProvider.client) }

    val horarioRepository: HorarioRepository by lazy { HorarioRepository(SupabaseProvider.client, cacheLocal) }

    val enrolamientoRepository: EnrolamientoRepository by lazy {
        EnrolamientoRepository(SupabaseProvider.client, cacheLocal)
    }

    val equipoRepository: EquipoRepository by lazy { EquipoRepository(SupabaseProvider.client) }

    val transferenciaRepository: TransferenciaRepository by lazy { TransferenciaRepository(SupabaseProvider.client) }

    val adminRepository: AdminRepository by lazy { AdminRepository(SupabaseProvider.client) }

    /**
     * WorkManager se inicializa bajo demanda con esta configuración (la
     * auto-inicialización está desactivada en el manifest; auditoría C-01).
     */
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(DocenCheckWorkerFactory(asistenciaRepository))
            .build()

    override fun onCreate() {
        super.onCreate()
        programarSincronizacion()
    }

    private val conRed: Constraints
        get() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /** 15 minutos es el mínimo que permite WorkManager para trabajo periódico. */
    private fun programarSincronizacion() {
        val peticion = PeriodicWorkRequestBuilder<SincronizarAsistenciasWorker>(15, TimeUnit.MINUTES)
            .setConstraints(conRed)
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "sincronizar_asistencias",
            ExistingPeriodicWorkPolicy.KEEP,
            peticion
        )
    }

    /** Tras guardar un registro en cola: subirlo apenas vuelva la conexión. */
    fun sincronizarEnCuantoHayaRed() {
        val peticion = OneTimeWorkRequestBuilder<SincronizarAsistenciasWorker>()
            .setConstraints(conRed)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(this).enqueueUniqueWork(
            "sincronizar_asistencias_ahora",
            ExistingWorkPolicy.REPLACE,
            peticion
        )
    }
}
