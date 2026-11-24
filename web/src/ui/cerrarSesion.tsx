import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as asistencias from '../datos/asistencias'
import { cerrarSesion, usuarioEnMemoria } from '../datos/sesion'
import { plural } from '../lib/formato'
import { Dialogo } from './componentes'

/**
 * Cerrar sesión desde cualquier lugar (Mi cuenta, barra lateral, Más). Funciona aunque
 * la cuenta no haya cargado o no haya red (A-11/A-12): antes de borrar algo intenta
 * subir la cola offline y, si aún quedan registros, pide confirmación. [dialogo] se
 * pinta junto al botón que llama a [pedir].
 */
export function useCerrarSesion() {
  const navegar = useNavigate()
  const [cerrando, setCerrando] = useState(false)
  const [pendientes, setPendientes] = useState<number | null>(null)

  async function terminar() {
    // La cola es del usuario que se va: no debe pasar al siguiente que entre en este teléfono (A-12).
    const id = usuarioEnMemoria()?.id
    if (id) await asistencias.descartarPendientes(id).catch(() => undefined)
    await cerrarSesion()
    navegar('/login', { replace: true })
  }

  async function pedir() {
    if (cerrando) return
    setCerrando(true)
    const id = usuarioEnMemoria()?.id
    if (id && (await asistencias.pendientesSinSubir(id)) > 0) {
      await asistencias.sincronizarPendientes().catch(() => undefined)
      const restantes = await asistencias.pendientesSinSubir(id)
      if (restantes > 0) {
        setPendientes(restantes)
        setCerrando(false)
        return
      }
    }
    await terminar()
  }

  const dialogo = pendientes != null && (
    <Dialogo
      titulo="Tienes registros sin subir"
      mensaje={`${plural(pendientes, 'registro de asistencia no se ha', 'registros de asistencia no se han')} podido subir por falta de conexión. Si cierras sesión ahora se perderán. Conéctate a internet y espera a que se suban, o confirma para salir de todos modos.`}
      textoConfirmar="Salir y descartarlos"
      destructivo
      onConfirmar={() => {
        setPendientes(null)
        setCerrando(true)
        void terminar()
      }}
      onCancelar={() => setPendientes(null)}
    />
  )

  return { pedir, cerrando, dialogo }
}
