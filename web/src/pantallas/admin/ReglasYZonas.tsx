import { useEffect, useState } from 'react'
import { LocateFixed, MapPin, Plus, Power, Ruler, Save, Trash2 } from 'lucide-react'
import { configAsistencia, eliminarGeocerca, geocercas, guardarConfigAsistencia, guardarGeocerca } from '../../datos/repositorios'
import { mensajeAmigable } from '../../lib/errores'
import { plural } from '../../lib/formato'
import type { Geocerca } from '../../lib/modelos'
import { ErrorUbicacion, leerUbicacion, redondearGrados } from '../../lib/ubicacion'
import { useAvisos } from '../../ui/avisos'
import { Badge, Boton, CampoTexto, Dialogo, EncabezadoSeccion, SegunEstado, Tarjeta } from '../../ui/componentes'
import { useCarga } from '../../ui/hooks'
import { validarReglas, validarZona } from '../../lib/validacion'

// ===========================================================================
// Reglas de asistencia
// ===========================================================================

type CampoRegla = 'jornada' | 'atraso' | 'tolerancia'

export function TarjetaReglas() {
  const avisos = useAvisos()
  const { estado, datos, recargar } = useCarga(configAsistencia, [], 'No se pudieron cargar las reglas de asistencia.')
  const [f, setF] = useState<Record<CampoRegla, string>>({ jornada: '', atraso: '', tolerancia: '' })
  const [errores, setErrores] = useState<Partial<Record<CampoRegla, string>>>({})
  const [falla, setFalla] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!datos) return
    setF({ jornada: String(datos.jornada_maxima_horas), atraso: String(datos.atraso_maximo_minutos), tolerancia: String(datos.tolerancia_minutos) })
  }, [datos])

  const cambiar = (c: CampoRegla) => (v: string) => {
    setF((x) => ({ ...x, [c]: v }))
    setFalla(null)
  }

  async function guardar() {
    if (guardando) return
    const r = validarReglas(f)
    setErrores(r.errores)
    if (Object.keys(r.errores).length > 0) {
      setFalla('Revisa los campos marcados.')
      return
    }
    setGuardando(true)
    setFalla(null)
    try {
      await guardarConfigAsistencia(r.jornada!, r.atraso!, r.tolerancia!)
      avisos.exito('Reglas de asistencia guardadas.')
      recargar()
    } catch (e) {
      setFalla(mensajeAmigable(e, 'No se pudieron guardar las reglas de asistencia.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Tarjeta>
      <EncabezadoSeccion titulo="Reglas de asistencia" icono={Ruler} />
      <SegunEstado estado={estado} onReintentar={recargar} tarjetas={1}>
        {() => (
          <div className="columna" style={{ gap: 10 }}>
            <CampoTexto
              etiqueta="Jornada máxima"
              valor={f.jornada}
              onCambio={cambiar('jornada')}
              modoTeclado="decimal"
              error={errores.jornada}
              ayuda="Una jornada más larga que esto no suma horas hasta que un ingeniero la apruebe."
              sufijo={<span className="texto-2">horas</span>}
            />
            <CampoTexto
              etiqueta="Atraso máximo"
              valor={f.atraso}
              onCambio={cambiar('atraso')}
              modoTeclado="numeric"
              error={errores.atraso}
              ayuda="Un registro guardado sin conexión que llega con más atraso queda por revisar."
              sufijo={<span className="texto-2">min</span>}
            />
            <CampoTexto
              etiqueta="Tolerancia del reloj"
              valor={f.tolerancia}
              onCambio={cambiar('tolerancia')}
              modoTeclado="numeric"
              error={errores.tolerancia}
              ayuda="Diferencia aceptada entre el reloj del teléfono y el del servidor. Si la hora del teléfono va adelantada más que esto, se corrige y queda por revisar."
              sufijo={<span className="texto-2">min</span>}
              onEnter={guardar}
            />
            {falla && (
              <p className="mensaje-error" role="alert">
                {falla}
              </p>
            )}
            <Boton ancho icono={Save} cargando={guardando} onClick={guardar}>
              Guardar reglas
            </Boton>
          </div>
        )}
      </SegunEstado>
    </Tarjeta>
  )
}

// ===========================================================================
// Zonas de registro
// ===========================================================================

type CampoZona = 'nombre' | 'radio' | 'latitud' | 'longitud'

export function TarjetaZonas() {
  const avisos = useAvisos()
  const { estado, recargar } = useCarga(geocercas, [], 'No se pudieron cargar las zonas de registro.')
  const [f, setF] = useState<Record<CampoZona, string>>({ nombre: '', radio: '150', latitud: '', longitud: '' })
  const [errores, setErrores] = useState<Partial<Record<CampoZona, string>>>({})
  const [falla, setFalla] = useState<string | null>(null)
  const [ubicando, setUbicando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [aQuitar, setAQuitar] = useState<Geocerca | null>(null)

  const cambiar = (c: CampoZona) => (v: string) => {
    setF((x) => ({ ...x, [c]: v }))
    setFalla(null)
  }

  async function usarMiUbicacion() {
    if (ubicando) return
    setUbicando(true)
    setFalla(null)
    try {
      const u = await leerUbicacion()
      setF((x) => ({ ...x, latitud: String(redondearGrados(u.latitud)), longitud: String(redondearGrados(u.longitud)) }))
      setErrores((e) => ({ ...e, latitud: undefined, longitud: undefined }))
      avisos.info('Ubicación lista. Revisa el nombre y el radio.')
    } catch (e) {
      setFalla(e instanceof ErrorUbicacion ? e.message : 'No se pudo obtener tu ubicación.')
    } finally {
      setUbicando(false)
    }
  }

  async function agregar() {
    if (guardando) return
    const r = validarZona(f)
    setErrores(r.errores)
    if (Object.keys(r.errores).length > 0) {
      setFalla('Revisa los campos marcados.')
      return
    }
    setGuardando(true)
    setFalla(null)
    try {
      await guardarGeocerca(null, r.nombre, r.latitud!, r.longitud!, r.radio!, true)
      avisos.exito(`Zona "${r.nombre}" agregada.`)
      setF({ nombre: '', radio: '150', latitud: '', longitud: '' })
      recargar()
    } catch (e) {
      setFalla(mensajeAmigable(e, 'No se pudo guardar la zona.'))
    } finally {
      setGuardando(false)
    }
  }

  async function alternar(g: Geocerca) {
    try {
      await guardarGeocerca(g.id, g.nombre, g.latitud, g.longitud, g.radio_m, !g.activa)
      avisos.exito(g.activa ? `Zona "${g.nombre}" desactivada.` : `Zona "${g.nombre}" activada.`)
      recargar()
    } catch (e) {
      avisos.error(mensajeAmigable(e, 'No se pudo cambiar la zona.'))
    }
  }

  async function quitar(g: Geocerca) {
    try {
      await eliminarGeocerca(g.id)
      avisos.exito(`Zona "${g.nombre}" eliminada.`)
      recargar()
    } catch (e) {
      avisos.error(mensajeAmigable(e, 'No se pudo eliminar la zona.'))
    }
  }

  return (
    <Tarjeta>
      <EncabezadoSeccion titulo="Zonas de registro" icono={MapPin} />
      {aQuitar && (
        <Dialogo
          titulo="Quitar zona"
          mensaje={`Se eliminará la zona "${aQuitar.nombre}". Los registros presenciales hechos fuera de las zonas que queden activas quedarán por revisar; si no queda ninguna zona activa, dejará de validarse la ubicación.`}
          textoConfirmar="Quitar"
          destructivo
          onConfirmar={() => {
            const g = aQuitar
            setAQuitar(null)
            void quitar(g)
          }}
          onCancelar={() => setAQuitar(null)}
        />
      )}
      <p className="chico texto-2" style={{ marginBottom: 8 }}>
        Sin zonas activas no se valida la ubicación: todos los registros se aceptan igual. Con al menos una zona activa, un registro presencial sin
        ubicación o fuera de todas las zonas queda por revisar. El home office no se evalúa.
      </p>
      <SegunEstado estado={estado} onReintentar={recargar} tarjetas={1}>
        {(lista) => (
          <div className="columna" style={{ gap: 12 }}>
            {lista.length === 0 ? (
              <p className="texto-2">Todavía no hay zonas. Agrega la primera abajo.</p>
            ) : (
              <>
                <p className="chico texto-2">{plural(lista.filter((z) => z.activa).length, 'zona activa', 'zonas activas')} de {lista.length}.</p>
                <ul className="columna" style={{ gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
                  {lista.map((g) => (
                    <li key={g.id} className="columna" style={{ gap: 6, padding: '8px 0', borderTop: '1px solid var(--borde)' }}>
                      <div className="fila" style={{ flexWrap: 'wrap' }}>
                        <span className="titulo-s crece">{g.nombre}</span>
                        <Badge texto={g.activa ? 'Activa' : 'Inactiva'} tono={g.activa ? 'exito' : 'neutro'} />
                      </div>
                      <p className="chico texto-2">Radio de {g.radio_m} m</p>
                      <div className="fila" style={{ flexWrap: 'wrap' }}>
                        <Boton variante="secundario" icono={Power} onClick={() => void alternar(g)} etiqueta={`${g.activa ? 'Desactivar' : 'Activar'} la zona ${g.nombre}`}>
                          {g.activa ? 'Desactivar' : 'Activar'}
                        </Boton>
                        <Boton variante="destructivo-borde" icono={Trash2} onClick={() => setAQuitar(g)} etiqueta={`Quitar la zona ${g.nombre}`}>
                          Quitar
                        </Boton>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="columna" style={{ gap: 10, borderTop: '1px solid var(--borde)', paddingTop: 12 }}>
              <h3 className="titulo-s">Agregar zona</h3>
              <CampoTexto etiqueta="Nombre" valor={f.nombre} onCambio={cambiar('nombre')} placeholder="Por ejemplo: Edificio de Sistemas" error={errores.nombre} />
              <CampoTexto
                etiqueta="Radio"
                valor={f.radio}
                onCambio={cambiar('radio')}
                modoTeclado="numeric"
                error={errores.radio}
                ayuda="Entre 20 y 5000 metros. 150 m cubre un edificio y sus alrededores."
                sufijo={<span className="texto-2">m</span>}
              />
              <Boton variante="secundario" icono={LocateFixed} cargando={ubicando} onClick={() => void usarMiUbicacion()}>
                Usar mi ubicación actual
              </Boton>
              <div className="fila" style={{ alignItems: 'flex-start' }}>
                <div className="crece">
                  <CampoTexto etiqueta="Latitud" valor={f.latitud} onCambio={cambiar('latitud')} modoTeclado="decimal" error={errores.latitud} placeholder="25.725" />
                </div>
                <div className="crece">
                  <CampoTexto etiqueta="Longitud" valor={f.longitud} onCambio={cambiar('longitud')} modoTeclado="decimal" error={errores.longitud} placeholder="-100.313" onEnter={agregar} />
                </div>
              </div>
              {falla && (
                <p className="mensaje-error" role="alert">
                  {falla}
                </p>
              )}
              <Boton ancho icono={Plus} cargando={guardando} onClick={agregar}>
                Agregar zona
              </Boton>
            </div>
          </div>
        )}
      </SegunEstado>
    </Tarjeta>
  )
}
