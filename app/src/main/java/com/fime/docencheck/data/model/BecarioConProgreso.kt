package com.fime.docencheck.data.model

/** Un becario junto con su avance de horas. Lo usan Mis Becarios (ingeniero) y Reporte de Horas Global (admin). */
data class BecarioConProgreso(val becario: Usuario, val progreso: ProgresoHoras) {
    companion object {
        /** Adapta una fila de progreso_equipo() (una sola llamada para todo el equipo, M-09). */
        fun desde(fila: ProgresoBecario): BecarioConProgreso = BecarioConProgreso(
            becario = Usuario(id = fila.becario_id, matricula = fila.matricula, nombre = fila.nombre, perfil = Perfil.becario),
            progreso = fila.aProgresoHoras()
        )
    }
}
