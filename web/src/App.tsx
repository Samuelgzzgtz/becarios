import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { ClerkProvider, useAuth, useClerk } from '@clerk/react'
import { esMX } from '@clerk/localizations'
import { eventosCola, sincronizarPendientes } from './datos/asistencias'
import { registrarClerk } from './datos/sesion'
import { ProveedorAvisos, useAvisos } from './ui/avisos'
import { PantallaCompleta, Protegida } from './ui/navegacion'
import Login from './pantallas/Login'

// Becario
const InicioBecario = lazy(() => import('./pantallas/becario/Inicio'))
const RegistrarAsistencia = lazy(() => import('./pantallas/becario/RegistrarAsistencia'))
const ReporteHoras = lazy(() => import('./pantallas/becario/ReporteHoras'))
const MisRegistros = lazy(() => import('./pantallas/becario/MisRegistros'))
const ReporteSiaseBecario = lazy(() => import('./pantallas/becario/ReporteSiase'))
const MiCuenta = lazy(() => import('./pantallas/compartido/MiCuenta'))

// Ingeniero
const PanelIngeniero = lazy(() => import('./pantallas/ingeniero/Panel'))
const MisBecarios = lazy(() => import('./pantallas/ingeniero/MisBecarios'))
const AsistenciasEquipo = lazy(() => import('./pantallas/ingeniero/AsistenciasEquipo'))
const ReportesSiaseEquipo = lazy(() => import('./pantallas/ingeniero/ReportesSiaseEquipo'))
const Transferencias = lazy(() => import('./pantallas/ingeniero/Transferencias'))
const AsistenciasBecario = lazy(() => import('./pantallas/ingeniero/AsistenciasBecario'))
const Enrolamiento = lazy(() => import('./pantallas/ingeniero/Enrolamiento'))
const Modalidad = lazy(() => import('./pantallas/ingeniero/Modalidad'))
const SolicitarTransferencia = lazy(() => import('./pantallas/ingeniero/SolicitarTransferencia'))

// Administrador
const PanelAdmin = lazy(() => import('./pantallas/admin/Panel'))
const Becarios = lazy(() => import('./pantallas/admin/Becarios'))
const Ingenieros = lazy(() => import('./pantallas/admin/Ingenieros'))
const Traspasos = lazy(() => import('./pantallas/admin/Traspasos'))
const MasAdmin = lazy(() => import('./pantallas/admin/Mas'))
const Semestres = lazy(() => import('./pantallas/admin/Semestres'))
const ReporteHorasGlobal = lazy(() => import('./pantallas/admin/ReporteHorasGlobal'))
const FirmasSiase = lazy(() => import('./pantallas/admin/FirmasSiase'))
const Configuracion = lazy(() => import('./pantallas/admin/Configuracion'))
const Exportar = lazy(() => import('./pantallas/admin/Exportar'))
const AsignarIngeniero = lazy(() => import('./pantallas/admin/AsignarIngeniero'))

/**
 * Sube la cola offline al abrir la app, al volver la red, al regresar a la app y
 * cada 5 minutos mientras está abierta. (iOS no permite sincronizar en segundo
 * plano con la app cerrada; WorkManager lo hacía en Android.)
 */
function Sincronizador() {
  const avisos = useAvisos()
  useEffect(() => {
    let detenido = false
    const sincronizar = async () => {
      if (detenido || !navigator.onLine) return
      const r = await sincronizarPendientes().catch(() => null)
      if (r && r.subidas > 0) avisos.exito(`Se ${r.subidas === 1 ? 'subió 1 registro guardado' : `subieron ${r.subidas} registros guardados`} sin conexión`)
      if (r && r.rechazadas > 0) avisos.error('El servidor rechazó registros guardados sin conexión; revisa "Registros".')
    }
    const alVolver = () => document.visibilityState === 'visible' && void sincronizar()
    void sincronizar()
    window.addEventListener('online', sincronizar)
    document.addEventListener('visibilitychange', alVolver)
    eventosCola.addEventListener('encolada', sincronizar)
    const intervalo = window.setInterval(sincronizar, 5 * 60_000)
    return () => {
      detenido = true
      window.removeEventListener('online', sincronizar)
      document.removeEventListener('visibilitychange', alVolver)
      eventosCola.removeEventListener('encolada', sincronizar)
      window.clearInterval(intervalo)
    }
  }, [avisos])
  return null
}

