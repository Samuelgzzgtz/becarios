package com.fime.docencheck.data.model

import kotlinx.serialization.Serializable

@Serializable
enum class Perfil {
    becario, ingeniero, administrador
}

@Serializable
enum class EstadoUsuario {
    activo, inactivo, egresado
}

@Serializable
data class Usuario(
    val id: String,
    val matricula: String,
    val nombre: String,
    val perfil: Perfil,
    val coordinacion: String? = null,
    val estado: EstadoUsuario = EstadoUsuario.activo
)
