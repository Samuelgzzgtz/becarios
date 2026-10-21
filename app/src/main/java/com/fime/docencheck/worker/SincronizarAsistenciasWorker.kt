package com.fime.docencheck.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.fime.docencheck.data.repository.AsistenciaRepository

class SincronizarAsistenciasWorker(
    context: Context,
    params: WorkerParameters,
    private val repository: AsistenciaRepository
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val resultado = repository.sincronizarPendientes()
        return if (resultado.isSuccess) Result.success() else Result.retry()
    }
}
