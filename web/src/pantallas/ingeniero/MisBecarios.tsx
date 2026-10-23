import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, CalendarDays, CalendarRange, Info, ScanFace, UserX } from 'lucide-react'
import { progresoEquipo } from '../../datos/repositorios'
import { requerirUsuario } from '../../datos/sesion'
import { horasDeMeta } from '../../lib/formato'
import { enRiesgo, horasEsperadasSemana, type ProgresoBecario } from '../../lib/modelos'
import { Avatar, AvisoBanner, Badge, Boton, Buscador, EstadoVacio, FilaProgreso, Pantalla, SegunEstado, Tarjeta } from '../../ui/componentes'
import { useAlReanudar, useCarga } from '../../ui/hooks'

async function cargar(): Promise<ProgresoBecario[]> {
  await requerirUsuario()
  return progresoEquipo()
}

export default function MisBecarios() {
  const navegar = useNavigate()
  const { estado, recargar } = useCarga(cargar, [], 'No se pudo cargar a tus becarios.')
  useAlReanudar(recargar)
  const [busqueda, setBusqueda] = useState('')

  return (
    <Pantalla titulo="Mis becarios" subtitulo="Avance de la semana y acciones">
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(becarios) => {
          const b = busqueda.trim().toLowerCase()
          const filtrados = becarios.filter((x) => !b || x.nombre.toLowerCase().includes(b) || x.matricula.toLowerCase().includes(b))
          return (
            <>
              <AvisoBanner
                texto="El alta y baja de becarios la gestiona la coordinación."
                tono="info"
                icono={Info}
                textoAccion="Ver mis transferencias"
                onAccion={() => navegar('/ingeniero/transferencias')}
              />
              {becarios.length > 4 && <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Buscar por nombre o matrícula" />}
              {becarios.length === 0 ? (
                <EstadoVacio titulo="Todavía no tienes becarios asignados" mensaje="Cuando la coordinación te asigne becarios aparecerán aquí." icono={UserX} />
              ) : filtrados.length === 0 ? (
                <EstadoVacio titulo="Sin coincidencias" mensaje={`Nadie coincide con "${busqueda}".`} />
              ) : null}
              {filtrados.map((p) => {
                const meta = p.meta_semanal
                const ritmo = meta != null && meta > 0 ? horasEsperadasSemana(p) / meta : null
                const ir = (destino: string) => navegar(`/ingeniero/becario/${p.becario_id}/${destino}`)
                return (
                  <Tarjeta key={p.becario_id}>
                    <div className="fila">
                      <Avatar nombre={p.nombre} />
                      <div className="crece">
                        <p className="titulo-m recortar">{p.nombre}</p>
                        <p className="chico texto-2">Matrícula {p.matricula}</p>
                      </div>
                      {enRiesgo(p) ? <Badge texto="Ritmo bajo" tono="alerta" /> : <Badge texto="Activo" tono="exito" />}
                    </div>
                    <FilaProgreso etiqueta="Semana" horas={p.horas_semana} meta={meta} ritmoEsperado={ritmo} />
                    <p className="chico texto-2">Mes: {horasDeMeta(p.horas_mes, p.meta_mensual)}</p>
                    <div className="envolver" style={{ marginTop: 12 }}>
                      <Boton chico variante="secundario" icono={CalendarDays} onClick={() => ir('asistencias')}>
                        Asistencias
                      </Boton>
                      <Boton chico variante="secundario" icono={CalendarRange} onClick={() => ir('modalidad')}>
                        Modalidad
                      </Boton>
                      <Boton chico variante="secundario" icono={ScanFace} onClick={() => ir('enrolamiento')}>
                        Enrolar
                      </Boton>
                      <Boton chico variante="secundario" icono={ArrowLeftRight} onClick={() => ir('transferir')}>
                        Transferir
                      </Boton>
                    </div>
                  </Tarjeta>
                )
              })}
            </>
          )
        }}
      </SegunEstado>
    </Pantalla>
  )
}
