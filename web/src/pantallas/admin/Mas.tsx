import { useNavigate } from 'react-router-dom'
import { ChevronRight, CircleUser } from 'lucide-react'
import { EncabezadoSeccion, Pantalla } from '../../ui/componentes'
import { HERRAMIENTAS_ADMIN, type Herramienta } from '../../ui/navegacion'

/** Pestaña "Más" del administrador en el teléfono: el resto de las herramientas, agrupadas (en escritorio están en la barra lateral). */
export default function MasAdmin() {
  return (
    <Pantalla titulo="Más herramientas" subtitulo="Reportes, periodos y configuración">
      {HERRAMIENTAS_ADMIN.map((g) => (
        <section key={g.grupo} className="columna gap-1">
          <EncabezadoSeccion titulo={g.grupo} />
          <Accesos accesos={g.accesos} />
        </section>
      ))}
      <section className="columna gap-1">
        <EncabezadoSeccion titulo="Cuenta" />
        <Accesos accesos={[{ titulo: 'Mi cuenta', detalle: 'Tus datos y cerrar sesión', icono: CircleUser, ruta: '/admin/cuenta' }]} />
      </section>
    </Pantalla>
  )
}

/** Lista de accesos: ícono gris, título con su detalle y flecha, separados por reglas. */
function Accesos({ accesos }: { accesos: Herramienta[] }) {
  const navegar = useNavigate()
  return (
    <div className="rounded-lg bg-superficie px-4">
      {accesos.map((a) => {
        const I = a.icono
        return (
          <button
            key={a.ruta}
            type="button"
            onClick={() => navegar(a.ruta)}
            className="fila w-full border-regla py-3 text-left [&+&]:border-t"
          >
            <I className="size-[18px] shrink-0 text-texto-2" strokeWidth={1.75} aria-hidden />
            <span className="crece">
              <span className="block font-medium">{a.titulo}</span>
              <span className="block text-[13px] text-texto-2">{a.detalle}</span>
            </span>
            <ChevronRight className="size-4 text-texto-2" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
