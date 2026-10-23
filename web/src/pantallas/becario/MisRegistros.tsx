import { useState } from 'react'
import { CalendarX } from 'lucide-react'
import * as asistencias from '../../datos/asistencias'
import { requerirUsuario } from '../../datos/sesion'
import { parsear } from '../../lib/fechas'
import { plural } from '../../lib/formato'
import type { AsistenciaUi } from '../../lib/modelos'
import { EstadoVacio, Pantalla, SegunEstado } from '../../ui/componentes'
import { useAlReanudar, useCarga } from '../../ui/hooks'
import { AsistenciasPorDia, FiltrosFecha, type FiltroFechas } from '../compartido/Asistencias'

/** Incluye lo que sigue en el teléfono sin subir, marcado como "Sin subir" (A-14). Sin filtro: últimos 200. */
async function cargar(filtro: FiltroFechas | null): Promise<AsistenciaUi[]> {
  const usuario = await requerirUsuario()
  const remotas = filtro
    ? await asistencias.historialEntreFechas(usuario.id, filtro.desde, filtro.hasta)
    : await asistencias.historial(usuario.id, 200)
  const locales = await asistencias.localesComoUi(usuario.id, filtro?.desde, filtro?.hasta)
  return [...locales, ...remotas.map((asistencia) => ({ asistencia }))].sort(
    (a, b) => (parsear(b.asistencia.ocurrido_en)?.getTime() ?? 0) - (parsear(a.asistencia.ocurrido_en)?.getTime() ?? 0)
  )
}

export default function MisRegistros() {
  const [filtro, setFiltro] = useState<FiltroFechas | null>(null)
  const { estado, datos, recargar } = useCarga(() => cargar(filtro), [filtro?.desde, filtro?.hasta], 'No se pudo cargar tu historial.')
  useAlReanudar(recargar)

  return (
    <Pantalla titulo="Mis registros" subtitulo={datos ? plural(datos.length, 'registro', 'registros') : 'Tu historial de entradas y salidas'}>
      <FiltrosFecha filtro={filtro} onFiltro={setFiltro} conSemanaPasada onLimpiar={() => setFiltro(null)} />
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(lista) =>
          lista.length === 0 ? (
            <EstadoVacio
              titulo="Sin registros en este rango"
              mensaje={filtro ? 'Prueba con otras fechas.' : 'Cuando registres tu asistencia aparecerá aquí.'}
              icono={CalendarX}
            />
          ) : (
            <AsistenciasPorDia lista={lista} />
          )
        }
      </SegunEstado>
    </Pantalla>
  )
}
