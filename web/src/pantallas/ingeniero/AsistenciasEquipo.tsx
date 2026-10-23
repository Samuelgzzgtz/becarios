import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarX, User } from 'lucide-react'
import { historialEquipo } from '../../datos/asistencias'
import { progresoEquipo } from '../../datos/repositorios'
import { requerirUsuario } from '../../datos/sesion'
import { plural, primerNombre } from '../../lib/formato'
import type { TipoAsistencia } from '../../lib/modelos'
import { Boton, Chip, Desplegable, EstadoVacio, Pantalla, SegunEstado } from '../../ui/componentes'
import { useAlReanudar, useCarga } from '../../ui/hooks'
import { AsistenciasPorDia, FiltrosFecha, semanaActual, type FiltroFechas } from '../compartido/Asistencias'

interface BecarioFiltro {
  id: string
  nombre: string
  matricula: string
}

const TODO_EL_EQUIPO: BecarioFiltro = { id: '', nombre: 'Todo el equipo', matricula: '' }

/** Asistencias de TODO el equipo con filtros de becario, fechas y tipo (M-17). Siempre hay rango. */
export default function AsistenciasEquipo() {
  const navegar = useNavigate()
  const [becario, setBecario] = useState<BecarioFiltro>(TODO_EL_EQUIPO)
  const [filtro, setFiltro] = useState<FiltroFechas>(semanaActual)
  const [tipo, setTipo] = useState<TipoAsistencia | null>(null)
  const [becarios, setBecarios] = useState<BecarioFiltro[] | null>(null)

  const { estado, datos, recargar } = useCarga(
    async () => {
      await requerirUsuario()
      let lista = becarios
      if (!lista) {
        lista = (await progresoEquipo())
          .map((p) => ({ id: p.becario_id, nombre: p.nombre, matricula: p.matricula }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre))
        setBecarios(lista)
      }
      const ids = becario.id ? [becario.id] : lista.map((b) => b.id)
      return (await historialEquipo(ids, filtro.desde, filtro.hasta)).filter((r) => !tipo || r.asistencia.tipo === tipo)
    },
    [becario.id, filtro.desde, filtro.hasta, tipo],
    'No se pudieron cargar las asistencias del equipo.'
  )
  useAlReanudar(recargar)
  const nombres = new Map((becarios ?? []).map((b) => [b.id, b.nombre]))

  return (
    <Pantalla titulo="Asistencias del equipo" subtitulo={datos ? plural(datos.length, 'registro', 'registros') : 'Entradas y salidas de tus becarios'}>
      <Desplegable
        etiqueta="Becario"
        opciones={[TODO_EL_EQUIPO, ...(becarios ?? [])]}
        seleccionado={becario}
        textoDe={(b) => (b.matricula ? `${b.nombre} · ${b.matricula}` : b.nombre)}
        claveDe={(b) => b.id || 'todos'}
        onSeleccionar={setBecario}
        icono={User}
      />
      <FiltrosFecha filtro={filtro} onFiltro={(f) => setFiltro(f.hasta < f.desde ? { desde: f.hasta, hasta: f.desde } : f)} conSemanaPasada />
      <div className="chips">
        <Chip texto="Todos" activo={tipo == null} onClick={() => setTipo(null)} />
        <Chip texto="Entradas" activo={tipo === 'entrada'} onClick={() => setTipo('entrada')} />
        <Chip texto="Salidas" activo={tipo === 'salida'} onClick={() => setTipo('salida')} />
      </div>
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(lista) =>
          lista.length === 0 ? (
            <EstadoVacio
              titulo={becarios?.length === 0 ? 'Aún no tienes becarios' : 'Sin registros en este rango'}
              mensaje={
                becarios?.length === 0 ? 'Cuando la coordinación te asigne becarios verás aquí sus asistencias.' : 'Prueba con otras fechas o con otro becario.'
              }
              icono={CalendarX}
            />
          ) : (
            <>
              <AsistenciasPorDia lista={lista} nombreDe={(i) => nombres.get(i.asistencia.becario_id)} agruparPorBecario />
              {becario.id && (
                <Boton variante="secundario" ancho onClick={() => navegar(`/ingeniero/becario/${becario.id}/asistencias`)}>
                  Corregir registros de {primerNombre(becario.nombre)}
                </Boton>
              )}
            </>
          )
        }
      </SegunEstado>
    </Pantalla>
  )
}
