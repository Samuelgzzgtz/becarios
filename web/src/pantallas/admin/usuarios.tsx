import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { listarPorPerfil, listarPorPerfil as listar, progresoEquipo } from '../../datos/repositorios'
import type { EstadoUsuario, Perfil, Usuario } from '../../lib/modelos'
import { Avatar, AvisoBanner, Badge, Segmentado } from '../../ui/componentes'
import { etiquetaEstadoUsuario, tonoEstadoUsuario } from '../../ui/estadosVisuales'
import { useAlReanudar, useCarga } from '../../ui/hooks'

/**
 * Lista de becarios o ingenieros con filtro de estado. Las altas, bajas y
 * cambios de datos se hacen en el Dashboard de Clerk (el webhook los refleja aquí).
 */
export function useListaUsuarios(perfil: Perfil) {
  /** null = todos. Por omisión solo activos. */
  const [filtro, setFiltro] = useState<EstadoUsuario | null>('activo')
  const carga = useCarga(
    async () => (await listarPorPerfil(perfil, filtro !== 'activo')).filter((u) => filtro == null || u.estado === filtro),
    [perfil, filtro],
    'No se pudo cargar la lista.'
  )
  return { ...carga, filtro, setFiltro }
}

export const URL_DASHBOARD_CLERK = 'https://dashboard.clerk.com/last-active?path=users'

/** Aviso de dónde se administran las cuentas, con acceso directo a Clerk. */
export function AvisoCuentasClerk({ perfil }: { perfil: 'becario' | 'ingeniero' }) {
  return (
    <AvisoBanner
      titulo="Cuentas y accesos en Clerk"
      texto={`Para dar de alta, cambiar datos o quitar el acceso a un ${perfil}, usa el Dashboard de Clerk. Pon su perfil ("${perfil}") y matrícula en Public metadata; para quitarle el acceso usa "Ban user".`}
      tono="info"
      icono={KeyRound}
      textoAccion="Abrir Clerk"
      onAccion={() => window.open(URL_DASHBOARD_CLERK, '_blank', 'noopener')}
    />
  )
}

/**
 * Quién supervisa a quién (progreso_equipo trae el ingeniero de cada becario
 * activo), para filtrar becarios por ingeniero y contar becarios por ingeniero.
 * Si falla, las listas siguen funcionando sin esa información.
 */
export function useAsignaciones() {
  const carga = useCarga(
    async () => {
      const [ingenieros, equipo] = await Promise.all([listar('ingeniero').catch(() => []), progresoEquipo().catch(() => null)])
      return { ingenieros, ingenieroDe: equipo ? new Map(equipo.map((b) => [b.becario_id, b.ingeniero_id ?? null])) : null }
    },
    [],
    ''
  )
  useAlReanudar(carga.recargar)
  const d = carga.datos
  return {
    ingenieros: d?.ingenieros ?? [],
    conocida: !!d?.ingenieroDe && d.ingenieroDe.size > 0,
    ingenieroDe: (becarioId: string) => d?.ingenieroDe?.get(becarioId) ?? null,
    nombreIngeniero: (becarioId: string) => {
      const id = d?.ingenieroDe?.get(becarioId)
      return id ? (d?.ingenieros.find((i) => i.id === id)?.nombre ?? null) : null
    },
    becariosDe: (ingenieroId: string) => (d?.ingenieroDe ? [...d.ingenieroDe.values()].filter((v) => v === ingenieroId).length : 0),
    recargar: carga.recargar
  }
}



/** Encabezado de tarjeta de usuario: avatar, nombre, matrícula y estado. */
export function EncabezadoUsuario({ usuario, detalle }: { usuario: Usuario; detalle?: string }) {
  return (
    <div className="fila">
      <Avatar nombre={usuario.nombre} />
      <div className="crece">
        <p className="titulo-m recortar">{usuario.nombre}</p>
        <p className="chico texto-2 recortar">{detalle ?? `Matrícula ${usuario.matricula}`}</p>
      </div>
      <Badge texto={etiquetaEstadoUsuario[usuario.estado]} tono={tonoEstadoUsuario[usuario.estado]} />
    </div>
  )
}


const ESTADOS: (EstadoUsuario | null)[] = ['activo', 'inactivo', null]

export function FiltroEstadoUsuarios(props: { actual: EstadoUsuario | null; onCambiar: (e: EstadoUsuario | null) => void }) {
  return (
    <Segmentado
      opciones={['Activos', 'Inactivos', 'Todos']}
      seleccionado={ESTADOS.indexOf(props.actual)}
      onSeleccionar={(i) => props.onCambiar(ESTADOS[i])}
      etiqueta="Estado de la cuenta"
    />
  )
}
