import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, CircleAlert, Save, Trophy } from 'lucide-react'
import { guardarConfiguracion, metasGlobales, ventanaConfig } from '../../datos/repositorios'
import { mensajeAmigable } from '../../lib/errores'
import { AvisoBanner, Boton, CampoTexto, EncabezadoSeccion, Pantalla, SegunEstado, Tarjeta, useVolver } from '../../ui/componentes'
import { useCarga } from '../../ui/hooks'

type Campo = 'semanal' | 'mensual' | 'semestral' | 'apertura' | 'cierre'

const numero = (v: number | null | undefined) => (v == null ? '' : String(v))
/** Acepta "20,5" además de "20.5" (M-10). */
const aDecimal = (t: string) => {
  const v = t.trim().replace(',', '.')
  return v === '' || Number.isNaN(Number(v)) ? null : Number(v)
}
const aEntero = (t: string) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : null)

export default function Configuracion() {
  const volver = useVolver('/admin/mas')
  const { estado, datos, recargar } = useCarga(
    async () => {
      const [metas, ventana] = await Promise.all([metasGlobales(), ventanaConfig()])
      return { metas, ventana }
    },
    [],
    'No se pudo cargar la configuración.'
  )
  const [f, setF] = useState<Record<Campo, string>>({ semanal: '', mensual: '', semestral: '', apertura: '', cierre: '' })
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({})
  const [mensaje, setMensaje] = useState<{ texto: string; exito: boolean } | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!datos) return
    setF({
      semanal: numero(datos.metas?.meta_semanal),
      mensual: numero(datos.metas?.meta_mensual),
      semestral: numero(datos.metas?.meta_semestral),
      apertura: numero(datos.ventana?.dia_apertura),
      cierre: numero(datos.ventana?.dia_cierre)
    })
  }, [datos])

  const cambiar = (c: Campo) => (v: string) => {
    setF((x) => ({ ...x, [c]: v }))
    setMensaje(null)
  }

  async function guardar() {
    if (guardando) return
    const semanal = aDecimal(f.semanal)
    const mensual = aDecimal(f.mensual)
    const semestral = aDecimal(f.semestral)
    const apertura = aEntero(f.apertura)
    const cierre = aEntero(f.cierre)
    const e: Partial<Record<Campo, string>> = {}
    const meta = 'Escribe un número mayor o igual a 0'
    if (semanal == null || semanal < 0) e.semanal = meta
    if (mensual == null || mensual < 0) e.mensual = meta
    if (semestral == null || semestral < 0) e.semestral = meta
    if (apertura == null || apertura < 1 || apertura > 31) e.apertura = 'Día entre 1 y 31'
    if (cierre == null || cierre < 1 || cierre > 31) e.cierre = 'Día entre 1 y 31'
    if (!e.apertura && !e.cierre && apertura! > cierre!) e.cierre = 'El cierre debe ser igual o posterior a la apertura'
    setErrores(e)
    if (Object.keys(e).length > 0) {
      setMensaje({ texto: 'Revisa los campos marcados.', exito: false })
      return
    }
    setGuardando(true)
    setMensaje(null)
    try {
      // Una sola transacción en el servidor: ya no queda "metas sí, ventana no" (M-10).
      await guardarConfiguracion(semanal!, mensual!, semestral!, apertura!, cierre!)
      setMensaje({ texto: 'Configuración guardada', exito: true })
    } catch (err) {
      setMensaje({ texto: mensajeAmigable(err, 'No se pudo guardar la configuración.'), exito: false })
    } finally {
      setGuardando(false)
    }
  }

  const a = aEntero(f.apertura)
  const c = aEntero(f.cierre)
  const sufijoH = <span className="texto-2">h</span>

  return (
    <Pantalla
      titulo="Configuración"
      subtitulo="Metas de horas y ventana SIASE"
      onVolver={volver}
      barraAccion={
        datos && (
          <Boton ancho icono={Save} cargando={guardando} onClick={guardar}>
            Guardar cambios
          </Boton>
        )
      }
    >
      <SegunEstado estado={estado} onReintentar={recargar}>
        {() => (
          <>
            {mensaje && <AvisoBanner texto={mensaje.texto} tono={mensaje.exito ? 'exito' : 'peligro'} icono={mensaje.exito ? CheckCircle2 : CircleAlert} />}
            <Tarjeta>
              <EncabezadoSeccion titulo="Metas requeridas" icono={Trophy} />
              <p className="chico texto-2" style={{ marginBottom: 8 }}>
                Horas que cada becario debe cumplir. Acepta decimales (20.5 o 20,5).
              </p>
              <div className="columna" style={{ gap: 10 }}>
                <CampoTexto etiqueta="Meta semanal" valor={f.semanal} onCambio={cambiar('semanal')} modoTeclado="decimal" error={errores.semanal} sufijo={sufijoH} />
                <CampoTexto etiqueta="Meta mensual" valor={f.mensual} onCambio={cambiar('mensual')} modoTeclado="decimal" error={errores.mensual} sufijo={sufijoH} />
                <CampoTexto etiqueta="Meta semestral" valor={f.semestral} onCambio={cambiar('semestral')} modoTeclado="decimal" error={errores.semestral} sufijo={sufijoH} />
              </div>
            </Tarjeta>
            <Tarjeta>
              <EncabezadoSeccion titulo="Ventana SIASE" icono={CalendarDays} />
              <p className="chico texto-2" style={{ marginBottom: 8 }}>
                Días del mes en que los becarios pueden subir su reporte.
              </p>
              <div className="fila" style={{ alignItems: 'flex-start' }}>
                <div className="crece">
                  <CampoTexto etiqueta="Abre el día" valor={f.apertura} onCambio={cambiar('apertura')} modoTeclado="numeric" error={errores.apertura} />
                </div>
                <div className="crece">
                  <CampoTexto etiqueta="Cierra el día" valor={f.cierre} onCambio={cambiar('cierre')} modoTeclado="numeric" error={errores.cierre} onEnter={guardar} />
                </div>
              </div>
              {a != null && c != null && a >= 1 && c <= 31 && a <= c && (
                <p style={{ marginTop: 8 }}>
                  Los becarios podrán entregar del día {a} al {c} de cada mes.
                </p>
              )}
            </Tarjeta>
          </>
        )}
      </SegunEstado>
    </Pantalla>
  )
}
