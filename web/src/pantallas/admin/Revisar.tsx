import { useNavigate } from 'react-router-dom'
import { useCarga } from '../../ui/hooks'
import Revisar from '../compartido/Revisar'
import { becariosSinIngenieroActivo } from './usuarios'

/** Registros por revisar de todos los becarios, solo para consulta: los aprueba cada ingeniero. */
export default function RevisarAdmin() {
  const navegar = useNavigate()
  // Si falla, la lista se muestra igual, solo sin el aviso.
  const sinIngeniero = useCarga(() => becariosSinIngenieroActivo(), [], '').datos
  return (
    <Revisar
      rutaVolver="/admin/mas"
      rutaBecario={(id) => `/admin/becario/${id}/asistencias`}
      onNavegar={navegar}
      soloLectura
      rutaAsignar={(id) => (sinIngeniero?.has(id) ? `/admin/becario/${id}/asignar` : null)}
    />
  )
}
