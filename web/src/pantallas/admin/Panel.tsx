import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  CalendarDays,
  ChevronRight,
  CircleUser,
  ClipboardCheck,
  ClipboardList,
  Download,
  HardHat,
  SlidersHorizontal,
  TriangleAlert,
  UserX,
  Users
} from 'lucide-react'
import { indicadores } from '../../datos/repositorios'
import { fechaDeTexto, fechaMedia } from '../../lib/fechas'
import { entero, plural } from '../../lib/formato'
import {
  AvisoBanner,
  Badge,
  BotonIcono,
  CuadriculaDos,
  Divisor,
  IconoCircular,
  Pantalla,
  SegunEstado,
  Tarjeta,
  TarjetaIndicador,
  type Icono
} from '../../ui/componentes'
import { useAlReanudar, useCarga } from '../../ui/hooks'

export default function PanelAdmin() {
  const navegar = useNavigate()
  const { estado, recargar } = useCarga(indicadores, [], 'No se pudieron cargar los indicadores.')
  useAlReanudar(recargar)

  return (
    <Pantalla
      titulo="Coordinación de becarios"
      subtitulo="DocenCheck · FIME"
      etiqueta="Administrador"
      accionHeader={<BotonIcono icono={CircleUser} etiqueta="Mi cuenta" onClick={() => navegar('/admin/cuenta')} />}
    >
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(d) => {
          const fin = fechaDeTexto(d.periodo_fin)
          return (
            <>
              {d.siase_por_firmar > 0 && (
                <AvisoBanner
                  titulo={`${plural(d.siase_por_firmar, 'reporte SIASE listo', 'reportes SIASE listos')} para firmar`}
                  texto="Revisa y firma los reportes que los becarios ya subieron."
                  tono="exito"
                  icono={ClipboardCheck}
                  textoAccion="Ir a firmar"
                  onAccion={() => navegar('/admin/siase')}
                />
              )}
              <CuadriculaDos>
                <TarjetaIndicador valor={entero(d.becarios_activos)} etiqueta="Becarios activos" icono={Users} onClick={() => navegar('/admin/becarios')} />
                <TarjetaIndicador
                  valor={entero(d.becarios_sin_asignar)}
                  etiqueta="Sin asignar"
                  icono={UserX}
                  alerta={d.becarios_sin_asignar > 0}
                  onClick={() => navegar('/admin/becarios')}
                />
                <TarjetaIndicador valor={entero(d.ingenieros_activos)} etiqueta="Ingenieros" icono={HardHat} onClick={() => navegar('/admin/ingenieros')} />
                <TarjetaIndicador
                  valor={entero(d.transferencias_pendientes)}
                  etiqueta="Traspasos pendientes"
                  icono={ArrowLeftRight}
                  alerta={d.transferencias_pendientes > 0}
                  onClick={() => navegar('/admin/traspasos')}
                />
                <TarjetaIndicador
                  valor={entero(d.siase_por_firmar)}
                  etiqueta="SIASE por firmar"
                  icono={ClipboardCheck}
                  alerta={d.siase_por_firmar > 0}
                  onClick={() => navegar('/admin/siase')}
                />
                <TarjetaIndicador
                  valor={entero(d.siase_sin_entregar)}
                  etiqueta="SIASE sin entregar"
                  icono={ClipboardList}
                  alerta={d.siase_sin_entregar > 0}
                  detalle="este mes"
                  onClick={() => navegar('/admin/siase')}
                />
              </CuadriculaDos>

              <Tarjeta onClick={() => navegar('/admin/semestres')} etiqueta="Periodo actual">
                <div className="fila">
                  <IconoCircular icono={d.periodo_nombre ? CalendarDays : TriangleAlert} tono={d.periodo_nombre ? 'exito' : 'peligro'} />
                  <div className="crece">
                    <p className="chico texto-2">Periodo actual</p>
                    <p className="titulo-m">{d.periodo_nombre ?? 'No hay periodo activo'}</p>
                    {fin && <p className="chico texto-2">Termina el {fechaMedia(fin)}</p>}
                  </div>
                  <ChevronRight color="var(--texto-2)" aria-hidden />
                </div>
                {d.ventana_abierta != null && (
                  <div style={{ marginTop: 12 }}>
                    <Badge
                      texto={
                        d.ventana_abierta
                          ? `Ventana SIASE abierta · quedan ${plural(d.ventana_dias_restantes ?? 0, 'día', 'días')}`
                          : 'Ventana SIASE cerrada'
                      }
                      tono={d.ventana_abierta ? 'alerta' : 'neutro'}
                    />
                  </div>
                )}
              </Tarjeta>

              <Accesos
                accesos={[
                  { titulo: 'Reporte de horas', detalle: 'Avance de todos los becarios', icono: Users, ruta: '/admin/reporte-horas' },
                  { titulo: 'Configuración', detalle: 'Metas y ventana SIASE', icono: SlidersHorizontal, ruta: '/admin/configuracion' },
                  { titulo: 'Exportar asistencias', detalle: 'Archivo CSV para Excel', icono: Download, ruta: '/admin/exportar' }
                ]}
              />
            </>
          )
        }}
      </SegunEstado>
    </Pantalla>
  )
}

export interface Acceso {
  titulo: string
  detalle: string
  icono: Icono
  ruta: string
}

/** Lista de accesos (fila con ícono, texto y flecha). */
export function Accesos({ accesos }: { accesos: Acceso[] }) {
  const navegar = useNavigate()
  return (
    <div className="tarjeta" style={{ padding: '4px 0' }}>
      {accesos.map((a, i) => (
        <div key={a.ruta}>
          {i > 0 && <div style={{ marginLeft: 72 }}><Divisor /></div>}
          <button
            className="fila"
            onClick={() => navegar(a.ruta)}
            style={{ width: '100%', background: 'none', border: 'none', padding: '12px 16px', cursor: 'pointer', textAlign: 'left' }}
          >
            <IconoCircular icono={a.icono} tono="exito" />
            <span className="crece">
              <span className="titulo-s" style={{ display: 'block' }}>
                {a.titulo}
              </span>
              <span className="chico texto-2">{a.detalle}</span>
            </span>
            <ChevronRight color="var(--texto-2)" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}
