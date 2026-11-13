import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { entero, plural } from '../../lib/formato'
import { enRiesgo, type EstadoUsuario, type Usuario } from '../../lib/modelos'
import { Badge, Buscador, Desplegable, EstadoVacio, HorasDeMeta, Pantalla, SegunEstado } from '../../ui/componentes'
import { etiquetaEstadoUsuario, tonoEstadoUsuario } from '../../ui/estadosVisuales'
import { useAlReanudar } from '../../ui/hooks'
import { AvisoCuentasClerk, useAsignaciones, useListaUsuarios } from './usuarios'

type FiltroIngeniero = { tipo: 'todos' } | { tipo: 'sin_asignar' } | { tipo: 'de'; id: string; nombre: string }

const ESTADOS: { estado: EstadoUsuario | null; texto: string }[] = [
  { estado: 'activo', texto: 'Activos' },
  { estado: 'inactivo', texto: 'Inactivos' },
  { estado: null, texto: 'Todos' }
]

/**
 * Becarios del sistema. En escritorio (md y más) una tabla con búsqueda, filtro por
 * ingeniero y estado, horas de la semana y del semestre; en el teléfono, filas de dos
 * líneas. El estado solo se marca cuando no es "Activo" (la excepción).
 */
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
  const verAsistencias = (u: Usuario) => navegar(`/admin/becario/${u.id}/asistencias`)
  const asignar = (u: Usuario) => navegar(`/admin/becario/${u.id}/asignar`)

  return (
    <Pantalla titulo="Becarios" subtitulo={lista.datos ? plural(lista.datos.length, 'becario', 'becarios') : null}>
      <div className="flex flex-col gap-2 md:flex-row">
        <div className="md:flex-1">
          <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Nombre o matrícula" />
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex">
          {asignaciones.ingenieros.length > 0 && (
            <div className="md:w-56">
              <Desplegable
                etiqueta="Ingeniero asesor"
                etiquetaOculta
                opciones={opcionesIng}
                seleccionado={opcionesIng.find((o) => claveIng(o) === claveIng(filtroIng)) ?? opcionesIng[0]}
                textoDe={(f) => (f.tipo === 'todos' ? 'Todos los ingenieros' : f.tipo === 'sin_asignar' ? 'Sin ingeniero' : f.nombre)}
                claveDe={claveIng}
                onSeleccionar={setFiltroIng}
              />
            </div>
          )}
          <div className="md:w-36">
            <Desplegable
              etiqueta="Estado de la cuenta"
              etiquetaOculta
              opciones={ESTADOS}
              seleccionado={ESTADOS.find((e) => e.estado === lista.filtro)}
              textoDe={(e) => e.texto}
              claveDe={(e) => e.estado ?? 'todos'}
              onSeleccionar={(e) => lista.setFiltro(e.estado)}
            />
          </div>
        </div>
      </div>

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
                mensaje={todos.length === 0 ? 'Da de alta a los becarios en Clerk.' : 'Prueba con otro filtro o búsqueda.'}
                icono={GraduationCap}
              />
            )
          }
          // Lo que cada fila necesita, calculado una vez para la tabla y para la lista del teléfono.
          const filas = filtrados.map((u) => {
            const activo = u.estado === 'activo'
            const p = asignaciones.progresoDe(u.id)
            return {
              u,
              activo,
              ingeniero: asignaciones.nombreIngeniero(u.id),
              sinIngeniero: activo && asignaciones.conocida && !asignaciones.ingenieroDe(u.id),
              p,
              atrasado: p != null && enRiesgo(p)
            }
          })
          return (
            <>
              {/* Escritorio y tableta */}
              <section className="hidden rounded-lg bg-superficie px-3.5 pt-1 pb-2 md:block" aria-label="Becarios">
                <Table>
                  <TableHeader>
                    <TableRow className="border-regla hover:bg-transparent">
                      <TableHead>Becario</TableHead>
                      <TableHead>Ingeniero</TableHead>
                      <TableHead className="text-right">Semana</TableHead>
                      <TableHead className="text-right">Semestre</TableHead>
                      <TableHead>
                        <span className="sr-only">Estado y acciones</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map(({ u, activo, ingeniero, sinIngeniero, p, atrasado }) => (
                      <TableRow key={u.id} className="border-regla">
                        <TableCell className="py-2.5">
                          <span className="font-medium">{u.nombre}</span> <span className="text-[13px] text-texto-2">{u.matricula}</span>
                        </TableCell>
                        <TableCell>{sinIngeniero ? <Badge texto="Sin ingeniero" tono="alerta" /> : (ingeniero ?? <span className="text-texto-2">–</span>)}</TableCell>
                        <TableCell className="text-right">{p ? <HorasDeMeta horas={p.horas_semana} meta={p.meta_semanal} atrasado={atrasado} /> : <span className="text-texto-2">–</span>}</TableCell>
                        <TableCell className="text-right">{p ? <HorasDeMeta horas={p.horas_semestre} meta={p.meta_semestral} /> : <span className="text-texto-2">–</span>}</TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex items-center gap-3">
                            {!activo && <Badge texto={etiquetaEstadoUsuario[u.estado]} tono={tonoEstadoUsuario[u.estado]} />}
                            {activo && (
                              <Button variant="link" className={cn('min-h-8 h-auto', !sinIngeniero && 'text-texto-2')} onClick={() => asignar(u)}>
                                {ingeniero ? 'Reasignar' : 'Asignar'}
                              </Button>
                            )}
                            <Button variant="link" className="min-h-8 h-auto" onClick={() => verAsistencias(u)} aria-label={`Ver asistencias de ${u.nombre}`}>
                              Ver
                            </Button>
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="px-2 pt-2 text-xs text-texto-2">
                  {entero(filas.length)} de {entero(todos.length)}
                </p>
              </section>

              {/* Teléfono: filas de dos líneas; tocar la fila abre sus asistencias */}
              <section className="rounded-lg bg-superficie px-4 md:hidden" aria-label="Becarios">
                {filas.map(({ u, activo, ingeniero, sinIngeniero, p, atrasado }) => (
                  <div key={u.id} className="fila border-t border-regla first:border-t-0">
                    <button type="button" className="crece py-3 text-left" onClick={() => verAsistencias(u)} aria-label={`Ver asistencias de ${u.nombre}`}>
                      <span className="fila gap-2">
                        <span className="crece truncate font-medium">{u.nombre}</span>
                        {p && <HorasDeMeta horas={p.horas_semana} meta={p.meta_semanal} atrasado={atrasado} />}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-[13px] text-texto-2">
                        <span className="truncate">
                          {u.matricula}
                          {ingeniero ? ` · ${ingeniero}` : ''}
                        </span>
                        {sinIngeniero && <Badge texto="Sin ingeniero" tono="alerta" />}
                        {!activo && <Badge texto={etiquetaEstadoUsuario[u.estado]} tono={tonoEstadoUsuario[u.estado]} />}
                      </span>
                    </button>
                    {activo && (
                      <Button variant="link" className={cn(!sinIngeniero && 'text-texto-2')} onClick={() => asignar(u)}>
                        {ingeniero ? 'Reasignar' : 'Asignar'}
                      </Button>
                    )}
                  </div>
                ))}
              </section>
            </>
          )
        }}
      </SegunEstado>

      <AvisoCuentasClerk perfil="becario" />
    </Pantalla>
  )
}
