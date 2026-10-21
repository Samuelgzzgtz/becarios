package com.fime.docencheck.worker

import android.content.Context
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.ListenableWorker
import com.fime.docencheck.data.repository.AsistenciaRepository

class DocenCheckWorkerFactory(
    private val asistenciaRepository: AsistenciaRepository
) : WorkerFactory() {

    override fun createWorker(
        appContext: Context,
        workerClassName: String,
        workerParameters: WorkerParameters
    ): ListenableWorker? = when (workerClassName) {
        SincronizarAsistenciasWorker::class.java.name ->
            SincronizarAsistenciasWorker(appContext, workerParameters, asistenciaRepository)
        else -> null
    }
}
