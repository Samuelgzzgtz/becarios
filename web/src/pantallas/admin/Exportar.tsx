import { useState } from 'react'
import { CheckCircle2, CircleAlert, Download, Table } from 'lucide-react'
import { exportarAsistenciasCsv } from '../../datos/repositorios'
import { mensajeAmigable } from '../../lib/errores'
import { hoy, lunesDe, mesActual, sumarDias, sumarMeses } from '../../lib/fechas'
import { entero } from '../../lib/formato'
import { AvisoBanner, Boton, CampoTexto, Chip, Divisor, EncabezadoSeccion, Pantalla, Tarjeta, useVolver } from '../../ui/componentes'

const COLUMNAS = ['Matrícula', 'Nombre', 'Tipo', 'Modalidad', 'Fecha', 'Hora']

/** Comparte el archivo (hoja de compartir del teléfono) o, si no se puede, lo descarga. */
async function entregarArchivo(nombre: string, contenido: string) {
  const archivo = new File([contenido], nombre, { type: 'text/csv' })
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: 'Asistencias DocenCheck' })
      return
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(archivo)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export default function Exportar() {
  const volver = useVolver('/admin/mas')
  /** Fechas LOCALES, ambas inclusivas. */
  const [desde, setDesde] = useState(mesActual)
  const [hasta, setHasta] = useState(hoy)
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resumen, setResumen] = useState<string | null>(null)
  const max = hoy()
  const rangoInvalido = !!desde && !!hasta && hasta < desde

  async function generar() {
    if (generando) return
    setGenerando(true)
    setError(null)
    setResumen(null)
    try {
      const r = await exportarAsistenciasCsv(desde, hasta)
      if (r.registros === 0) setResumen('No hay asistencias en ese rango.')
      else {
        setResumen(`${entero(r.registros)} registros exportados`)
        await entregarArchivo(`asistencias_${desde}_a_${hasta}.csv`, r.contenido)
      }
    } catch (e) {
      setError(mensajeAmigable(e, 'No se pudo generar el archivo.'))
    } finally {
      setGenerando(false)
    }
  }

  const rango = (d: string, h: string) => {
    setDesde(d)
    setHasta(h)
  }

  return (
    <Pantalla
      titulo="Exportar asistencias"
      subtitulo="Archivo CSV compatible con Excel"
      onVolver={volver}
      barraAccion={
        <Boton ancho icono={Download} cargando={generando} deshabilitado={!desde || !hasta || rangoInvalido} onClick={generar}>
          {generando ? 'Generando…' : 'Generar y compartir'}
        </Boton>
      }
    >
      <Tarjeta>
        <EncabezadoSeccion titulo="Rango de fechas" />
        <div className="chips" style={{ margin: '8px 0' }}>
          <Chip texto="Esta semana" activo={false} onClick={() => rango(lunesDe(), max)} />
          <Chip texto="Este mes" activo={false} onClick={() => rango(mesActual(), max)} />
          <Chip
            texto="Mes pasado"
            activo={false}
            onClick={() => {
              const inicio = sumarMeses(mesActual(), -1)
              rango(inicio, sumarDias(mesActual(), -1))
            }}
          />
        </div>
        <div className="columna" style={{ gap: 10 }}>
          <CampoTexto etiqueta="Desde" tipo="date" valor={desde} onCambio={setDesde} max={max} />
          <CampoTexto
            etiqueta="Hasta (incluido)"
            tipo="date"
            valor={hasta}
            onCambio={setHasta}
            min={desde}
            max={max}
            error={rangoInvalido ? 'Debe ser igual o posterior a "Desde"' : null}
          />
        </div>
      </Tarjeta>
      <Tarjeta>
        <EncabezadoSeccion titulo="Qué incluye el archivo" icono={Table} />
        <p className="chico texto-2" style={{ marginBottom: 8 }}>
          Una fila por registro, con fecha y hora de Monterrey. Incluye becarios dados de baja.
        </p>
        {COLUMNAS.map((c, i) => (
          <div key={c}>
            {i > 0 && <Divisor />}
            <p style={{ padding: '8px 0' }}>{c}</p>
          </div>
        ))}
      </Tarjeta>
      {error && <AvisoBanner texto={error} tono="peligro" icono={CircleAlert} />}
      {resumen && <AvisoBanner texto={resumen} tono="exito" icono={CheckCircle2} />}
    </Pantalla>
  )
}
