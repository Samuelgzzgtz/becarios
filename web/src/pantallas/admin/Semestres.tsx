import { useState } from 'react'
import { CalendarCheck, CalendarDays, CircleAlert, Lock, Tag, TriangleAlert } from 'lucide-react'
import { abrirPeriodo, cerrarSemestre, periodoActivo, progresoEquipo, vistaPreviaCierre, type ResultadoCierre } from '../../datos/repositorios'
import { mensajeAmigable } from '../../lib/errores'
import { diasEntre, esFechaValida, fechaDeTexto, fechaMedia, hoy, sumarDias } from '../../lib/fechas'
import { horasDeMeta, plural } from '../../lib/formato'
import { AvisoBanner, Badge, BarraProgreso, Boton, CampoTexto, Dialogo, Divisor, EncabezadoSeccion, IconoCircular, Pantalla, Segmentado, SegunEstado, Tarjeta, useVolver } from '../../ui/componentes'
import { useAvisos } from '../../ui/avisos'
import { useCarga } from '../../ui/hooks'

const TIPOS = ['AD', 'EJ']

export default function Semestres() {
  const volver = useVolver('/admin/mas')
  const avisos = useAvisos()
  const { estado, datos, recargar, actualizar } = useCarga(
    async () => {
      const periodo = await periodoActivo()
      const vista = periodo ? await vistaPreviaCierre().catch(() => null) : null
      return { periodo, vista }
    },
    [],
    'No se pudo cargar el periodo activo.'
  )
  // Reutiliza el progreso global para la lista Cumplió / No cumplió (solo lectura).
  const becarios = useCarga(progresoEquipo, [], '')

  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('AD')
  const [inicio, setInicio] = useState('')
  const [fin, setFin] = useState('')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [textoConfirmacion, setTextoConfirmacion] = useState('')
  const [resultado, setResultado] = useState<ResultadoCierre | null>(null)
  const [verLista, setVerLista] = useState(false)

  const periodo = datos?.periodo ?? null
  const confirmacionValida = !!periodo && textoConfirmacion.trim().toLowerCase() === periodo.nombre.trim().toLowerCase()

  function validar(): string | null {
    if (!nombre.trim()) return 'Escribe el nombre del nuevo periodo.'
    if (!TIPOS.includes(tipo)) return 'El tipo debe ser AD o EJ.'
    if (!esFechaValida(inicio)) return 'Elige la fecha de inicio.'
    if (!esFechaValida(fin)) return 'Elige la fecha de fin.'
    if (fin <= inicio) return 'La fecha de fin debe ser posterior a la de inicio.'
    const inicioActual = fechaDeTexto(periodo?.fecha_inicio)
    if (inicioActual && inicio <= inicioActual) return 'El nuevo periodo debe empezar después del inicio del periodo actual.'
    return null
  }

  /** Valida y abre la confirmación con el nombre escrito (C-05); refresca el resumen. */
  function pedirCierre() {
    if (procesando) return
    const error = validar()
    if (error) return setMensaje(error)
    setMensaje(null)
    setTextoConfirmacion('')
    setConfirmando(true)
    vistaPreviaCierre().then((vista) => actualizar((d) => ({ ...d, vista })), () => undefined)
  }

  async function confirmarCierre() {
    if (!periodo || procesando || !confirmacionValida) return
    setConfirmando(false)
    setProcesando(true)
    try {
      setResultado(await cerrarSemestre(nombre, tipo, inicio, fin, periodo.id))
    } catch (e) {
      setMensaje(mensajeAmigable(e, 'No se pudo cerrar el semestre.'))
    } finally {
      setProcesando(false)
    }
  }

  /** Crear el primer periodo cuando no hay ninguno activo (M-11). */
  async function abrir() {
    if (procesando || periodo) return
    const error = validar()
    if (error) return setMensaje(error)
    setProcesando(true)
    setMensaje(null)
    try {
      await abrirPeriodo(nombre, tipo, inicio, fin)
      avisos.exito(`Periodo "${nombre.trim()}" abierto`)
      volver()
    } catch (e) {
      setMensaje(mensajeAmigable(e, 'No se pudo abrir el periodo.'))
      setProcesando(false)
    }
  }

  const vista = datos?.vista ?? null

  return (
    <Pantalla
      titulo="Gestión de semestres"
      subtitulo={periodo ? `Periodo activo: ${periodo.nombre}` : 'Periodos académicos'}
      onVolver={volver}
      barraAccion={
        datos &&
        (periodo ? (
          <Boton ancho variante="destructivo" icono={Lock} cargando={procesando} onClick={pedirCierre}>
            Cerrar semestre y abrir el nuevo
          </Boton>
        ) : (
          <Boton ancho icono={CalendarCheck} cargando={procesando} onClick={abrir}>
            Abrir periodo
          </Boton>
        ))
      }
    >
      {confirmando && periodo && (
        <Dialogo
          titulo={`Cerrar "${periodo.nombre}"`}
          mensaje={`Se cerrará "${periodo.nombre}"${vista ? ` con ${plural(vista.becarios_activos, 'becario activo', 'becarios activos')}; ${vista.becarios_cumplidos} cumplieron su meta semestral` : ''}. Se abrirá "${nombre.trim()}". Las horas del periodo actual dejarán de contar en el progreso. Esta acción no se puede deshacer.`}
          textoConfirmar="Cerrar periodo"
          destructivo
          confirmarHabilitado={confirmacionValida}
          onConfirmar={confirmarCierre}
          onCancelar={() => setConfirmando(false)}
        >
          <CampoTexto
            etiqueta={`Escribe "${periodo.nombre}" para confirmar`}
            valor={textoConfirmacion}
            onCambio={setTextoConfirmacion}
            ayuda={confirmacionValida ? 'Nombre correcto' : null}
            autoComplete="off"
          />
        </Dialogo>
      )}
      {resultado && (
        <Dialogo
          titulo="Semestre cerrado"
          mensaje={`${resultado.becarios_cumplidos} de ${resultado.becarios_activos} becarios cumplieron su meta semestral. El periodo "${resultado.periodo_nuevo}" ya está activo.`}
          icono={CalendarCheck}
          textoConfirmar="Entendido"
          textoCancelar="Cerrar"
          onConfirmar={() => {
            avisos.exito(`Semestre cerrado; nuevo periodo "${nombre.trim()}" activo`)
            volver()
          }}
          onCancelar={() => {
            avisos.exito(`Semestre cerrado; nuevo periodo "${nombre.trim()}" activo`)
            volver()
          }}
        />
      )}

      <SegunEstado estado={estado} onReintentar={recargar}>
        {() => {
          const ini = fechaDeTexto(periodo?.fecha_inicio)
          const termina = fechaDeTexto(periodo?.fecha_fin)
          const restantes = termina ? diasEntre(hoy(), termina) : null
          return (
            <>
              <Tarjeta>
                <div className="fila">
                  <IconoCircular icono={CalendarDays} tono={periodo ? 'exito' : 'peligro'} />
                  <div className="crece">
                    <p className="chico texto-2">Periodo actual</p>
                    <p className="titulo-m">{periodo?.nombre ?? 'Ninguno activo'}</p>
                  </div>
                  <Badge texto={periodo ? 'Activo' : 'Sin periodo'} tono={periodo ? 'exito' : 'peligro'} />
                </div>
                {ini && termina && restantes != null && (
                  <>
                    <p style={{ marginTop: 12 }}>
                      Del {fechaMedia(ini)} al {fechaMedia(termina)}
                    </p>
                    <p className="chico" style={{ color: restantes < 0 ? 'var(--alerta)' : 'var(--texto-2)' }}>
                      {restantes > 0
                        ? `Faltan ${plural(restantes, 'día', 'días')} para el cierre`
                        : restantes === 0
                          ? 'Hoy termina el periodo'
                          : `El periodo terminó hace ${plural(-restantes, 'día', 'días')}`}
                    </p>
                  </>
                )}
                {!periodo && (
                  <p className="texto-2" style={{ marginTop: 12 }}>
                    No hay periodo activo. Captura los datos abajo para abrir el primero.
                  </p>
                )}
              </Tarjeta>

              {vista && (
                <Tarjeta>
                  <EncabezadoSeccion
                    titulo="Cumplimiento del periodo"
                    textoAccion={becarios.datos?.length ? (verLista ? 'Ocultar' : 'Ver lista') : null}
                    onAccion={() => setVerLista((v) => !v)}
                  />
                  <p>
                    {vista.becarios_cumplidos} de {plural(vista.becarios_activos, 'becario', 'becarios')} ya cumplieron su meta semestral.
                  </p>
                  <div style={{ marginTop: 8 }}>
                    <BarraProgreso progreso={vista.becarios_activos > 0 ? vista.becarios_cumplidos / vista.becarios_activos : 0} />
                  </div>
                  {verLista &&
                    [...(becarios.datos ?? [])]
                      .sort((a, b) => a.nombre.localeCompare(b.nombre))
                      .map((b, i) => {
                        const cumplio = b.meta_semestral != null && b.horas_semestre >= b.meta_semestral
                        return (
                          <div key={b.becario_id}>
                            {i > 0 && <Divisor />}
                            <div className="fila" style={{ padding: '8px 0' }}>
                              <div className="crece">
                                <p className="titulo-s">{b.nombre}</p>
                                <p className="chico texto-2">{horasDeMeta(b.horas_semestre, b.meta_semestral)}</p>
                              </div>
                              <Badge texto={cumplio ? 'Cumplió' : 'No cumplió'} tono={cumplio ? 'exito' : 'peligro'} />
                            </div>
                          </div>
                        )
                      })}
                </Tarjeta>
              )}

              <Tarjeta>
                <EncabezadoSeccion titulo={periodo ? 'Siguiente periodo' : 'Nuevo periodo'} />
                <div className="columna" style={{ gap: 12, marginTop: 8 }}>
                  <CampoTexto
                    etiqueta="Nombre del periodo"
                    valor={nombre}
                    onCambio={(v) => (setNombre(v), setMensaje(null))}
                    placeholder="Enero-Junio 2027"
                    icono={Tag}
                    autoComplete="off"
                  />
                  <div className="columna" style={{ gap: 4 }}>
                    <span className="chico texto-2" style={{ fontWeight: 600 }}>
                      Tipo de periodo
                    </span>
                    <Segmentado
                      opciones={['AD (agosto-diciembre)', 'EJ (enero-junio)']}
                      seleccionado={Math.max(0, TIPOS.indexOf(tipo))}
                      onSeleccionar={(i) => setTipo(TIPOS[i])}
                      etiqueta="Tipo de periodo"
                    />
                  </div>
                  <CampoTexto etiqueta="Fecha de inicio" tipo="date" valor={inicio} onCambio={(v) => (setInicio(v), setMensaje(null))} />
                  <CampoTexto
                    etiqueta="Fecha de fin"
                    tipo="date"
                    valor={fin}
                    onCambio={(v) => (setFin(v), setMensaje(null))}
                    min={esFechaValida(inicio) ? sumarDias(inicio, 1) : undefined}
                    error={esFechaValida(inicio) && esFechaValida(fin) && fin <= inicio ? 'Debe ser posterior al inicio' : null}
                  />
                </div>
              </Tarjeta>

              {mensaje && <AvisoBanner texto={mensaje} tono="peligro" icono={CircleAlert} />}
              {periodo && (
                <AvisoBanner
                  titulo="Acción irreversible"
                  texto="Cerrar el semestre marca quién cumplió su meta, archiva las horas del periodo y activa el nuevo. Se te pedirá escribir el nombre del periodo para confirmar."
                  tono="alerta"
                  icono={TriangleAlert}
                />
              )}
            </>
          )
        }}
      </SegunEstado>
    </Pantalla>
  )
}
