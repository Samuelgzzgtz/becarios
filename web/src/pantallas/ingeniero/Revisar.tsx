import { useNavigate } from 'react-router-dom'
import Revisar from '../compartido/Revisar'

/** Registros por revisar de los becarios del ingeniero. */
export default function RevisarIngeniero() {
  const navegar = useNavigate()
  return <Revisar rutaVolver="/ingeniero" rutaBecario={(id) => `/ingeniero/becario/${id}/asistencias`} onNavegar={navegar} />
}
