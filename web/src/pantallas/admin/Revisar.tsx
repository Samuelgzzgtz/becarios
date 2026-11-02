import { useNavigate } from 'react-router-dom'
import Revisar from '../compartido/Revisar'

/** Registros por revisar de todos los becarios. */
export default function RevisarAdmin() {
  const navegar = useNavigate()
  return <Revisar rutaVolver="/admin/mas" rutaBecario={(id) => `/admin/becario/${id}/asistencias`} onNavegar={navegar} />
}
