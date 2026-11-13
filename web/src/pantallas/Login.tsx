import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SignIn, useAuth } from '@clerk/react'
import { CircleAlert, LogOut, RefreshCw, UserLock } from 'lucide-react'
import { cerrarSesion, refrescar, sesionActiva } from '../datos/sesion'
import { ErrorDeNegocio, mensajeAmigable } from '../lib/errores'
import { AvisoBanner, Boton, Logo, Tarjeta } from '../ui/componentes'
import { PantallaCompleta, rutaInicial } from '../ui/navegacion'

/**
 * Inicio de sesión con Clerk (correo y contraseña o cuenta Microsoft UANL).
 * Tras entrar, el perfil de usuarios decide a qué panel va (becario, ingeniero o
 * administración). Si la cuenta aún no tiene acceso, se explica en vez de entrar.
 */
export default function Login() {
  const navegar = useNavigate()
  const { isLoaded, isSignedIn } = useAuth()
  /** sin_acceso: la cuenta no tiene perfil o está de baja. fallo: con sesión, pero no se pudo leer el perfil. */
  const [estado, setEstado] = useState<'verificando' | 'formulario' | 'sin_acceso' | 'fallo'>('verificando')
  const [error, setError] = useState<string | null>(null)
  const [reintentando, setReintentando] = useState(false)

  useEffect(() => {
    document.title = 'Iniciar sesión · Pasalista'
  }, [])

  async function verificar(forzar = false) {
    setError(null)
    try {
      const u = forzar ? await refrescar().then(() => sesionActiva()) : await sesionActiva()
      if (u) navegar(rutaInicial(u.perfil), { replace: true })
      else if (isSignedIn) {
        setError('No se pudo verificar tu sesión. Vuelve a intentar.')
        setEstado('fallo')
      } else setEstado('formulario')
    } catch (e) {
      // Sin perfil asignado o dada de baja en Clerk: se explica. Sin sesión: el
      // formulario con el motivo (A-11). Con sesión, Clerk ya ocultó su formulario:
      // mostrarlo dejaría la pantalla vacía, así que va la tarjeta para reintentar.
      setError(mensajeAmigable(e, 'No se pudo verificar tu sesión.'))
      setEstado(!isSignedIn ? 'formulario' : e instanceof ErrorDeNegocio ? 'sin_acceso' : 'fallo')
    }
  }

  // M-14: mientras se revisa la sesión se muestra el splash, no el formulario.
  useEffect(() => {
    if (!isLoaded) {
      // Sin red Clerk no carga: se intenta con la copia local del perfil.
      if (!navigator.onLine) void verificar()
      return
    }
    // Con sesión, el splash en vez del formulario que Clerk ya ocultó.
    if (isSignedIn) setEstado('verificando')
    void verificar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn])

  if (estado === 'verificando') return <PantallaCompleta texto="Verificando tu sesión…" />

  return (
    <div className="min-h-dvh bg-fondo">
      {/* La marca sobre el fondo, sin encabezado de color. */}
      <header className="flex flex-col items-center gap-1 px-6 pt-[calc(48px+var(--seguro-arriba))] text-center">
        <Logo tamano={56} />
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.01em]">Pasalista</h1>
        <p className="text-texto-2">Control de becarios · FIME UANL</p>
      </header>

      <main className="columna mx-auto max-w-[480px] px-4 py-6">
        {estado === 'sin_acceso' || estado === 'fallo' ? (
          <Tarjeta>
            <div className="columna" style={{ alignItems: 'center', textAlign: 'center', gap: 12, padding: 8 }}>
              <UserLock className="size-7 text-alerta" strokeWidth={1.75} aria-hidden />
              <h2 className="titulo-m">{estado === 'fallo' ? 'No se pudo entrar' : 'Todavía no tienes acceso'}</h2>
              <p className="texto-2">{error ?? 'Tu cuenta aún no tiene acceso a Pasalista.'}</p>
              <Boton
                ancho
                icono={RefreshCw}
                cargando={reintentando}
                onClick={async () => {
                  setReintentando(true)
                  await verificar(true)
                  setReintentando(false)
                }}
              >
                {estado === 'fallo' ? 'Volver a intentar' : 'Ya me dieron acceso'}
              </Boton>
              <Boton
                ancho
                variante="secundario"
                icono={LogOut}
                onClick={async () => {
                  await cerrarSesion()
                  setEstado('formulario')
                  setError(null)
                }}
              >
                Entrar con otra cuenta
              </Boton>
            </div>
          </Tarjeta>
        ) : (
          <>
            {error && <AvisoBanner texto={error} tono="peligro" icono={CircleAlert} />}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <SignIn routing="hash" fallbackRedirectUrl="/login" withSignUp={false} />
            </div>
          </>
        )}
        <p className="chico texto-2" style={{ textAlign: 'center', padding: '16px' }}>
          Te llevamos a tu panel según tu perfil: becario, ingeniero o administración. Las cuentas las da de alta la coordinación.
        </p>
      </main>
    </div>
  )
}
