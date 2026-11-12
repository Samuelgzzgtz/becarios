import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requerirUsuario } from '../datos/sesion'
import { becariosSinIngenieroActivo } from '../pantallas/admin/usuarios'
import { fechaHora } from '../lib/fechas'
import { mensajeAmigable } from '../lib/errores'
import { Boton, CampoTexto, Dialogo, Pantalla, SegunEstado } from '../ui/componentes'
import { useAvisos } from '../ui/avisos'
import { useAlReanudar, useCarga, useUnaVez } from '../ui/hooks'
import { nombresDe, resolver, solicitar, solicitudes } from './datos'
import FormularioCorreccion from './Formulario'
import { Instantanea } from './Historial'
import { accionesCorreccion, type PropuestaCorreccion, type SolicitudCorreccion } from './modelos'

export default function Correcciones() {
  const navegar = useNavigate()
  const avisos = useAvisos()
  const { ocupado, ejecutar } = useUnaVez()
  const [formulario, setFormulario] = useState<string | null>(null)
  const [pagina, setPagina] = useState(0)
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [resolucion, setResolucion] = useState<{ solicitud: SolicitudCorreccion; aprobar: boolean } | null>(null)
  const [respuesta, setRespuesta] = useState('')
  const carga = useCarga(async () => {
    const usuario = await requerirUsuario()
    // Solo el administrador: solicitudes que nadie puede resolver hasta asignar ingeniero (0026).
    const [resultado, sinIngeniero] = await Promise.all([
      solicitudes(pagina, soloPendientes, usuario.perfil === 'becario' ? usuario.id : undefined),
      usuario.perfil === 'administrador' ? becariosSinIngenieroActivo().catch(() => new Set<string>()) : new Set<string>()
    ])
    const nombres = await nombresDe(resultado.filas.flatMap(s => [s.becario_id, ...(s.resuelto_por ? [s.resuelto_por] : [])]))
    return { usuario, ...resultado, nombres, sinIngeniero }
  }, [pagina, soloPendientes], 'No se pudieron cargar las solicitudes de corrección.')
  useAlReanudar(carga.recargar)

  function enviar(p: PropuestaCorreccion) {
    void ejecutar(async () => {
      try { await solicitar(p); setFormulario(null); setPagina(0); carga.recargar(); avisos.exito('Solicitud enviada. Tu ingeniero la revisará.') }
      catch (e) { avisos.error(mensajeAmigable(e, 'No se pudo enviar la solicitud.')) }
    })
  }

  function resolverActual() {
    const actual = resolucion
    if (!actual) return
    void ejecutar(async () => {
      try {
        await resolver(actual.solicitud.id, actual.aprobar, respuesta)
        setResolucion(null); setRespuesta(''); carga.recargar()
        avisos.exito(actual.aprobar ? 'Corrección aprobada y aplicada.' : 'Solicitud rechazada.')
      } catch (e) { avisos.error(mensajeAmigable(e, 'No se pudo resolver la solicitud.')) }
    })
  }

  return (
    <Pantalla titulo="Correcciones de asistencia" onVolver={() => navegar(-1)}>
      {formulario && <FormularioCorreccion becarioId={formulario} ocupado={ocupado} onGuardar={enviar} onCancelar={() => setFormulario(null)} />}
      <label className="fila"><input type="checkbox" checked={soloPendientes} onChange={e => { setSoloPendientes(e.target.checked); setPagina(0) }} />Solo pendientes</label>
      <SegunEstado estado={carga.estado} onReintentar={carga.recargar}>{datos => <>
        {datos.usuario.perfil === 'becario' && !formulario && <Boton onClick={() => setFormulario(datos.usuario.id)}>Solicitar corrección</Boton>}
        {datos.filas.length === 0 && <p>No hay solicitudes {soloPendientes ? 'pendientes' : 'en esta página'}.</p>}
        {datos.filas.map(s => <section key={s.id} className="columna" style={{ borderBottom: '1px solid var(--borde)', paddingBottom: 16 }}>
          <h2 className="titulo-s">{accionesCorreccion[s.accion]} · {datos.nombres.get(s.becario_id) ?? 'Becario'}</h2>
          <p>Estado: {s.estado === 'pendiente' ? 'Pendiente' : s.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'} · Solicitada el {fechaHora(s.created_at)}</p>
          <Instantanea etiqueta="Registro original" valor={s.antes} />
          {s.accion !== 'eliminar' && <p>Propuesta: {s.tipo === 'entrada' ? 'Entrada' : 'Salida'} · {fechaHora(s.ocurrido_en)} · {s.modalidad === 'home_office' ? 'Home office' : 'Presencial'}</p>}
          <p>Motivo: {s.motivo}</p>
          {s.respuesta && <p>Respuesta: {s.respuesta} · {datos.nombres.get(s.resuelto_por ?? '') ?? 'Responsable'} · {fechaHora(s.resuelto_en)}</p>}
          {s.estado === 'pendiente' && datos.sinIngeniero.has(s.becario_id) && <div className="fila">
            <p className="crece">Sin ingeniero activo: nadie puede resolverla.</p>
            <Boton variante="secundario" onClick={() => navegar(`/admin/becario/${s.becario_id}/asignar`)}>Asignar ingeniero</Boton>
          </div>}
          {datos.usuario.perfil === 'ingeniero' && s.estado === 'pendiente' && <div className="fila">
            <Boton deshabilitado={ocupado} onClick={() => { setRespuesta(''); setResolucion({ solicitud: s, aprobar: true }) }}>Aprobar</Boton>
            <Boton variante="secundario" deshabilitado={ocupado} onClick={() => { setRespuesta(''); setResolucion({ solicitud: s, aprobar: false }) }}>Rechazar</Boton>
          </div>}
        </section>)}
        <div className="fila"><Boton variante="texto" deshabilitado={pagina === 0} onClick={() => setPagina(p => p - 1)}>Anterior</Boton><span>Página {pagina + 1}</span><Boton variante="texto" deshabilitado={!datos.hayMas} onClick={() => setPagina(p => p + 1)}>Siguiente</Boton></div>
      </>}</SegunEstado>
      {resolucion && <Dialogo titulo={resolucion.aprobar ? 'Aprobar corrección y horas' : 'Rechazar solicitud'} mensaje={resolucion.aprobar ? resolucion.solicitud.accion === 'eliminar' ? 'Se eliminará el registro y se recalcularán las horas. El cambio quedará en el historial.' : 'La asistencia quedará manual y aprobada. Si es una salida, podrá contar horas por encima del máximo de jornada. Comprueba también la entrada correspondiente. El cambio quedará en el historial.' : 'La asistencia no cambiará. Explica al becario el motivo del rechazo.'} textoConfirmar={ocupado ? 'Guardando…' : 'Confirmar'} confirmarHabilitado={!ocupado && respuesta.trim().length >= 5 && respuesta.trim().length <= 500} onConfirmar={resolverActual} onCancelar={() => { if (!ocupado) setResolucion(null) }}>
        <CampoTexto etiqueta="Respuesta al becario" valor={respuesta} onCambio={setRespuesta} multilinea={3} ayuda="Entre 5 y 500 caracteres." deshabilitado={ocupado} />
      </Dialogo>}
    </Pantalla>
  )
}
