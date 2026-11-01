import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Download, Share } from 'lucide-react'

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
    <div className="instalar" role="status">
      <div className="banner tono-info">
        {esIos() ? <Share size={20} /> : <Download size={20} />}
        <div>
          <p className="titulo">Úsala como app, sin la barra del navegador</p>
          <p>
            {esIos()
              ? 'Toca Compartir y luego «Agregar a pantalla de inicio». Ábrela desde el ícono.'
              : evento
                ? 'Instálala y ábrela desde el ícono de tu pantalla de inicio.'
                : 'Abre el menú ⋮ y elige «Instalar app» o «Agregar a pantalla de inicio».'}
          </p>
          <div className="acciones">
            {evento && <button onClick={() => void instalar()}>Instalar</button>}
            <button onClick={descartar}>Ahora no</button>
          </div>
        </div>
      </div>
    </div>
  )
}
