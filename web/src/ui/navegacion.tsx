import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  ArrowLeftRight,
  BarChart3,
  CalendarDays,
  ChartColumn,
  CircleUser,
  ClipboardCheck,
  ClipboardPen,
  CloudOff,
  Download,
  FileText,
  GraduationCap,
  HardHat,
  History,
  Hourglass,
  House,
  LayoutDashboard,
  LayoutGrid,
  SlidersHorizontal,
  Users
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { contarAnomalias } from '../datos/asistencias'
import { indicadores } from '../datos/repositorios'
import { usuarioAutenticado, usuarioEnMemoria } from '../datos/sesion'
import { entero } from '../lib/formato'
import type { Perfil, Usuario } from '../lib/modelos'
import { Logo, type Icono } from './componentes'
import { useCarga, useEnLinea } from './hooks'

interface Destino {
  ruta: string
  texto: string
  icono: Icono
}

/*
 * Destinos de la barra inferior por perfil (auditoría B-03). El primero de cada
 * lista es la raíz del perfil.
 */
export const DESTINOS: Record<Perfil, Destino[]> = {
  becario: [
    { ruta: '/becario', texto: 'Inicio', icono: House },
    { ruta: '/becario/horas', texto: 'Horas', icono: ChartColumn },
    { ruta: '/becario/registros', texto: 'Registros', icono: CalendarDays },
    { ruta: '/becario/siase', texto: 'SIASE', icono: FileText },
    { ruta: '/becario/cuenta', texto: 'Cuenta', icono: CircleUser }
  ],
  ingeniero: [
    { ruta: '/ingeniero', texto: 'Equipo', icono: Users },
    { ruta: '/ingeniero/becarios', texto: 'Becarios', icono: GraduationCap },
    { ruta: '/ingeniero/asistencias', texto: 'Asistencias', icono: CalendarDays },
    { ruta: '/ingeniero/siase', texto: 'SIASE', icono: ClipboardCheck },
    { ruta: '/ingeniero/cuenta', texto: 'Cuenta', icono: CircleUser }
  ],
  administrador: [
    { ruta: '/admin', texto: 'Inicio', icono: LayoutDashboard },
    { ruta: '/admin/becarios', texto: 'Becarios', icono: GraduationCap },
    { ruta: '/admin/ingenieros', texto: 'Ingenieros', icono: HardHat },
    { ruta: '/admin/traspasos', texto: 'Traspasos', icono: ArrowLeftRight },
    { ruta: '/admin/mas', texto: 'Más', icono: LayoutGrid }
  ]
}

export interface Herramienta {
  titulo: string
  detalle: string
  icono: Icono
  ruta: string
}

/** El resto de las herramientas del administrador: la pestaña "Más" en el teléfono y la barra lateral en escritorio. */
export const HERRAMIENTAS_ADMIN: { grupo: string; accesos: Herramienta[] }[] = [
  {
    grupo: 'Seguimiento',
    accesos: [
      { titulo: 'Por revisar', detalle: 'Jornadas largas, turnos sin salida y más', icono: Hourglass, ruta: '/admin/revisar' },
      { titulo: 'Correcciones', detalle: 'Solicitudes de los becarios', icono: ClipboardPen, ruta: '/admin/correcciones' },
      { titulo: 'Historial de cambios', detalle: 'Responsables y motivos de cada cambio', icono: History, ruta: '/admin/historial-cambios' },
      { titulo: 'Firmas SIASE', detalle: 'Firma en lote los reportes mensuales', icono: ClipboardCheck, ruta: '/admin/siase' },
      { titulo: 'Reporte de horas', detalle: 'Avance por ingeniero y becario', icono: BarChart3, ruta: '/admin/reporte-horas' },
      { titulo: 'Exportar asistencias', detalle: 'Genera un CSV para Excel', icono: Download, ruta: '/admin/exportar' }
    ]
  },
  {
    grupo: 'Administración',
    accesos: [
      { titulo: 'Semestres', detalle: 'Periodo actual, cierre y apertura', icono: CalendarDays, ruta: '/admin/semestres' },
      { titulo: 'Configuración', detalle: 'Metas, ventana SIASE, reglas y zonas de registro', icono: SlidersHorizontal, ruta: '/admin/configuracion' }
    ]
  }
]

export function rutaInicial(perfil: Perfil): string {
  return DESTINOS[perfil][0].ruta
}

