import { useNavigate } from 'react-router-dom'
import { CircleUser } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { contarAnomalias } from '../../datos/asistencias'
import { indicadores } from '../../datos/repositorios'
import { fechaDeTexto, fechaMedia } from '../../lib/fechas'
import { entero, plural } from '../../lib/formato'
import { BotonIcono, CuadriculaDos, Pantalla, SegunEstado, TarjetaIndicador } from '../../ui/componentes'
import { useAlReanudar, useCarga } from '../../ui/hooks'

/**
 * Inicio del administrador: arriba lo que pide acción (firmar SIASE, registros por revisar),
 * luego los indicadores del sistema y el periodo actual.
 */
export default function PanelAdmin() {
  const navegar = useNavigate()
  const { estado, recargar } = useCarga(
    async () => {
      const [ind, porRevisar] = await Promise.all([indicadores(), contarAnomalias().catch(() => null)])
      return { ...ind, porRevisar }
    },
    [],
    'No se pudieron cargar los indicadores.'
  )
  useAlReanudar(recargar)

  return (
    <Pantalla
      titulo="Coordinación de becarios"
      subtitulo="Pasalista · FIME"
      // En escritorio "Mi cuenta" está en la barra lateral.
      accionHeader={<BotonIcono icono={CircleUser} etiqueta="Mi cuenta" onClick={() => navegar('/admin/cuenta')} className="bg-superficie lg:hidden" />}
    >
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(d) => {
          const fin = fechaDeTexto(d.periodo_fin)
          const pendientes = d.siase_por_firmar > 0 || (d.porRevisar ?? 0) > 0
          return (
            <>
              {pendientes && (
                <div className="rounded-lg bg-superficie px-4">
                  {d.siase_por_firmar > 0 && (
                    <div className="fila border-regla py-3 [&+&]:border-t">
                      <span className="crece">
                        <span className="block font-medium">{plural(d.siase_por_firmar, 'reporte SIASE espera', 'reportes SIASE esperan')} firma</span>
                        <span className="block text-[13px] text-texto-2">Los becarios ya los subieron</span>
                      </span>
                      <Button className="h-10" onClick={() => navegar('/admin/siase')}>
                        Firmar
                      </Button>
                    </div>
                  )}
                  {(d.porRevisar ?? 0) > 0 && (
                    <div className="fila border-regla py-3 [&+&]:border-t">
                      <span className="crece">
                        <span className="block font-medium">{plural(d.porRevisar ?? 0, 'registro', 'registros')} por revisar</span>
                        <span className="block text-[13px] text-texto-2">Los aprueba el ingeniero de cada becario</span>
                      </span>
                      <Button variant="link" onClick={() => navegar('/admin/revisar')}>
                        Ver
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <CuadriculaDos className="lg:grid-cols-5 lg:[&>*:last-child:nth-child(odd)]:col-span-1">
                <TarjetaIndicador valor={entero(d.becarios_activos)} etiqueta="Becarios activos" onClick={() => navegar('/admin/becarios')} />
                <TarjetaIndicador
                  valor={entero(d.becarios_sin_asignar)}
                  etiqueta="Sin ingeniero"
                  alerta={d.becarios_sin_asignar > 0}
                  onClick={() => navegar('/admin/becarios')}
                />
                <TarjetaIndicador valor={entero(d.ingenieros_activos)} etiqueta="Ingenieros" onClick={() => navegar('/admin/ingenieros')} />
                <TarjetaIndicador
                  valor={entero(d.transferencias_pendientes)}
                  etiqueta="Traspasos pendientes"
                  alerta={d.transferencias_pendientes > 0}
                  onClick={() => navegar('/admin/traspasos')}
                />
                <TarjetaIndicador
                  valor={entero(d.siase_sin_entregar)}
                  etiqueta="SIASE sin entregar este mes"
                  alerta={d.siase_sin_entregar > 0}
                  onClick={() => navegar('/admin/siase')}
                />
              </CuadriculaDos>

              <div className="rounded-lg bg-superficie px-4">
                <div className="fila py-3">
                  <span className="crece">
                    <span className="block text-[13px] text-texto-2">Periodo actual</span>
                    <span className={d.periodo_nombre ? 'block font-medium' : 'block font-medium text-peligro'}>{d.periodo_nombre ?? 'No hay periodo activo'}</span>
                    {fin && <span className="block text-[13px] text-texto-2">Termina el {fechaMedia(fin)}</span>}
                  </span>
                  <Button variant="link" onClick={() => navegar('/admin/semestres')}>
                    Semestres
                  </Button>
                </div>
                {d.ventana_abierta != null && (
                  <div className="fila border-t border-regla py-3">
                    <span className="crece">Ventana SIASE</span>
                    <span className={d.ventana_abierta ? 'text-alerta' : 'text-texto-2'}>
                      {d.ventana_abierta ? `Abierta, quedan ${plural(d.ventana_dias_restantes ?? 0, 'día', 'días')}` : 'Cerrada'}
                    </span>
                  </div>
                )}
              </div>
            </>
          )
        }}
      </SegunEstado>
    </Pantalla>
  )
}
