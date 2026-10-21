import { BarChart3, CalendarDays, CircleUser, ClipboardCheck, Download, SlidersHorizontal } from 'lucide-react'
import { EncabezadoSeccion, Pantalla } from '../../ui/componentes'
import { Accesos } from './Panel'

/** Pestaña "Más" del administrador: el resto de las herramientas, agrupadas. */
export default function MasAdmin() {
  return (
    <Pantalla titulo="Más herramientas" subtitulo="Reportes, periodos y configuración" etiqueta="Administrador">
      <EncabezadoSeccion titulo="Seguimiento" />
      <Accesos
        accesos={[
          { titulo: 'Firmas SIASE', detalle: 'Firma en lote los reportes mensuales', icono: ClipboardCheck, ruta: '/admin/siase' },
          { titulo: 'Reporte de horas', detalle: 'Avance por ingeniero y becario', icono: BarChart3, ruta: '/admin/reporte-horas' },
          { titulo: 'Exportar asistencias', detalle: 'Genera un CSV para Excel', icono: Download, ruta: '/admin/exportar' }
        ]}
      />
      <EncabezadoSeccion titulo="Administración" />
      <Accesos
        accesos={[
          { titulo: 'Gestión de semestres', detalle: 'Periodo actual, cierre y apertura', icono: CalendarDays, ruta: '/admin/semestres' },
          { titulo: 'Configuración', detalle: 'Metas de horas y ventana SIASE', icono: SlidersHorizontal, ruta: '/admin/configuracion' }
        ]}
      />
      <EncabezadoSeccion titulo="Cuenta" />
      <Accesos accesos={[{ titulo: 'Mi cuenta', detalle: 'Tus datos y cerrar sesión', icono: CircleUser, ruta: '/admin/cuenta' }]} />
    </Pantalla>
  )
}
