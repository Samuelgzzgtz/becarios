import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Info } from 'lucide-react'
import { configurarDia, quitarDia, semanaDe, usuario as obtenerUsuario } from '../../datos/repositorios'
import { mensajeAmigable } from '../../lib/errores'
import type { ModalidadTrabajo } from '../../lib/modelos'
import { AvisoBanner, Divisor, EncabezadoSeccion, Pantalla, Segmentado, SegunEstado, Tarjeta, etiquetaModalidad, iconoModalidad, useVolver } from '../../ui/componentes'
import { useAvisos } from '../../ui/avisos'
import { useCarga } from '../../ui/hooks'
import { Leyenda } from '../becario/ReporteHoras'

/** dia_semana: 0 = domingo .. 6 = sábado, igual que la tabla horarios_modalidad. */
const DIAS: [number, string][] = [
  [1, 'Lunes'],
  [2, 'Martes'],
  [3, 'Miércoles'],
  [4, 'Jueves'],
  [5, 'Viernes'],
  [6, 'Sábado'],
  [0, 'Domingo']
]

const OPCIONES: (ModalidadTrabajo | null)[] = ['presencial', 'home_office', null]

/**
 * El mapa solo trae los días CONFIGURADOS; un día ausente es "No aplica" y no
 * se pinta como Presencial (M-07). Cada cambio se guarda al momento.
 */
export default function Modalidad() {
  const { id = '' } = useParams()
  const volver = useVolver('/ingeniero/becarios')
  const avisos = useAvisos()
  const nombre = useCarga(() => obtenerUsuario(id).then((u) => u?.nombre ?? null), [id], '')
  const { estado, recargar, actualizar } = useCarga(
    async () => new Map((await semanaDe(id)).map((d) => [d.dia_semana, d.modalidad] as const)),
    [id],
    'No se pudo cargar el horario.'
  )
  const [guardando, setGuardando] = useState<Set<number>>(new Set())

  async function cambiar(dia: number, nombreDia: string, modalidad: ModalidadTrabajo | null) {
    if (guardando.has(dia)) return
    setGuardando((g) => new Set(g).add(dia))
    try {
      if (modalidad) await configurarDia(id, dia, modalidad)
      else await quitarDia(id, dia)
      // Sobre el estado VIGENTE: dos toques rápidos en días distintos no se pisan (M-07).
      actualizar((m) => {
        const nuevo = new Map(m)
        if (modalidad) nuevo.set(dia, modalidad)
        else nuevo.delete(dia)
        return nuevo
      })
      avisos.exito(`${nombreDia}: ${etiquetaModalidad(modalidad)} guardado`)
    } catch (e) {
      avisos.error(mensajeAmigable(e, `No se pudo guardar ${nombreDia}.`))
    } finally {
      setGuardando((g) => {
        const n = new Set(g)
        n.delete(dia)
        return n
      })
    }
  }

  return (
    <Pantalla titulo="Modalidad semanal" subtitulo={nombre.datos} onVolver={volver}>
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(porDia) => (
          <>
            <Tarjeta>
              <EncabezadoSeccion titulo="Patrón semanal" />
              <div className="dias" style={{ marginTop: 8 }}>
                {DIAS.map(([dia, n]) => {
                  const m = porDia.get(dia) ?? null
                  const I = iconoModalidad(m)
                  return (
                    <div key={dia} className={`dia${m ? ' activo' : ''}`} aria-label={`${n}: ${etiquetaModalidad(m)}`}>
                      <span className="texto-2" style={{ fontWeight: 600 }}>
                        {n.slice(0, 3)}
                      </span>
                      <I size={20} aria-hidden style={{ marginTop: 4 }} />
                    </div>
                  )
                })}
              </div>
            </Tarjeta>
            <AvisoBanner texto='Cada cambio se guarda al momento. Un día en "No aplica" no se espera asistencia.' tono="info" icono={Info} />
            <Tarjeta>
              {DIAS.map(([dia, n], i) => {
                const m = porDia.get(dia) ?? null
                const ocupado = guardando.has(dia)
                return (
                  <div key={dia}>
                    {i > 0 && <Divisor />}
                    <div className="fila" style={{ padding: '8px 0' }}>
                      <span className="titulo-s crece">{n}</span>
                      {ocupado && (
                        <span className="chico texto-2 fila" style={{ gap: 6 }}>
                          <span className="giro" style={{ width: 14, height: 14 }} /> Guardando…
                        </span>
                      )}
                    </div>
                    <Segmentado
                      opciones={['Presencial', 'Home office', 'No aplica']}
                      seleccionado={OPCIONES.indexOf(m)}
                      onSeleccionar={(idx) => OPCIONES[idx] !== m && cambiar(dia, n, OPCIONES[idx])}
                      deshabilitado={ocupado}
                      etiqueta={`Modalidad del ${n}`}
                    />
                    <div style={{ height: 8 }} />
                  </div>
                )
              })}
            </Tarjeta>
            <Leyenda />
          </>
        )}
      </SegunEstado>
    </Pantalla>
  )
}
