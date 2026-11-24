import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, BadgeCheck, KeyRound, Building, CalendarDays, ChevronRight, HardHat, IdCard, LogOut } from 'lucide-react'
import { indicadores, ingenieroDe, periodoActivo, progresoEquipo } from '../../datos/repositorios'
import { abrirPerfilClerk, sesionActiva } from '../../datos/sesion'
import { enRiesgo, type Usuario } from '../../lib/modelos'
import {
  Avatar,
  Badge,
  Boton,
  CuadriculaDos,
  Divisor,
  EncabezadoSeccion,
  FilaInfo,
  IconoCircular,
  Pantalla,
  SegunEstado,
  Tarjeta,
  TarjetaIndicador,
  useVolver
} from '../../ui/componentes'
import { etiquetaEstadoUsuario, etiquetaPerfil, tonoEstadoUsuario } from '../../ui/estadosVisuales'
import { useCarga } from '../../ui/hooks'
import { useCerrarSesion } from '../../ui/cerrarSesion'

interface DatosCuenta {
  usuario: Usuario
  ingeniero: Usuario | null
  /** Falló la consulta (p. ej. sin red); no es lo mismo que "Sin asignar". */
  ingenieroNoDisponible: boolean
  periodo: string | null
  /** Ingeniero: becarios del equipo / en ritmo bajo. Admin: becarios activos / ingenieros (M-15). */
  indicadorA: number | null
  indicadorB: number | null
}

async function cargar(): Promise<DatosCuenta> {
  const usuario = await sesionActiva()
  if (!usuario) throw new Error('sin sesión')
  const base: DatosCuenta = { usuario, ingeniero: null, ingenieroNoDisponible: false, periodo: null, indicadorA: null, indicadorB: null }

  if (usuario.perfil === 'becario') {
    const [ing, periodo] = await Promise.all([
      ingenieroDe(usuario.id).then(
        (i) => ({ i, falla: false }),
        () => ({ i: null, falla: true })
      ),
      periodoActivo().catch(() => null)
    ])
    return { ...base, ingeniero: ing.i, ingenieroNoDisponible: ing.falla, periodo: periodo?.nombre ?? null }
  }
  if (usuario.perfil === 'ingeniero') {
    const [periodo, equipo] = await Promise.all([periodoActivo().catch(() => null), progresoEquipo().catch(() => null)])
    return { ...base, periodo: periodo?.nombre ?? null, indicadorA: equipo?.length ?? null, indicadorB: equipo?.filter(enRiesgo).length ?? null }
  }
  const ind = await indicadores().catch(() => null)
  return { ...base, periodo: ind?.periodo_nombre ?? null, indicadorA: ind?.becarios_activos ?? null, indicadorB: ind?.ingenieros_activos ?? null }
}

/** Mi cuenta: la misma pantalla para los tres perfiles, con variantes (M-15). */
export default function MiCuenta({ conVolver = false }: { conVolver?: boolean }) {
  const navegar = useNavigate()
  const volver = useVolver('/admin/mas')
  const { estado, datos, recargar } = useCarga(cargar, [], 'No se pudo cargar tu cuenta.')
  const sesion = useCerrarSesion()

  return (
    <Pantalla
      titulo="Mi cuenta"
      onVolver={conVolver ? volver : null}
      // Junto al título, a la vista sin bajar, aunque la cuenta no haya cargado (A-12).
      accionHeader={
        <Boton chico variante="destructivo-borde" icono={LogOut} cargando={sesion.cerrando} onClick={sesion.pedir}>
          Cerrar sesión
        </Boton>
      }
    >
      {sesion.dialogo}

      <SegunEstado estado={estado} onReintentar={recargar} tarjetas={2}>
        {(d) => {
          const u = d.usuario
          return (
            <>
              <Tarjeta>
                <div className="columna" style={{ alignItems: 'center', gap: 8 }}>
                  <Avatar nombre={u.nombre} tamano={80} />
                  <p className="titulo-m" style={{ fontSize: '1.25rem', textAlign: 'center' }}>
                    {u.nombre}
                  </p>
                  <Badge texto={u.perfil === 'administrador' ? 'Administrador general' : etiquetaPerfil[u.perfil]} tono="neutro" />
                </div>
              </Tarjeta>

              {u.perfil === 'ingeniero' && d.indicadorA != null && (
                <CuadriculaDos>
                  <TarjetaIndicador valor={String(d.indicadorA)} etiqueta="Becarios a cargo" />
                  <TarjetaIndicador valor={String(d.indicadorB ?? 0)} etiqueta="Con ritmo bajo" alerta={(d.indicadorB ?? 0) > 0} />
                </CuadriculaDos>
              )}
              {u.perfil === 'administrador' && d.indicadorA != null && (
                <CuadriculaDos>
                  <TarjetaIndicador valor={String(d.indicadorA)} etiqueta="Becarios activos" />
                  <TarjetaIndicador valor={String(d.indicadorB ?? 0)} etiqueta="Supervisores FIME" />
                </CuadriculaDos>
              )}

              <Tarjeta>
                <EncabezadoSeccion
                  titulo={u.perfil === 'becario' ? 'Detalles de becario' : u.perfil === 'ingeniero' ? 'Detalles de ingeniero' : 'Información institucional'}
                />
                <FilaInfo etiqueta={u.perfil === 'becario' ? 'Matrícula' : 'No. de empleado'} icono={IdCard} valor={u.matricula} />
                <Divisor />
                <FilaInfo etiqueta="Coordinación" icono={Building} valor={u.coordinacion ?? 'Sin registrar'} />
                {u.perfil === 'becario' && (
                  <>
                    <Divisor />
                    <FilaInfo
                      etiqueta="Ingeniero asignado"
                      icono={HardHat}
                      valor={d.ingeniero?.nombre ?? (d.ingenieroNoDisponible ? 'No disponible sin conexión' : 'Sin asignar')}
                    />
                    <Divisor />
                    <FilaInfo etiqueta="Estado" icono={BadgeCheck}>
                      <Badge texto={etiquetaEstadoUsuario[u.estado]} tono={tonoEstadoUsuario[u.estado]} />
                    </FilaInfo>
                  </>
                )}
                <Divisor />
                <FilaInfo etiqueta="Semestre actual" icono={CalendarDays} valor={d.periodo ?? '–'} />
              </Tarjeta>

              {u.perfil === 'ingeniero' && (
                <Tarjeta onClick={() => navegar('/ingeniero/transferencias')} etiqueta="Mis solicitudes de transferencia">
                  <div className="fila">
                    <IconoCircular icono={ArrowLeftRight} tono="info" />
                    <div className="crece">
                      <p className="titulo-s">Mis solicitudes de transferencia</p>
                      <p className="chico texto-2">Consulta su estado</p>
                    </div>
                    <ChevronRight color="var(--texto-2)" aria-hidden />
                  </div>
                </Tarjeta>
              )}
            </>
          )
        }}
      </SegunEstado>

      {datos && (
        <Tarjeta onClick={abrirPerfilClerk} etiqueta="Seguridad de la cuenta">
          <div className="fila">
            <IconoCircular icono={KeyRound} tono="neutro" />
            <div className="crece">
              <p className="titulo-s">Seguridad de la cuenta</p>
              <p className="chico texto-2">Contraseña, correo y cuenta Microsoft</p>
            </div>
            <ChevronRight color="var(--texto-2)" aria-hidden />
          </div>
        </Tarjeta>
      )}

      <p className="chico texto-2" style={{ textAlign: 'center' }}>
        Pasalista · FIME UANL
      </p>
    </Pantalla>
  )
}
