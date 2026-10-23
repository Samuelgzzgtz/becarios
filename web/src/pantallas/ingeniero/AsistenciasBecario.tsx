import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Building2, CalendarPlus, CalendarX, Home, LogIn, LogOut, Plus } from 'lucide-react'
import * as asistencias from '../../datos/asistencias'
import { usuario as obtenerUsuario } from '../../datos/repositorios'
import { requerirUsuario } from '../../datos/sesion'
import { mensajeAmigable } from '../../lib/errores'
import { aInstante, fechaHora, horaLocal24, hoy } from '../../lib/fechas'
import type { AsistenciaUi, ModalidadTrabajo, TipoAsistencia } from '../../lib/modelos'
import { Boton, CampoTexto, Chip, Dialogo, EstadoVacio, Pantalla, Segmentado, SegunEstado, etiquetaTipo, useVolver } from '../../ui/componentes'
import { useAvisos } from '../../ui/avisos'
import { useAlReanudar, useCarga } from '../../ui/hooks'
import { AsistenciasPorDia, FiltrosFecha, type FiltroFechas } from '../compartido/Asistencias'

/** Historial de un becario con corrección manual (C-04): agregar la salida olvidada o borrar un registro equivocado. */
export default function AsistenciasBecario() {
  const { id = '' } = useParams()
  const volver = useVolver('/ingeniero/becarios')
  const avisos = useAvisos()
  const [filtro, setFiltro] = useState<FiltroFechas | null>(null)
  const [tipo, setTipo] = useState<TipoAsistencia | null>(null)
  const [formulario, setFormulario] = useState(false)
  const [aEliminar, setAEliminar] = useState<AsistenciaUi | null>(null)
  const [guardando, setGuardando] = useState(false)

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
      <p className="chico texto-2">¿Olvidó registrar la salida? Agrégala con "Agregar registro". Para borrar un registro equivocado usa el ícono de basura.</p>
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(lista) =>
          lista.length === 0 ? (
            <EstadoVacio titulo="Sin asistencias en este rango" mensaje="Prueba con otras fechas." icono={CalendarX} />
          ) : (
            <AsistenciasPorDia lista={lista} onEliminar={(item) => !guardando && setAEliminar(item)} />
          )
        }
      </SegunEstado>
    </Pantalla>
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
}
