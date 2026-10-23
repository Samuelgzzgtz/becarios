import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight } from 'lucide-react'
import { transferenciasDelEquipo } from '../../datos/repositorios'
import { requerirUsuario } from '../../datos/sesion'
import { EstadoVacio, Pantalla, SegunEstado, useVolver } from '../../ui/componentes'
import { useAlReanudar, useCarga } from '../../ui/hooks'
import { TarjetaTransferencia } from '../compartido/Transferencia'

export default function Transferencias() {
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
            lista.map((d) => <TarjetaTransferencia key={d.transferencia.id ?? d.transferencia.created_at} detalle={d} />)
          )
        }
      </SegunEstado>
    </Pantalla>
  )
}
