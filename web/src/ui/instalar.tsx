import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Download, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'

/*
 * En el navegador, Safari y Chrome muestran su barra (en iPhone, abajo). Esa barra
 * solo desaparece cuando la app se abre desde el ícono de la pantalla de inicio
 * (display: standalone). Este aviso lo explica una vez y se puede descartar.
 */

const CLAVE = 'docencheck-aviso-instalar'

interface EventoInstalar extends Event {
  prompt: () => Promise<void>
}

const esApp = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const esIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const esAndroid = () => /Android/i.test(navigator.userAgent)

function yaDescartado(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1'
  } catch {
    return false
  }
}

export default function AvisoInstalar() {
  const [visible, setVisible] = useState(() => (esIos() || esAndroid()) && !esApp() && !yaDescartado())
  const [evento, setEvento] = useState<EventoInstalar | null>(null)
  const ruta = useLocation().pathname

  useEffect(() => {
    const guardar = (e: Event) => {
      e.preventDefault()
      setEvento(e as EventoInstalar)
    }
    const instalada = () => setVisible(false)
    window.addEventListener('beforeinstallprompt', guardar)
    window.addEventListener('appinstalled', instalada)
    return () => {
      window.removeEventListener('beforeinstallprompt', guardar)
      window.removeEventListener('appinstalled', instalada)
    }
  }, [])

  // La cámara de asistencia ocupa toda la pantalla: ahí no estorba.
  if (!visible || ruta.endsWith('/registrar')) return null

  const descartar = () => {
    try {
      localStorage.setItem(CLAVE, '1')
    } catch {
      /* sin almacenamiento: el aviso volverá a salir, no pasa nada */
    }
    setVisible(false)
  }
  const instalar = async () => {
    await evento?.prompt()
    setEvento(null)
  }

  return (
    <div className="fixed top-[calc(8px+var(--seguro-arriba))] left-1/2 z-[55] w-[min(94vw,520px)] -translate-x-1/2" role="status">
      <div className="flex items-start gap-3 rounded-lg bg-superficie px-4 py-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.14)]">
        {esIos() ? <Share className="mt-0.5 size-[18px] shrink-0 text-texto-2" aria-hidden /> : <Download className="mt-0.5 size-[18px] shrink-0 text-texto-2" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="font-medium">Úsala como app, sin la barra del navegador</p>
          <p className="text-[13px] text-texto-2">
            {esIos()
              ? 'Toca Compartir y luego «Agregar a pantalla de inicio». Ábrela desde el ícono.'
              : evento
                ? 'Instálala y ábrela desde el ícono de tu pantalla de inicio.'
                : 'Abre el menú ⋮ y elige «Instalar app» o «Agregar a pantalla de inicio».'}
          </p>
          <div className="-mb-2 flex gap-4">
            {evento && (
              <Button variant="link" className="px-0" onClick={() => void instalar()}>
                Instalar
              </Button>
            )}
            <Button variant="link" className="px-0 text-texto-2" onClick={descartar}>
              Ahora no
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
