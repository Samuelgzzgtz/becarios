import { useState } from 'react'
<<<<<<< HEAD
import { useParams } from 'react-router-dom'
import { Building2, CalendarPlus, CalendarX, ChevronDown, ChevronUp, History, Home, LogIn, LogOut, Plus } from 'lucide-react'
import * as asistencias from '../../datos/asistencias'
import { usuario as obtenerUsuario } from '../../datos/repositorios'
import { requerirUsuario, usuarioEnMemoria } from '../../datos/sesion'
import { describirBitacora } from '../../lib/bitacora'
import { mensajeAmigable } from '../../lib/errores'
import { aInstante, fechaHora, horaLocal24, hoy } from '../../lib/fechas'
import type { AsistenciaUi, ModalidadTrabajo, TipoAsistencia } from '../../lib/modelos'
import {
  Boton,
  CampoTexto,
  Chip,
  Dialogo,
  EstadoVacio,
  Pantalla,
  Segmentado,
  SegunEstado,
  Tarjeta,
  etiquetaTipo,
  useVolver
} from '../../ui/componentes'
import { useAvisos } from '../../ui/avisos'
import { useAlReanudar, useCarga } from '../../ui/hooks'
import { etiquetaAccionBitacora } from '../../ui/estadosVisuales'
=======
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { CalendarX } from 'lucide-react'
import * as asistencias from '../../datos/asistencias'
import { usuario as obtenerUsuario } from '../../datos/repositorios'
import { corregir } from '../../correcciones/datos'
import FormularioCorreccion from '../../correcciones/Formulario'
import type { PropuestaCorreccion } from '../../correcciones/modelos'
import { mensajeAmigable } from '../../lib/errores'
import type { Asistencia, TipoAsistencia } from '../../lib/modelos'
import { Boton, Chip, EstadoVacio, Pantalla, SegunEstado, useVolver } from '../../ui/componentes'
import { useAvisos } from '../../ui/avisos'
import { useAlReanudar, useCarga, useUnaVez } from '../../ui/hooks'
>>>>>>> 6a1cd6d (Agrega solicitudes de corrección de asistencias con motivo e historial)
import { AsistenciasPorDia, FiltrosFecha, type FiltroFechas } from '../compartido/Asistencias'

