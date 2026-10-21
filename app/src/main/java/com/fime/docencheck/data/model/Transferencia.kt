package com.fime.docencheck.data.model

import kotlinx.serialization.Serializable

@Serializable
enum class EstadoTransferencia {
    pendiente, aprobada, rechazada
}

@Serializable
data class Transferencia(
    val id: String? = null,
    val becario_id: String,
    val ingeniero_origen: String,
    val ingeniero_destino: String,
    val motivo: String,
    val estado: EstadoTransferencia = EstadoTransferencia.pendiente,
    val created_at: String? = null
)

/** Transferencia con los nombres resueltos, para que quien la ve sepa de quién y a dónde (C-06, M-06). */
data class TransferenciaDetalle(
    val transferencia: Transferencia,
    val becario: Usuario?,
    val origen: Usuario?,
    val destino: Usuario?
)