/** Pasa a datos/sesion.ts el estado de Clerk (usuario, cierre de sesión, perfil). */
function PuenteClerk() {
  const { isLoaded, userId } = useAuth()
  const clerk = useClerk()
  registrarClerk({
    cargado: isLoaded,
    userId: userId ?? null,
    cerrarSesion: () => clerk.signOut(),
    abrirPerfil: () => clerk.openUserProfile()
  })
  return null
}

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined
if (!CLERK_PUBLISHABLE_KEY) throw new Error('Falta VITE_CLERK_PUBLISHABLE_KEY (ver web/.env.example).')

/** Colores de DocenCheck para las pantallas de Clerk (login, perfil). */
const APARIENCIA = {
  variables: {
    colorPrimary: '#1E7145',
    colorText: '#1A1A1A',
    colorTextSecondary: '#5F6B66',
    borderRadius: '12px',
    fontFamily: 'Inter, Roboto, system-ui, sans-serif'
  },
  elements: {
    formButtonPrimary: { borderRadius: '999px', minHeight: '48px', fontSize: '0.95rem' },
    card: { boxShadow: 'none' }
  }
}

function ConRouter() {
  const navegar = useNavigate()
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY!}
      localization={esMX}
      appearance={APARIENCIA}
      routerPush={(to) => navegar(to)}
      routerReplace={(to) => navegar(to, { replace: true })}
      signInUrl="/login"
      signInFallbackRedirectUrl="/login"
      afterSignOutUrl="/login"
    >
      <PuenteClerk />
      <Rutas />
    </ClerkProvider>
  )
}

export default function App() {
  return (
    <ProveedorAvisos>
      <BrowserRouter>
        <ConRouter />
      </BrowserRouter>
    </ProveedorAvisos>
  )
}

function Rutas() {
  return (
    <>
        <Sincronizador />
        <Suspense fallback={<PantallaCompleta texto="Cargando…" />}>
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* Becario: Inicio · Horas · Registros · SIASE · Cuenta */}
            <Route path="/becario" element={<Protegida perfil="becario" />}>
              <Route index element={<InicioBecario />} />
              <Route path="registrar" element={<RegistrarAsistencia />} />
              <Route path="horas" element={<ReporteHoras />} />
              <Route path="registros" element={<MisRegistros />} />
              <Route path="siase" element={<ReporteSiaseBecario />} />
              <Route path="cuenta" element={<MiCuenta />} />
            </Route>

            {/* Ingeniero: Inicio · Becarios · Asistencias · SIASE · Cuenta */}
            <Route path="/ingeniero" element={<Protegida perfil="ingeniero" />}>
              <Route index element={<PanelIngeniero />} />
              <Route path="becarios" element={<MisBecarios />} />
              <Route path="asistencias" element={<AsistenciasEquipo />} />
              <Route path="siase" element={<ReportesSiaseEquipo />} />
              <Route path="cuenta" element={<MiCuenta />} />
              <Route path="transferencias" element={<Transferencias />} />
              <Route path="becario/:id/asistencias" element={<AsistenciasBecario />} />
              <Route path="becario/:id/enrolamiento" element={<Enrolamiento />} />
              <Route path="becario/:id/modalidad" element={<Modalidad />} />
              <Route path="becario/:id/transferir" element={<SolicitarTransferencia />} />
            </Route>

            {/* Administrador: Inicio · Becarios · Ingenieros · Traspasos · Más */}
            <Route path="/admin" element={<Protegida perfil="administrador" />}>
              <Route index element={<PanelAdmin />} />
              <Route path="becarios" element={<Becarios />} />
              <Route path="ingenieros" element={<Ingenieros />} />
              <Route path="traspasos" element={<Traspasos />} />
              <Route path="mas" element={<MasAdmin />} />
              <Route path="cuenta" element={<MiCuenta conVolver />} />
              <Route path="semestres" element={<Semestres />} />
              <Route path="reporte-horas" element={<ReporteHorasGlobal />} />
              <Route path="siase" element={<FirmasSiase />} />
              <Route path="configuracion" element={<Configuracion />} />
              <Route path="exportar" element={<Exportar />} />
              <Route path="becario/:id/asignar" element={<AsignarIngeniero />} />
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
    </>
  )
}
