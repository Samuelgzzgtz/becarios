import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CircleAlert, HardHat, Save } from 'lucide-react'
import { asignarBecario, ingenieroAsignadoDe, listarPorPerfil, usuario as obtenerUsuario } from '../../datos/repositorios'
import { mensajeAmigable } from '../../lib/errores'
import { Avatar, AvisoBanner, Badge, Boton, Dialogo, EncabezadoSeccion, EstadoVacio, Pantalla, SegunEstado, Tarjeta, useVolver } from '../../ui/componentes'
import { useAvisos } from '../../ui/avisos'
import { useCarga } from '../../ui/hooks'

/**
 * A-10: tocar un nombre solo lo selecciona; se muestra quién está asignado hoy,
 * se confirma el cambio y la reasignación es atómica en el servidor.
 */
export default function AsignarIngeniero() {
  const { id = '' } = useParams()
  const volver = useVolver('/admin/becarios')
  const avisos = useAvisos()
  const nombre = useCarga(() => obtenerUsuario(id).then((u) => u?.nombre ?? null), [id], '')
  const { estado, datos, recargar } = useCarga(
    async () => {
      const [ingenieros, actual] = await Promise.all([listarPorPerfil('ingeniero'), ingenieroAsignadoDe(id)])
      return { ingenieros, actual }
    },
    [id],
    'No se pudieron cargar los ingenieros.'
  )
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (datos) setSeleccionado(datos.actual)
  }, [datos])

  const actual = datos?.ingenieros.find((i) => i.id === datos.actual) ?? null
  const elegido = datos?.ingenieros.find((i) => i.id === seleccionado) ?? null
  const puedeGuardar = !guardando && !!seleccionado && seleccionado !== datos?.actual

  async function ejecutar() {
    if (!seleccionado || guardando) return
    setGuardando(true)
    setError(null)
    try {
      await asignarBecario(id, seleccionado)
      avisos.exito(`${nombre.datos ?? 'Becario'} asignado a ${elegido?.nombre ?? 'el ingeniero elegido'}`)
      volver()
    } catch (e) {
      setError(mensajeAmigable(e, 'No se pudo asignar el ingeniero.'))
      setGuardando(false)
    }
  }

  return (
    <Pantalla
      titulo="Asignar ingeniero"
      subtitulo={nombre.datos ? `Becario: ${nombre.datos}` : null}
      onVolver={volver}
      barraAccion={
        datos &&
        datos.ingenieros.length > 0 && (
          <Boton ancho icono={Save} cargando={guardando} deshabilitado={!puedeGuardar} onClick={() => (datos.actual ? setConfirmando(true) : void ejecutar())}>
            {datos.actual ? 'Guardar cambio' : 'Asignar'}
          </Boton>
        )
      }
    >
      {confirmando && (
        <Dialogo
          titulo="Cambiar de ingeniero"
          mensaje={`${nombre.datos ?? 'El becario'} dejará de estar con ${actual?.nombre ?? 'su ingeniero actual'} y pasará a ${elegido?.nombre ?? 'el ingeniero elegido'}. Las transferencias pendientes de este becario se rechazarán.`}
          textoConfirmar="Reasignar"
          destructivo
          onConfirmar={() => {
            setConfirmando(false)
            void ejecutar()
          }}
          onCancelar={() => setConfirmando(false)}
        />
      )}
      <SegunEstado estado={estado} onReintentar={recargar}>
        {(d) => (
          <>
            <Tarjeta>
              <p className="chico texto-2">Asignado actualmente</p>
              <p className="titulo-m" style={{ color: actual ? 'var(--texto)' : 'var(--alerta)' }}>
                {actual?.nombre ?? 'Sin ingeniero'}
              </p>
            </Tarjeta>
            <EncabezadoSeccion titulo="Elige un ingeniero" />
            {d.ingenieros.length === 0 && <EstadoVacio titulo="No hay ingenieros activos" mensaje="Da de alta un ingeniero primero." icono={HardHat} />}
            <div role="radiogroup" aria-label="Ingenieros" className="columna" style={{ gap: 8 }}>
              {d.ingenieros.map((i) => {
                const marcado = i.id === seleccionado
                return (
                  <label key={i.id} className={`tarjeta fila${marcado ? ' seleccionada' : ''}`} style={{ cursor: 'pointer', padding: '10px 14px' }}>
                    <input type="radio" name="ingeniero" className="casilla" checked={marcado} onChange={() => (setSeleccionado(i.id), setError(null))} />
                    <Avatar nombre={i.nombre} tamano={36} />
                    <span className="crece">
                      <span className="titulo-s" style={{ display: 'block' }}>
                        {i.nombre}
                      </span>
                      {i.coordinacion && <span className="chico texto-2">{i.coordinacion}</span>}
                    </span>
                    {i.id === d.actual && <Badge texto="Actual" tono="exito" />}
                  </label>
                )
              })}
            </div>
            {error && <AvisoBanner texto={error} tono="peligro" icono={CircleAlert} />}
          </>
        )}
      </SegunEstado>
    </Pantalla>
  )
}
