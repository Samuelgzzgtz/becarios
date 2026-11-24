import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { asignacionesVigentes, listarPorPerfil, listarPorPerfil as listar, progresoEquipo } from '../../datos/repositorios'
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
      texto={
        perfil === 'becario'
          ? 'Da de alta, cambia datos o quita el acceso en el Dashboard de Clerk. Toda cuenta nueva entra como becario; su matrícula va en Public metadata y para quitarle el acceso usa "Ban user".'
          : 'Da de alta, cambia datos o quita el acceso en el Dashboard de Clerk. Para hacer a alguien ingeniero, agrégalo a la organización Ingenieros; para quitarle el acceso usa "Ban user".'
      }
      tono="info"
      icono={KeyRound}
      textoAccion="Abrir Clerk"
      onAccion={() => window.open(URL_DASHBOARD_CLERK, '_blank', 'noopener')}
    />
  )
}

/**
 * Becarios activos sin ingeniero activo: desde 0026 nadie puede aprobar sus
 * registros ni resolver sus solicitudes hasta que el administrador les asigne uno.
 */
export async function becariosSinIngenieroActivo(): Promise<Set<string>> {
  const [becarios, ingenieros, asignaciones] = await Promise.all([listar('becario'), listar('ingeniero'), asignacionesVigentes()])
  const activos = new Set(ingenieros.map((i) => i.id))
  return new Set(becarios.filter((b) => !activos.has(asignaciones.get(b.id) ?? '')).map((b) => b.id))
}

/**
 * Quién supervisa a quién (progreso_equipo trae el ingeniero y las horas de cada becario
 * activo), para filtrar becarios por ingeniero, contar becarios por ingeniero y mostrar su avance.
 * Si falla, las listas siguen funcionando sin esa información.
 * [ingenieroDe] y [nombreIngeniero] solo cuentan ingenieros activos: un becario asignado a uno
 * inactivo queda "Sin ingeniero" (nadie puede aprobarle, 0026). [becariosDe] cuenta todas las
 * asignaciones, para que un ingeniero dado de baja no aparezca sin becarios.
 */
export function useAsignaciones() {
  const carga = useCarga(
    async () => {
      const [ingenieros, equipo] = await Promise.all([listar('ingeniero').catch(() => null), progresoEquipo().catch(() => null)])
      return {
        ingenieros: ingenieros ?? [],
        // Sin la lista de ingenieros activos no se puede saber quién está sin ingeniero.
        ingenieroDe: equipo && ingenieros ? new Map(equipo.map((b) => [b.becario_id, b.ingeniero_id ?? null])) : null,
        progreso: new Map((equipo ?? []).map((b) => [b.becario_id, b]))
      }
    },
    [],
    ''
  )
  useAlReanudar(carga.recargar)
  const d = carga.datos
  const ingenieroActivo = (becarioId: string) => {
    const id = d?.ingenieroDe?.get(becarioId)
    return id ? d?.ingenieros.find((i) => i.id === id) : undefined
  }
  return {
    ingenieros: d?.ingenieros ?? [],
    conocida: !!d?.ingenieroDe && d.ingenieroDe.size > 0,
    ingenieroDe: (becarioId: string) => ingenieroActivo(becarioId)?.id ?? null,
    nombreIngeniero: (becarioId: string) => ingenieroActivo(becarioId)?.nombre ?? null,
    /** Horas de la semana y del semestre (solo becarios activos con ingeniero); null si no hay. */
    progresoDe: (becarioId: string) => d?.progreso.get(becarioId) ?? null,
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
      {/* El estado solo se marca cuando es la excepción (inactivo o egresado). */}
      {usuario.estado !== 'activo' && <Badge texto={etiquetaEstadoUsuario[usuario.estado]} tono={tonoEstadoUsuario[usuario.estado]} />}
    </div>
  )
}


/** Filtro de estado de las listas de usuarios; null = todos. */
export const OPCIONES_ESTADO: { estado: EstadoUsuario | null; texto: string }[] = [
  { estado: 'activo', texto: 'Activos' },
  { estado: 'inactivo', texto: 'Inactivos' },
  { estado: null, texto: 'Todos' }
]

export function FiltroEstadoUsuarios(props: { actual: EstadoUsuario | null; onCambiar: (e: EstadoUsuario | null) => void }) {
  return (
    <Segmentado
      opciones={OPCIONES_ESTADO.map((o) => o.texto)}
      seleccionado={OPCIONES_ESTADO.findIndex((o) => o.estado === props.actual)}
      onSeleccionar={(i) => props.onCambiar(OPCIONES_ESTADO[i].estado)}
      etiqueta="Estado de la cuenta"
    />
  )
}
