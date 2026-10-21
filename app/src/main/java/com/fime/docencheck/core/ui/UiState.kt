package com.fime.docencheck.core.ui

sealed interface UiState<out T> {
    data object Cargando : UiState<Nothing>
    data class Listo<T>(val datos: T) : UiState<T>
    data class Error(val mensaje: String) : UiState<Nothing>
}
