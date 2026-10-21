import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { CircleAlert, HardHat, Hourglass, NotebookText, Send } from 'lucide-react'
import { otrosIngenieros, solicitarTransferencia, transferenciaPendienteDe, usuario as obtenerUsuario } from '../../datos/repositorios'
import { requerirUsuario } from '../../datos/sesion'
import { mensajeAmigable } from '../../lib/errores'
import { diaMes, fechaLocal } from '../../lib/fechas'
import type { Usuario } from '../../lib/modelos'
import { AvisoBanner, Boton, CampoTexto, Desplegable, Pantalla, SegunEstado, Tarjeta, useVolver } from '../../ui/componentes'
import { useAvisos } from '../../ui/avisos'
import { useCarga } from '../../ui/hooks'

/** Motivos frecuentes: se elige uno y se puede detallar. */
const MOTIVOS = ['Cambio de horario', 'Cambio de área o proyecto', 'Carga de trabajo del equipo', 'Solicitud del becario', 'Otro']

export default function SolicitarTransferencia() {
  const { id = '' } = useParams()
  const volver = useVolver('/ingeniero/becarios')
  const avisos = useAvisos()
  const [destino, setDestino] = useState<Usuario | null>(null)
  const [motivo, setMotivo] = useState<string | null>(null)
  const [detalles, setDetalles] = useState('')
  const [intento, setIntento] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { estado, datos, recargar } = useCarga(
    async () => {
      const yo = await requerirUsuario()
      const [ingenieros, becario, pendiente] = await Promise.all([
        otrosIngenieros(yo.id),
        obtenerUsuario(id).catch(() => null),
        transferenciaPendienteDe(id)
      ])
      const desde = fechaLocal(pendiente?.created_at)
      return {
        yo,
        ingenieros,
        becario,
        avisoPendiente: pendiente
          ? `Ya hay una solicitud de transferencia pendiente${desde ? ` desde el ${diaMes(desde)}` : ''}; espera a que la coordinación la resuelva.`
          : null
      }
    },
    [id],
    'No se pudieron cargar los ingenieros.'
  )

  const textoMotivo = [motivo, detalles.trim() || null].filter(Boolean).join(': ')
  const bloqueado = !!datos?.avisoPendiente

  async function enviar() {
    setIntento(true)
    if (!datos || enviando || bloqueado) return
    if (!destino || !textoMotivo) {
      setError('Elige un ingeniero destino y escribe el motivo')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      await solicitarTransferencia(id, datos.yo.id, destino.id, textoMotivo)
      avisos.exito('Solicitud enviada; la coordinación la revisará')
      volver()
    } catch (e) {
      setError(mensajeAmigable(e, 'No se pudo enviar la solicitud.'))
      setEnviando(false)
    }
  }

  return (
    <Pantalla
      titulo="Solicitar transferencia"
      subtitulo={datos?.becario ? `Becario: ${datos.becario.nombre}` : null}
      onVolver={volver}
      barraAccion={
        datos && (
          <Boton ancho icono={Send} cargando={enviando} deshabilitado={bloqueado} onClick={enviar}>
            Enviar solicitud
          </Boton>
        )
      }
    >
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(d) => (
          <>
            {d.avisoPendiente && <AvisoBanner titulo="Ya hay una solicitud en curso" texto={d.avisoPendiente} tono="alerta" icono={Hourglass} />}
            <Tarjeta>
              <div className="columna" style={{ gap: 14 }}>
                <p className="texto-2">La coordinación revisará la solicitud y, si la aprueba, el becario pasará al ingeniero elegido.</p>
                <Desplegable
                  etiqueta="Transferir a"
                  opciones={d.ingenieros}
                  seleccionado={destino}
                  textoDe={(u) => (u.coordinacion ? `${u.nombre} · ${u.coordinacion}` : u.nombre)}
                  claveDe={(u) => u.id}
                  onSeleccionar={(u) => (setDestino(u), setError(null))}
                  icono={HardHat}
                  placeholder="Elige un ingeniero"
                  error={intento && !destino ? 'Elige el ingeniero destino' : null}
                  ayuda={d.ingenieros.length === 0 ? 'No hay otros ingenieros activos' : null}
                  deshabilitado={bloqueado}
                />
                <Desplegable
                  etiqueta="Motivo"
                  opciones={MOTIVOS}
                  seleccionado={motivo}
                  textoDe={(m) => m}
                  claveDe={(m) => m}
                  onSeleccionar={(m) => (setMotivo(m), setError(null))}
                  icono={NotebookText}
                  placeholder="Elige un motivo"
                  error={intento && !textoMotivo ? 'Elige o escribe el motivo' : null}
                  deshabilitado={bloqueado}
                />
                <CampoTexto
                  etiqueta="Detalles (opcional)"
                  valor={detalles}
                  onCambio={(v) => (setDetalles(v), setError(null))}
                  multilinea={3}
                  ayuda="Explica brevemente la razón"
                  deshabilitado={bloqueado}
                />
              </div>
            </Tarjeta>
            {error && <AvisoBanner texto={error} tono="peligro" icono={CircleAlert} />}
          </>
        )}
      </SegunEstado>
    </Pantalla>
  )
}
