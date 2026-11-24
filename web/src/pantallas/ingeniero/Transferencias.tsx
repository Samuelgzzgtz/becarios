import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight } from 'lucide-react'
import { transferenciasDelEquipo } from '../../datos/repositorios'
import { requerirUsuario } from '../../datos/sesion'
import { BuscadorPersonas, EstadoVacio, Pantalla, SegunEstado, SinCoincidencias, useVolver } from '../../ui/componentes'
import { useAlReanudar, useCarga } from '../../ui/hooks'
import { TarjetaTransferencia, coincideTransferencia } from '../compartido/Transferencia'

export default function Transferencias() {
  const [busqueda, setBusqueda] = useState('')
  const navegar = useNavigate()
  const volver = useVolver('/ingeniero')
  const { estado, recargar } = useCarga(
    async () => transferenciasDelEquipo((await requerirUsuario()).id),
    [],
    'No se pudieron cargar las transferencias.'
  )
  useAlReanudar(recargar)

  return (
    <Pantalla titulo="Mis transferencias" subtitulo="Solicitudes de cambio de ingeniero" onVolver={volver}>
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(lista) =>
          lista.length === 0 ? (
            <EstadoVacio
              titulo="No has pedido transferencias"
              mensaje='Para transferir a un becario, entra a Becarios y usa "Transferir" en su tarjeta.'
              icono={ArrowLeftRight}
              textoAccion="Ir a Becarios"
              onAccion={() => navegar('/ingeniero/becarios', { replace: true })}
            />
          ) : (
            <>
              <BuscadorPersonas personas={lista.length} valor={busqueda} onCambio={setBusqueda} placeholder="Buscar por becario o ingeniero" />
              {!lista.some((d) => coincideTransferencia(d, busqueda)) && <SinCoincidencias busqueda={busqueda} />}
              {lista
                .filter((d) => coincideTransferencia(d, busqueda))
                .map((d) => (
                  <TarjetaTransferencia key={d.transferencia.id ?? d.transferencia.created_at} detalle={d} />
                ))}
            </>
          )
        }
      </SegunEstado>
    </Pantalla>
  )
}
