import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, HardHat, UserRoundCog } from 'lucide-react'
import { plural } from '../../lib/formato'
import { Badge, Boton, Buscador, Desplegable, EstadoVacio, Pantalla, SegunEstado, Tarjeta } from '../../ui/componentes'
import { useAlReanudar } from '../../ui/hooks'
import { AvisoCuentasClerk, EncabezadoUsuario, FiltroEstadoUsuarios, useAsignaciones, useListaUsuarios } from './usuarios'

type FiltroIngeniero = { tipo: 'todos' } | { tipo: 'sin_asignar' } | { tipo: 'de'; id: string; nombre: string }

export default function Becarios() {
  const navegar = useNavigate()
  const lista = useListaUsuarios('becario')
  const asignaciones = useAsignaciones()
  useAlReanudar(lista.recargar)
  const [busqueda, setBusqueda] = useState('')
  const [filtroIng, setFiltroIng] = useState<FiltroIngeniero>({ tipo: 'todos' })

  const opcionesIng: FiltroIngeniero[] = [
    { tipo: 'todos' },
    { tipo: 'sin_asignar' },
    ...asignaciones.ingenieros.map((i) => ({ tipo: 'de' as const, id: i.id, nombre: i.nombre }))
  ]
  const claveIng = (f: FiltroIngeniero) => (f.tipo === 'de' ? f.id : f.tipo)

  return (
    <Pantalla
      titulo="Becarios"
      subtitulo={lista.datos ? plural(lista.datos.length, 'becario', 'becarios') : null}
    >
      <AvisoCuentasClerk perfil="becario" />
      <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Buscar por nombre o matrícula" />
      <FiltroEstadoUsuarios actual={lista.filtro} onCambiar={lista.setFiltro} />
      {asignaciones.ingenieros.length > 0 && (
        <Desplegable
          etiqueta="Ingeniero asesor"
          opciones={opcionesIng}
          seleccionado={opcionesIng.find((o) => claveIng(o) === claveIng(filtroIng)) ?? opcionesIng[0]}
          textoDe={(f) => (f.tipo === 'todos' ? 'Todos los ingenieros' : f.tipo === 'sin_asignar' ? 'Sin asignar' : f.nombre)}
          claveDe={claveIng}
          onSeleccionar={setFiltroIng}
          icono={HardHat}
        />
      )}
      <SegunEstado estado={lista.estado} onReintentar={lista.recargar}>
        {(todos) => {
          const b = busqueda.trim().toLowerCase()
          const filtrados = todos.filter(
            (u) =>
              (!b || u.nombre.toLowerCase().includes(b) || u.matricula.toLowerCase().includes(b)) &&
              (filtroIng.tipo === 'todos' ||
                (filtroIng.tipo === 'sin_asignar' && u.estado === 'activo' && asignaciones.conocida && !asignaciones.ingenieroDe(u.id)) ||
                (filtroIng.tipo === 'de' && asignaciones.ingenieroDe(u.id) === filtroIng.id))
          )
          if (filtrados.length === 0) {
            return (
              <EstadoVacio
                titulo={todos.length === 0 ? 'No hay becarios en esta lista' : 'Sin coincidencias'}
                mensaje={todos.length === 0 ? 'Da de alta un becario con "Nuevo becario".' : 'Prueba con otro filtro o búsqueda.'}
                icono={GraduationCap}
              />
            )
          }
          return filtrados.map((u) => {
            const activo = u.estado === 'activo'
            const ingeniero = asignaciones.nombreIngeniero(u.id)
            return (
              <Tarjeta key={u.id}>
                <EncabezadoUsuario usuario={u} />
                {activo && asignaciones.conocida && (
                  <p className="fila" style={{ gap: 8, marginTop: 12 }}>
                    <HardHat size={18} color="var(--texto-2)" aria-hidden />
                    {ingeniero ? <span>Ingeniero: {ingeniero}</span> : <Badge texto="Sin asignar" tono="alerta" />}
                  </p>
                )}
                <div className="envolver" style={{ marginTop: 12 }}>
                  {activo && (
                    <Boton chico variante="secundario" icono={UserRoundCog} onClick={() => navegar(`/admin/becario/${u.id}/asignar`)}>
                      {ingeniero ? 'Reasignar' : 'Asignar'}
                    </Boton>
                  )}
                </div>
              </Tarjeta>
            )
          })
        }}
      </SegunEstado>
    </Pantalla>
  )
}