export default function AsistenciasBecario() {
  const { id = '' } = useParams()
<<<<<<< HEAD
  const volver = useVolver(usuarioEnMemoria()?.perfil === 'administrador' ? '/admin/becarios' : '/ingeniero/becarios')
=======
  const navegar = useNavigate()
  const ubicacion = useLocation()
  const base = ubicacion.pathname.startsWith('/admin') ? '/admin' : '/ingeniero'
  const volver = useVolver(`${base}/becarios`)
>>>>>>> 6a1cd6d (Agrega solicitudes de corrección de asistencias con motivo e historial)
  const avisos = useAvisos()
  const [filtro, setFiltro] = useState<FiltroFechas | null>(null)
  const [formulario, setFormulario] = useState(false)
<<<<<<< HEAD
  const [aEliminar, setAEliminar] = useState<AsistenciaUi | null>(null)
  const [guardando, setGuardando] = useState(false)
  /** Sube con cada cambio para que la bitácora se vuelva a pedir. */
  const [version, setVersion] = useState(0)

  const nombre = useCarga(() => obtenerUsuario(id).then((u) => u?.nombre ?? null), [id], '')
  const { estado, recargar } = useCarga(
    async () => {
      const lista = filtro ? await asistencias.historialEntreFechas(id, filtro.desde, filtro.hasta) : await asistencias.historial(id, 200)
      return lista.filter((a) => !tipo || a.tipo === tipo).map((asistencia) => ({ asistencia }))
    },
    [id, filtro?.desde, filtro?.hasta, tipo],
    'No se pudo cargar el historial.'
  )
  useAlReanudar(recargar)

  async function agregar(t: TipoAsistencia, instante: Date, modalidad: ModalidadTrabajo) {
    if (guardando) return
    setGuardando(true)
    try {
      const ingeniero = await requerirUsuario()
      await asistencias.agregarManual(id, t, instante, modalidad, ingeniero.id)
      avisos.exito('Registro agregado.')
      setFormulario(false)
      setVersion((v) => v + 1)
      recargar()
    } catch (e) {
      avisos.error(mensajeAmigable(e, 'No se pudo agregar el registro.'))
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(asistenciaId: string) {
    if (guardando) return
    setGuardando(true)
    try {
      await asistencias.eliminar(asistenciaId)
      avisos.exito('Registro eliminado.')
      setVersion((v) => v + 1)
      recargar()
    } catch (e) {
      avisos.error(mensajeAmigable(e, 'No se pudo eliminar el registro.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Pantalla
      titulo="Asistencias"
      subtitulo={nombre.datos ?? 'Becario'}
      onVolver={volver}
      fab={
        <Boton className="fab" icono={Plus} onClick={() => setFormulario(true)}>
          Agregar registro
        </Boton>
      }
    >
      {aEliminar && (
        <Dialogo
          titulo="Eliminar registro"
          mensaje={`Se eliminará la ${etiquetaTipo(aEliminar.asistencia.tipo).toLowerCase()} del ${fechaHora(aEliminar.asistencia.ocurrido_en)}. Las horas del becario se recalcularán. Esta acción no se puede deshacer.`}
          textoConfirmar="Eliminar"
          destructivo
          onConfirmar={() => {
            const aid = aEliminar.asistencia.id
            setAEliminar(null)
            if (aid) void eliminar(aid)
          }}
          onCancelar={() => setAEliminar(null)}
        />
      )}
      {formulario && <DialogoRegistroManual guardando={guardando} onGuardar={agregar} onCancelar={() => setFormulario(false)} />}

      <FiltrosFecha filtro={filtro} onFiltro={setFiltro} onLimpiar={() => (setFiltro(null), setTipo(null))} />
      <div className="chips">
        <Chip texto="Todos" activo={tipo == null} onClick={() => setTipo(null)} />
        <Chip texto="Entradas" activo={tipo === 'entrada'} onClick={() => setTipo('entrada')} />
        <Chip texto="Salidas" activo={tipo === 'salida'} onClick={() => setTipo('salida')} />
      </div>
      <p className="chico texto-2">¿Olvidó registrar la salida? Agrégala con "Agregar registro". Para borrar un registro equivocado usa el ícono de basura. Los registros marcados "Por revisar" se aprueban desde la lista de pendientes.</p>
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(lista) =>
          lista.length === 0 ? (
            <EstadoVacio titulo="Sin asistencias en este rango" mensaje="Prueba con otras fechas." icono={CalendarX} />
          ) : (
            <AsistenciasPorDia lista={lista} onEliminar={(item) => !guardando && setAEliminar(item)} />
          )
        }
      </SegunEstado>
      <Bitacora becarioId={id} version={version} />
    </Pantalla>
  )
}

/** Sección plegable con los cambios hechos a las asistencias del becario (quién, cuándo y qué). Carga al abrirla. */
function Bitacora(props: { becarioId: string; version: number }) {
  const [abierta, setAbierta] = useState(false)
  const { estado, recargar } = useCarga(
    () => (abierta ? asistencias.bitacoraDe(props.becarioId) : Promise.resolve([])),
    [props.becarioId, abierta, props.version],
    'No se pudo cargar la bitácora de cambios.'
  )
  return (
    <Tarjeta>
      <button
        type="button"
        className="fila"
        aria-expanded={abierta}
        onClick={() => setAbierta((a) => !a)}
        style={{ width: '100%', minHeight: 48, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' }}
      >
        <History size={20} color="var(--primario)" aria-hidden />
        <span className="titulo-m crece">Bitácora de cambios</span>
        {abierta ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
      </button>
      {abierta && (
        <div className="columna" style={{ gap: 8, marginTop: 8 }}>
          <SegunEstado estado={estado} onReintentar={recargar} tarjetas={2}>
            {(lista) =>
              lista.length === 0 ? (
                <p className="texto-2">Todavía no hay cambios. Aquí verás quién agregó, editó, eliminó o aprobó registros.</p>
              ) : (
                <ul className="columna" style={{ gap: 12, listStyle: 'none', padding: 0, margin: 0 }}>
                  {lista.map((e) => (
                    <li key={e.id}>
                      <p className="chico texto-2">
                        {etiquetaAccionBitacora[e.accion] ?? 'Cambio'} · {fechaHora(e.hecho_en)}
                      </p>
                      <p>{describirBitacora(e)}</p>
                    </li>
                  ))}
                </ul>
              )
            }
          </SegunEstado>
        </div>
      )}
    </Tarjeta>
  )
}

/** Formulario de corrección (C-04) con validación: no se permiten registros en el futuro. */
function DialogoRegistroManual(props: { guardando: boolean; onGuardar: (t: TipoAsistencia, instante: Date, m: ModalidadTrabajo) => void; onCancelar: () => void }) {
  const [tipo, setTipo] = useState<TipoAsistencia>('salida')
  const [fecha, setFecha] = useState(hoy())
  const [hora, setHora] = useState('')
  const [modalidad, setModalidad] = useState<ModalidadTrabajo>('presencial')
  const [intento, setIntento] = useState(false)

  const errorHora = !hora
    ? intento
      ? 'Elige la hora'
      : null
    : fecha === hoy() && hora > horaLocal24(new Date())
      ? 'La hora no puede ser posterior a ahora'
      : null
  const errorFecha = fecha > hoy() ? 'La fecha no puede ser futura' : !fecha && intento ? 'Elige la fecha' : null

  return (
    <Dialogo
      titulo="Agregar registro"
      mensaje="Quedará marcado como registro manual hecho por ti."
      icono={CalendarPlus}
      textoConfirmar={props.guardando ? 'Guardando…' : 'Guardar'}
      confirmarHabilitado={!props.guardando}
      onConfirmar={() => {
        setIntento(true)
        if (hora && fecha && !errorHora && !errorFecha) props.onGuardar(tipo, aInstante(fecha, hora), modalidad)
      }}
      onCancelar={props.onCancelar}
    >
      <Segmentado
        opciones={['Entrada', 'Salida']}
        seleccionado={tipo === 'entrada' ? 0 : 1}
        onSeleccionar={(i) => setTipo(i === 0 ? 'entrada' : 'salida')}
        iconos={[LogIn, LogOut]}
        etiqueta="Tipo de registro"
      />
      <CampoTexto etiqueta="Fecha" tipo="date" valor={fecha} onCambio={setFecha} max={hoy()} error={errorFecha} />
      <CampoTexto etiqueta="Hora (Monterrey)" tipo="time" valor={hora} onCambio={setHora} error={errorHora} />
      <Segmentado
        opciones={['Presencial', 'Home office']}
        seleccionado={modalidad === 'presencial' ? 0 : 1}
        onSeleccionar={(i) => setModalidad(i === 0 ? 'presencial' : 'home_office')}
        iconos={[Building2, Home]}
        etiqueta="Modalidad"
      />
    </Dialogo>
  )
=======
  const [aEliminar, setAEliminar] = useState<Asistencia | undefined>()
  const [tipo, setTipo] = useState<TipoAsistencia | null>(null)
  const { ocupado, ejecutar } = useUnaVez()
  const nombre = useCarga(() => obtenerUsuario(id).then(u => u?.nombre ?? null), [id], '')
  const carga = useCarga(async () => {
    const lista = filtro ? await asistencias.historialEntreFechas(id, filtro.desde, filtro.hasta) : await asistencias.historial(id, 200)
    return lista.filter(a => !tipo || a.tipo === tipo).map(asistencia => ({ asistencia }))
  }, [id, filtro?.desde, filtro?.hasta, tipo], 'No se pudo cargar el historial.')
  useAlReanudar(carga.recargar)

  function guardar(p: PropuestaCorreccion) {
    void ejecutar(async () => {
      try {
        await corregir(id, p)
        setFormulario(false); setAEliminar(undefined); carga.recargar()
        avisos.exito('Corrección aplicada y guardada en el historial.')
      } catch (e) { avisos.error(mensajeAmigable(e, 'No se pudo corregir el registro.')) }
    })
  }

  return <Pantalla titulo="Asistencias" subtitulo={nombre.datos ?? 'Becario'} onVolver={volver}>
    <Boton variante="secundario" onClick={() => { setAEliminar(undefined); setFormulario(true) }}>Corregir asistencia</Boton>
    <Boton variante="texto" onClick={() => navegar(`${base}/becario/${id}/historial-cambios`)}>Ver historial de cambios</Boton>
    {formulario && <FormularioCorreccion key={aEliminar?.id ?? id} becarioId={id} ocupado={ocupado} manual registroAEliminar={aEliminar} onGuardar={guardar} onCancelar={() => setFormulario(false)} />}
    <FiltrosFecha filtro={filtro} onFiltro={setFiltro} conSemanaPasada onLimpiar={() => setFiltro(null)} />
    <div className="chips"><Chip texto="Todos" activo={tipo == null} onClick={() => setTipo(null)} /><Chip texto="Entradas" activo={tipo === 'entrada'} onClick={() => setTipo('entrada')} /><Chip texto="Salidas" activo={tipo === 'salida'} onClick={() => setTipo('salida')} /></div>
    <SegunEstado estado={carga.estado} onReintentar={carga.recargar}>{lista => lista.length ? <AsistenciasPorDia lista={lista} onEliminar={item => { if (!ocupado) { setAEliminar(item.asistencia); setFormulario(true) } }} /> : <EstadoVacio titulo="Sin asistencias en este rango" mensaje="Prueba con otras fechas." icono={CalendarX} />}</SegunEstado>
  </Pantalla>
>>>>>>> 6a1cd6d (Agrega solicitudes de corrección de asistencias con motivo e historial)
}
