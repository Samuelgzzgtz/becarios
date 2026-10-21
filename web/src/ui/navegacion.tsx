import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  CircleUser,
  ClipboardCheck,
  CloudOff,
  FileText,
  GraduationCap,
  HardHat,
  House,
  LayoutDashboard,
  LayoutGrid,
  ArrowLeftRight,
  Users
} from 'lucide-react'
import { usuarioAutenticado, usuarioEnMemoria } from '../datos/sesion'
import type { Perfil, Usuario } from '../lib/modelos'
import type { Icono } from './componentes'
import { useEnLinea } from './hooks'

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
    { ruta: '/becario/horas', texto: 'Horas', icono: BarChart3 },
    { ruta: '/becario/registros', texto: 'Registros', icono: CalendarDays },
    { ruta: '/becario/siase', texto: 'SIASE', icono: FileText },
    { ruta: '/becario/cuenta', texto: 'Cuenta', icono: CircleUser }
  ],
  ingeniero: [
    { ruta: '/ingeniero', texto: 'Inicio', icono: LayoutDashboard },
    { ruta: '/ingeniero/becarios', texto: 'Becarios', icono: Users },
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

export function rutaInicial(perfil: Perfil): string {
  return DESTINOS[perfil][0].ruta
}

function BarraNavegacion({ destinos }: { destinos: Destino[] }) {
  return (
    <nav className="nav-inferior" aria-label="Secciones">
      <ul>
        {destinos.map((d, i) => {
          const I = d.icono
          return (
            <li key={d.ruta}>
              <NavLink to={d.ruta} end={i === 0} replace className={({ isActive }) => (isActive ? 'activo' : undefined)}>
                <span className="pastilla">
                  <I size={22} aria-hidden />
                </span>
                {d.texto}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function FranjaSinConexion() {
  const enLinea = useEnLinea()
  if (enLinea) return null
  return (
    <div className="franja-offline" role="status">
      <CloudOff size={14} aria-hidden /> Sin conexión: lo que registres se subirá al volver la red.
    </div>
  )
}

/**
 * Sección que solo se muestra si el perfil de la sesión está en [perfil]
 * (auditoría B-12). Si no hay perfil en memoria (recarga de la página), lo carga
 * primero; sin sesión o con otro perfil, manda al login.
 */
export function Protegida({ perfil }: { perfil: Perfil }) {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(() => usuarioEnMemoria() ?? undefined)
  const { pathname } = useLocation()

  useEffect(() => {
    if (usuario !== undefined) return
    usuarioAutenticado()
      .then((u) => setUsuario(u))
      .catch(() => setUsuario(null))
  }, [usuario])

  if (usuario === undefined) return <PantallaCompleta texto="Verificando tu sesión…" />
  if (!usuario || usuario.perfil !== perfil || usuario.estado !== 'activo') return <Navigate to="/login" replace />

  const destinos = DESTINOS[perfil]
  const conBarra = destinos.some((d) => d.ruta === pathname)
  return (
    <div className={`app${conBarra ? ' con-barra' : ''}`}>
      <FranjaSinConexion />
      <Outlet />
      {conBarra && <BarraNavegacion destinos={destinos} />}
    </div>
  )
}

export function PantallaCompleta({ texto, children }: { texto: string; children?: ReactNode }) {
  return (
    <div className="splash" role="status">
      <span className="logo-dc" style={{ width: 96, height: 96, fontSize: 34 }}>
        DC
      </span>
      <p style={{ fontSize: '1.6rem', fontWeight: 700 }}>DocenCheck</p>
      <span className="giro grande" aria-hidden />
      <p style={{ opacity: 0.85 }}>{texto}</p>
      {children}
    </div>
  )
}
