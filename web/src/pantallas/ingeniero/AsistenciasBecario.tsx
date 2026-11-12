import { useState } from 'react'
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
import { AsistenciasPorDia, FiltrosFecha, type FiltroFechas } from '../compartido/Asistencias'

export default function AsistenciasBecario() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const ubicacion = useLocation()
  const base = ubicacion.pathname.startsWith('/admin') ? '/admin' : '/ingeniero'
  // El administrador solo consulta: corrige el ingeniero asignado (0026).
  const corrige = base === '/ingeniero'
  const volver = useVolver(`${base}/becarios`)
  const avisos = useAvisos()
  const [filtro, setFiltro] = useState<FiltroFechas | null>(null)
  const [formulario, setFormulario] = useState(false)
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
    {corrige && <Boton variante="secundario" onClick={() => { setAEliminar(undefined); setFormulario(true) }}>Corregir asistencia</Boton>}
    <Boton variante="texto" onClick={() => navegar(`${base}/becario/${id}/historial-cambios`)}>Ver historial de cambios</Boton>
    {formulario && <FormularioCorreccion key={aEliminar?.id ?? id} becarioId={id} ocupado={ocupado} manual registroAEliminar={aEliminar} onGuardar={guardar} onCancelar={() => setFormulario(false)} />}
    <FiltrosFecha filtro={filtro} onFiltro={setFiltro} conSemanaPasada onLimpiar={() => setFiltro(null)} />
    <div className="chips"><Chip texto="Todos" activo={tipo == null} onClick={() => setTipo(null)} /><Chip texto="Entradas" activo={tipo === 'entrada'} onClick={() => setTipo('entrada')} /><Chip texto="Salidas" activo={tipo === 'salida'} onClick={() => setTipo('salida')} /></div>
    <SegunEstado estado={carga.estado} onReintentar={carga.recargar}>{lista => lista.length ? <AsistenciasPorDia lista={lista} onEliminar={corrige ? item => { if (!ocupado) { setAEliminar(item.asistencia); setFormulario(true) } } : undefined} /> : <EstadoVacio titulo="Sin asistencias en este rango" mensaje="Prueba con otras fechas." icono={CalendarX} />}</SegunEstado>
  </Pantalla>
}
