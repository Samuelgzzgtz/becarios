package com.fime.docencheck.data.model

import kotlinx.serialization.Serializable

/**
 * embedding_vector es real[] en Postgres (ver migración 0009): llega como
 * arreglo JSON de números, sin encode/decode manual de por medio.
 */
@Serializable
data class EnrolamientoFacial(
    val id: String? = null,
    val becario_id: String,
    val embedding_vector: List<Float>,
    val modelo: String,
    val dimension: Int,
    val activo: Boolean = true,
    val capturado_por: String? = null
)
