import { useState } from 'react'
import { historialEntreFechas } from '../datos/asistencias'
import { aInstante, esFechaValida, fechaHora, fechaLocal, horaLocal24, hoy, parsear } from '../lib/fechas'
import type { Asistencia, ModalidadTrabajo, TipoAsistencia } from '../lib/modelos'
import { Boton, CampoTexto, SegunEstado } from '../ui/componentes'
import { useCarga } from '../ui/hooks'
import { accionDeTexto } from './datos'
import { accionesCorreccion, validarPropuesta, type AccionCorreccion, type PropuestaCorreccion } from './modelos'

export default function FormularioCorreccion(props: { becarioId: string; ocupado: boolean; manual?: boolean; registroAEliminar?: Asistencia; onGuardar: (p: PropuestaCorreccion) => void; onCancelar: () => void }) {
  const [accion, setAccion] = useState<AccionCorreccion>(props.registroAEliminar ? 'eliminar' : 'agregar')
  const [asistenciaId, setAsistenciaId] = useState(props.registroAEliminar?.id ?? '')
  const [original, setOriginal] = useState<Asistencia | null>(props.registroAEliminar ?? null)
  const [tipo, setTipo] = useState<TipoAsistencia>('salida')
  const [modalidad, setModalidad] = useState<ModalidadTrabajo>('presencial')
  const [fecha, setFecha] = useState(hoy())
  const [hora, setHora] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [diaRegistro, setDiaRegistro] = useState(fechaLocal(props.registroAEliminar?.ocurrido_en) ?? hoy())
  const carga = useCarga(() => accion === 'agregar' ? Promise.resolve([]) : historialEntreFechas(props.becarioId, diaRegistro, diaRegistro), [props.becarioId, accion, diaRegistro], 'No se pudieron cargar los registros de ese día.')

  function guardar() {
    if (props.ocupado) return
    const instante = esFechaValida(fecha) && /^\d{2}:\d{2}$/.test(hora) ? aInstante(fecha, hora) : null
    const originalInstante = parsear(original?.ocurrido_en)
    // Cambiar modalidad o tipo conserva segundos y milisegundos de la marcación.
    const mismaHora = originalInstante && fecha === fechaLocal(originalInstante) && hora === horaLocal24(originalInstante)
    const ocurridoEn = mismaHora ? original?.ocurrido_en ?? '' : instante?.toISOString() ?? ''
    const propuesta: PropuestaCorreccion = { accion, asistenciaId: asistenciaId || null, antes: original, tipo, modalidad, motivo, ocurridoEn }
    const fallo = validarPropuesta(propuesta)
    setError(fallo)
    if (!fallo) props.onGuardar(propuesta)
  }

  return (
    <section className="columna" aria-label={props.manual ? 'Corrección manual' : 'Nueva solicitud'}>
      <h2 className="titulo-m">{props.manual ? 'Corregir asistencia' : 'Solicitar corrección'}</h2>
      <label className="campo">Acción
        <select value={accion} disabled={props.ocupado} onChange={e => { setAccion(accionDeTexto(e.target.value)); setAsistenciaId(''); setOriginal(null); setError(null) }}>
          {Object.entries(accionesCorreccion).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
        </select>
      </label>
      {accion !== 'agregar' && <>
        <CampoTexto etiqueta="Fecha del registro original" tipo="date" valor={diaRegistro} max={hoy()} deshabilitado={props.ocupado} onCambio={v => { if (esFechaValida(v)) { setDiaRegistro(v); setAsistenciaId(''); setOriginal(null) } }} />
        <SegunEstado estado={carga.estado} onReintentar={carga.recargar}>{lista => (
          <label className="campo">Registro a corregir
            <select value={asistenciaId} disabled={props.ocupado} onChange={e => {
              setAsistenciaId(e.target.value)
              const a = lista.find(r => r.id === e.target.value)
              setOriginal(a ?? null)
              const instante = parsear(a?.ocurrido_en)
              if (a && instante) { setTipo(a.tipo); setModalidad(a.modalidad); setFecha(fechaLocal(instante)); setHora(horaLocal24(instante)) }
            }}>
              <option value="">{lista.length ? 'Elige un registro' : 'No hay registros ese día'}</option>
              {lista.filter(a => a.id).map(a => <option key={a.id} value={a.id ?? ''}>{a.tipo === 'entrada' ? 'Entrada' : 'Salida'} · {fechaHora(a.ocurrido_en)}</option>)}
            </select>
          </label>
        )}</SegunEstado>
      </>}
      {accion !== 'eliminar' && <>
        <label className="campo">Tipo de registro<select value={tipo} disabled={props.ocupado} onChange={e => setTipo(e.target.value === 'entrada' ? 'entrada' : 'salida')}><option value="entrada">Entrada</option><option value="salida">Salida</option></select></label>
        <CampoTexto etiqueta="Fecha propuesta" tipo="date" valor={fecha} max={hoy()} onCambio={setFecha} deshabilitado={props.ocupado} />
        <CampoTexto etiqueta="Hora propuesta (Monterrey)" tipo="time" valor={hora} onCambio={setHora} deshabilitado={props.ocupado} />
        <label className="campo">Modalidad<select value={modalidad} disabled={props.ocupado} onChange={e => setModalidad(e.target.value === 'home_office' ? 'home_office' : 'presencial')}><option value="presencial">Presencial</option><option value="home_office">Home office</option></select></label>
      </>}
      <CampoTexto etiqueta="Motivo de la corrección" multilinea={3} valor={motivo} onCambio={setMotivo} deshabilitado={props.ocupado} ayuda="Entre 5 y 500 caracteres. Quedará guardado en el historial." />
      {error && <p role="alert">{error}</p>}
      <div className="fila">
        <Boton cargando={props.ocupado} onClick={guardar}>{props.manual ? 'Aplicar corrección' : 'Enviar solicitud'}</Boton>
        <Boton variante="texto" deshabilitado={props.ocupado} onClick={props.onCancelar}>Cancelar</Boton>
      </div>
    </section>
  )
}
