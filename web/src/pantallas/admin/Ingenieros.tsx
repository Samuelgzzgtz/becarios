import { useState } from 'react'
import { Building, HardHat, Users } from 'lucide-react'
import { plural } from '../../lib/formato'
import { Badge, Buscador, EstadoVacio, Pantalla, SegunEstado, Tarjeta } from '../../ui/componentes'
import { useAlReanudar } from '../../ui/hooks'
import { AvisoCuentasClerk, EncabezadoUsuario, FiltroEstadoUsuarios, useAsignaciones, useListaUsuarios } from './usuarios'

export default function Ingenieros() {
  const lista = useListaUsuarios('ingeniero')
  const asignaciones = useAsignaciones()
  useAlReanudar(lista.recargar)
  const [busqueda, setBusqueda] = useState('')

  return (
    <Pantalla
      titulo="Ingenieros"
      subtitulo={lista.datos ? plural(lista.datos.length, 'ingeniero', 'ingenieros') : null}
    >
      <AvisoCuentasClerk perfil="ingeniero" />
      <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Buscar por nombre o número" />
      <FiltroEstadoUsuarios actual={lista.filtro} onCambiar={lista.setFiltro} />
      <SegunEstado estado={lista.estado} onReintentar={lista.recargar}>
        {(todos) => {
          const b = busqueda.trim().toLowerCase()
          const filtrados = todos.filter((u) => !b || u.nombre.toLowerCase().includes(b) || u.matricula.toLowerCase().includes(b))
          if (filtrados.length === 0) {
            return <EstadoVacio titulo={todos.length === 0 ? 'No hay ingenieros en esta lista' : 'Sin coincidencias'} icono={HardHat} />
          }
          return filtrados.map((u) => (
            <Tarjeta key={u.id}>
              <EncabezadoUsuario usuario={u} detalle={`No. ${u.matricula}`} />
              <div className="fila" style={{ marginTop: 12 }}>
                <span className="crece fila" style={{ gap: 6 }}>
                  {u.coordinacion && (
                    <>
                      <Building size={18} color="var(--texto-2)" aria-hidden /> {u.coordinacion}
                    </>
                  )}
                </span>
                {asignaciones.conocida && <Badge texto={plural(asignaciones.becariosDe(u.id), 'becario', 'becarios')} tono="info" icono={Users} />}
              </div>
            </Tarjeta>
          ))
        }}
      </SegunEstado>
    </Pantalla>
  )
}
