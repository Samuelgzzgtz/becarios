import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fechaHora } from '../lib/fechas'
import { Boton, Pantalla, SegunEstado } from '../ui/componentes'
import { useAlReanudar, useCarga } from '../ui/hooks'
import { cambios, nombresDe } from './datos'
import { esMarcacionDiferida } from './modelos'

export function Instantanea({ valor, etiqueta }: { valor: unknown; etiqueta: string }) {
  if (!valor || typeof valor !== 'object' || !('tipo' in valor) || !('ocurrido_en' in valor)) return null
  if ((valor.tipo !== 'entrada' && valor.tipo !== 'salida') || typeof valor.ocurrido_en !== 'string') return null
  const modalidad = 'modalidad' in valor && valor.modalidad === 'home_office' ? 'Home office' : 'Presencial'
  return <p>{etiqueta}: {valor.tipo === 'entrada' ? 'Entrada' : 'Salida'} · {fechaHora(valor.ocurrido_en)} · {modalidad}</p>
}

export default function HistorialCambios() {
  const { id } = useParams()
  const navegar = useNavigate()
  const [pagina, setPagina] = useState(0)
  const carga = useCarga(async () => {
    const resultado = await cambios(pagina, id)
    const nombres = await nombresDe(resultado.filas.map(c => c.becario_id))
    return { ...resultado, nombres }
  }, [pagina, id], 'No se pudo cargar el historial de cambios.')
  useAlReanudar(carga.recargar)
  return (
    <Pantalla titulo="Historial de cambios" onVolver={() => navegar(-1)}>
      <p>Cada cambio conserva el registro anterior, el responsable y su motivo.</p>
      <SegunEstado estado={carga.estado} onReintentar={carga.recargar}>{datos => <>
        {datos.filas.length === 0 && <p>No hay cambios en esta página.</p>}
        {datos.filas.map(c => <section className="tarjeta columna gap-1" key={c.id}>
          <h2 className="titulo-s">{datos.nombres.get(c.becario_id) ?? 'Becario'} · {c.accion === 'agregar' ? 'Registro agregado' : c.accion === 'editar' ? 'Registro modificado' : c.accion === 'aprobar' ? 'Registro aprobado' : 'Registro eliminado'}</h2>
          <p className="chico texto-2">{fechaHora(c.created_at)} · {c.actor_nombre ?? (c.actor_id ? 'Usuario no disponible' : 'Sistema')}</p>
          <Instantanea etiqueta="Antes" valor={c.antes} />
          <Instantanea etiqueta="Después" valor={c.despues} />
          <p>Motivo: {c.motivo ?? (c.accion === 'agregar' && c.actor_id === c.becario_id ? 'Registro de asistencia' : 'Sin motivo registrado')}</p>
          {c.motivo == null && c.accion === 'agregar' && esMarcacionDiferida(c.despues) && <p className="chico texto-2">Recibida más de 5 minutos después de la marcación. La hora proviene del dispositivo; puede haberse guardado sin conexión.</p>}
          {c.solicitud_id && <p>Solicitud: {c.solicitud_id}</p>}
        </section>)}
        <div className="fila"><Boton variante="texto" deshabilitado={pagina === 0} onClick={() => setPagina(p => p - 1)}>Anterior</Boton><span>Página {pagina + 1}</span><Boton variante="texto" deshabilitado={!datos.hayMas} onClick={() => setPagina(p => p + 1)}>Siguiente</Boton></div>
      </>}</SegunEstado>
    </Pantalla>
  )
}