/** Barra inferior del teléfono: blanca, el destino actual en tinta y seminegrita, sin pastilla. */
function BarraNavegacion({ destinos, className }: { destinos: Destino[]; className?: string }) {
  return (
    <nav className={cn('fixed inset-x-0 bottom-0 z-10 bg-superficie pb-[var(--seguro-abajo)]', className)} aria-label="Secciones">
      <ul className="mx-auto flex h-[var(--barra-nav)] max-w-[720px]">
        {destinos.map((d, i) => {
          const I = d.icono
          return (
            <li key={d.ruta} className="flex-1">
              <NavLink
                to={d.ruta}
                end={i === 0}
                replace
                className={({ isActive }) =>
                  cn('flex h-full flex-col items-center justify-center gap-1 text-[11px] no-underline', isActive ? 'font-semibold text-texto' : 'text-texto-2')
                }
              >
                <I className="size-5" strokeWidth={1.75} aria-hidden />
                {d.texto}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * Barra lateral del administrador en escritorio, sobre el mismo fondo de la página.
 * Los conteos salen de las dos consultas que ya usa el panel (indicadores y por revisar)
 * y se refrescan al cambiar de sección; si fallan, la barra se queda sin números.
 */
function BarraLateralAdmin() {
  const { pathname } = useLocation()
  const { datos } = useCarga(
    async () => {
      const [ind, porRevisar] = await Promise.all([indicadores(), contarAnomalias().catch(() => null)])
      return { ...ind, porRevisar }
    },
    [pathname],
    ''
  )
  const conteos: Record<string, number | null | undefined> = {
    '/admin/becarios': datos?.becarios_activos,
    '/admin/ingenieros': datos?.ingenieros_activos,
    '/admin/traspasos': datos?.transferencias_pendientes || null,
    '/admin/revisar': datos?.porRevisar || null,
    '/admin/siase': datos?.siase_por_firmar || null
  }
  const principales = DESTINOS.administrador.filter((d) => d.ruta !== '/admin/mas')
  const enlace = (d: { ruta: string; texto: string; icono: Icono }, fin = false) => {
    const I = d.icono
    const n = conteos[d.ruta]
    return (
      <NavLink
        key={d.ruta}
        to={d.ruta}
        end={fin}
        className={({ isActive }) =>
          cn(
            'flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] no-underline transition-colors',
            isActive ? 'bg-activo-nav font-medium text-texto' : 'text-texto-2 hover:text-texto'
          )
        }
      >
        <I className="size-4" strokeWidth={1.75} aria-hidden />
        <span className="flex-1 truncate">{d.texto}</span>
        {n != null && <span className="text-xs tabular-nums">{entero(n)}</span>}
      </NavLink>
    )
  }
  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col overflow-y-auto px-3 py-6 lg:flex" aria-label="Secciones">
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <span className="grid size-8 place-items-center rounded-md bg-[#1e7145] text-xs font-bold text-white" aria-hidden>
          PL
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block font-medium">Pasalista</span>
          <span className="block truncate text-xs text-texto-2">{datos?.periodo_nombre ?? 'FIME'}</span>
        </span>
      </div>
      <nav className="flex flex-col gap-0.5">
        {principales.map((d, i) => enlace(d, i === 0))}
        {HERRAMIENTAS_ADMIN.map((g) => (
          <div key={g.grupo} className="contents">
            <p className="px-2 pt-5 pb-1 text-xs text-texto-2">{g.grupo}</p>
            {g.accesos.map((a) => enlace({ ruta: a.ruta, texto: a.titulo, icono: a.icono }))}
          </div>
        ))}
      </nav>
      <div className="mt-auto pt-6">{enlace({ ruta: '/admin/cuenta', texto: 'Mi cuenta', icono: CircleUser })}</div>
    </aside>
  )
}

function FranjaSinConexion() {
  const enLinea = useEnLinea()
  if (enLinea) return null
  return (
    <div className="flex items-center justify-center gap-1.5 bg-elevado px-3 py-1.5 text-center text-xs text-sobre-neutro-c" role="status">
      <CloudOff className="size-3.5 shrink-0" aria-hidden /> Sin conexión: lo que registres se subirá al volver la red.
    </div>
  )
}

/** true en pantallas de 1024 px o más (barra lateral del administrador). */
function useEscritorio(): boolean {
  const consulta = '(min-width: 1024px)'
  const [es, setEs] = useState(() => window.matchMedia(consulta).matches)
  useEffect(() => {
    const m = window.matchMedia(consulta)
    const alCambiar = () => setEs(m.matches)
    m.addEventListener('change', alCambiar)
    return () => m.removeEventListener('change', alCambiar)
  }, [])
  return es
}

/**
 * Sección que solo se muestra si el perfil de la sesión está en [perfil]
 * (auditoría B-12). Si no hay perfil en memoria (recarga de la página), lo carga
 * primero; sin sesión o con otro perfil, manda al login.
 *
 * En el teléfono: una columna con la barra inferior en las pantallas raíz. El
 * administrador en escritorio (≥ 1024 px) tiene barra lateral en todas sus pantallas.
 */
export function Protegida({ perfil }: { perfil: Perfil }) {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(() => usuarioEnMemoria() ?? undefined)
  const { pathname } = useLocation()
  const escritorio = useEscritorio()

  useEffect(() => {
    if (usuario !== undefined) return
    usuarioAutenticado()
      .then((u) => setUsuario(u))
      .catch(() => setUsuario(null))
  }, [usuario])

  if (usuario === undefined) return <PantallaCompleta texto="Verificando tu sesión…" />
  if (!usuario || usuario.perfil !== perfil || usuario.estado !== 'activo') return <Navigate to="/login" replace />

  const destinos = DESTINOS[perfil]
  const lateral = perfil === 'administrador' && escritorio
  const conBarra = !lateral && destinos.some((d) => d.ruta === pathname)
  // La barra inferior es fija: el contenido y las barras de acción dejan su alto libre.
  const estilo = { '--alto-barra': conBarra ? 'calc(var(--barra-nav) + var(--seguro-abajo))' : '0px' } as CSSProperties
  return (
    <div className={cn('mx-auto flex min-h-dvh w-full', lateral ? 'max-w-[1360px] lg:pr-6' : 'max-w-[720px]')} style={estilo}>
      {lateral && <BarraLateralAdmin />}
      <div className="flex min-w-0 flex-1 flex-col pb-[var(--alto-barra)]">
        <FranjaSinConexion />
        <Outlet />
      </div>
      {conBarra && <BarraNavegacion destinos={destinos} />}
    </div>
  )
}

/** Mientras carga la sesión: la marca sobre el fondo, sin degradado. */
export function PantallaCompleta({ texto, children }: { texto: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-fondo px-6 text-center" role="status">
      <Logo tamano={64} />
      <p className="mt-1 text-xl font-semibold">Pasalista</p>
      <span className="giro grande mt-2" aria-hidden />
      <p className="text-texto-2">{texto}</p>
      {children}
    </div>
  )
}
