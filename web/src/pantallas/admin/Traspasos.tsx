import { useState } from 'react'
import { ArrowLeftRight, Check, X } from 'lucide-react'
import { resolverTransferencia, transferenciasPendientes } from '../../datos/repositorios'
import { mensajeAmigable } from '../../lib/errores'
import { plural } from '../../lib/formato'
import type { TransferenciaDetalle } from '../../lib/modelos'
import { Boton, Dialogo, EstadoVacio, Pantalla, SegunEstado } from '../../ui/componentes'
import { useAvisos } from '../../ui/avisos'
import { useAlReanudar, useCarga } from '../../ui/hooks'
import { TarjetaTransferencia } from '../compartido/Transferencia'

export default function Traspasos() {
  const avisos = useAvisos()
  const { estado, datos, recargar } = useCarga(transferenciasPendientes, [], 'No se pudieron cargar las transferencias.')
  useAlReanudar(recargar)
  const [procesando, setProcesando] = useState<Set<string>>(new Set())
  const [confirmacion, setConfirmacion] = useState<{ detalle: TransferenciaDetalle; aprobar: boolean } | null>(null)

  /** La RPC transaccional aprueba (y reasigna) o rechaza, con bloqueo de fila en el servidor (C-06). */
  async function resolver() {
    if (!confirmacion) return
    const { detalle, aprobar } = confirmacion
    setConfirmacion(null)
    const id = detalle.transferencia.id
    if (!id || procesando.has(id)) return
    setProcesando((p) => new Set(p).add(id))
    try {
      const r = await resolverTransferencia(id, aprobar)
      const becario = detalle.becario?.nombre ?? 'el becario'
      avisos.exito(
        r === 'aprobada'
          ? `Transferencia aprobada: ${becario} ahora está con ${detalle.destino?.nombre ?? 'el nuevo ingeniero'}`
          : `Transferencia de ${becario} rechazada`
      )
    } catch (e) {
      avisos.error(mensajeAmigable(e, 'No se pudo resolver la transferencia.'))
    } finally {
      setProcesando((p) => {
        const n = new Set(p)
        n.delete(id)
        return n
      })
      recargar()
    }
  }

  const c = confirmacion
  const becario = c?.detalle.becario?.nombre ?? 'este becario'
  const origen = c?.detalle.origen?.nombre ?? 'su ingeniero actual'
  const destino = c?.detalle.destino?.nombre ?? 'el ingeniero destino'

  return (
    <Pantalla
      titulo="Traspasos"
      etiqueta="Administrador"
      subtitulo={datos ? (datos.length === 0 ? 'Sin solicitudes pendientes' : plural(datos.length, 'solicitud pendiente', 'solicitudes pendientes')) : 'Solicitudes de cambio de ingeniero'}
    >
      {c && (
        <Dialogo
          titulo={c.aprobar ? 'Aprobar traspaso' : 'Rechazar traspaso'}
          mensaje={c.aprobar ? `${becario} pasará de ${origen} a ${destino}.` : `Se rechazará la solicitud para mover a ${becario} de ${origen} a ${destino}.`}
          icono={c.aprobar ? ArrowLeftRight : undefined}
          textoConfirmar={c.aprobar ? 'Aprobar' : 'Rechazar'}
          destructivo={!c.aprobar}
          onConfirmar={resolver}
          onCancelar={() => setConfirmacion(null)}
        />
      )}
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(lista) =>
          lista.length === 0 ? (
            <EstadoVacio
              titulo="Todo al día"
              mensaje="No hay traspasos pendientes. Cuando un ingeniero pida mover a un becario, aparecerá aquí."
              icono={ArrowLeftRight}
            />
          ) : (
            lista.map((d) => {
              const ocupado = !!d.transferencia.id && procesando.has(d.transferencia.id)
              return (
                <TarjetaTransferencia key={d.transferencia.id ?? d.transferencia.created_at} detalle={d}>
                  <div className="fila" style={{ gap: 8 }}>
                    <Boton variante="destructivo-borde" icono={X} deshabilitado={ocupado} className="crece" onClick={() => setConfirmacion({ detalle: d, aprobar: false })}>
                      Rechazar
                    </Boton>
                    <Boton icono={Check} cargando={ocupado} className="crece" onClick={() => setConfirmacion({ detalle: d, aprobar: true })}>
                      Aprobar
                    </Boton>
                  </div>
                </TarjetaTransferencia>
              )
            })
          )
        }
      </SegunEstado>
    </Pantalla>
  )
}
