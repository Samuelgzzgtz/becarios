import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CloudOff,
  Home,
  Inbox,
  LogIn,
  LogOut,
  RefreshCw,
  type LucideProps
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { MENSAJE_SIN_CONEXION } from '../lib/errores'
import { horasDeMeta, iniciales, vaAlRitmo } from '../lib/formato'
import type { ModalidadTrabajo, TipoAsistencia } from '../lib/modelos'
import type { Estado } from './hooks'

export type Icono = ComponentType<LucideProps>
export type Tono = 'exito' | 'alerta' | 'peligro' | 'info' | 'neutro'

// ===========================================================================
// Estructura
// ===========================================================================

/** Regresa a la pantalla anterior; si se entró directo por URL, a [respaldo]. */
export function useVolver(respaldo = '/'): () => void {
  const navegar = useNavigate()
  return () => {
    if ((window.history.state as { idx?: number } | null)?.idx) navegar(-1)
    else navegar(respaldo, { replace: true })
  }
}

/**
 * Pantalla con el header verde (título, subtítulo, "Volver") y contenido.
 * [barraAccion] queda fija abajo (botón principal); [fab] flota abajo a la derecha.
 */
export function Pantalla(props: {
  titulo: string
  subtitulo?: string | null
  etiqueta?: string
  onVolver?: (() => void) | null
  accionHeader?: ReactNode
  barraAccion?: ReactNode
  fab?: ReactNode
  children: ReactNode
  sinRelleno?: boolean
}) {
  useEffect(() => {
    document.title = `${props.titulo} · DocenCheck`
  }, [props.titulo])

  return (
    <div className="pantalla">
      <header className="encabezado">
        {props.onVolver && (
          <button className="boton-icono" onClick={props.onVolver} aria-label="Volver">
            <ArrowLeft />
          </button>
        )}
        <div className="textos">
          {props.etiqueta && <span className="etiqueta">{props.etiqueta}</span>}
          <h1>{props.titulo}</h1>
          {props.subtitulo && <p className="subtitulo">{props.subtitulo}</p>}
        </div>
        {props.accionHeader}
      </header>
      {props.sinRelleno ? props.children : <main className={`contenido${props.fab ? ' con-fab' : ''}`}>{props.children}</main>}
      {props.barraAccion && <div className="barra-accion">{props.barraAccion}</div>}
      {props.fab}
    </div>
  )
}

export function Tarjeta(props: {
  children: ReactNode
  onClick?: () => void
  className?: string
  seleccionada?: boolean
  style?: React.CSSProperties
  etiqueta?: string
}) {
  const clases = `tarjeta${props.onClick ? ' clic' : ''}${props.seleccionada ? ' seleccionada' : ''} ${props.className ?? ''}`
  if (props.onClick) {
    return (
      <button type="button" className={clases} onClick={props.onClick} style={props.style} aria-label={props.etiqueta}>
        {props.children}
      </button>
    )
  }
  return (
    <section className={clases} style={props.style}>
      {props.children}
    </section>
  )
}

export function EncabezadoSeccion(props: { titulo: string; icono?: Icono; textoAccion?: string | null; onAccion?: () => void }) {
  const I = props.icono
  return (
    <div className="seccion">
      {I && <I size={20} color="var(--primario)" aria-hidden />}
      <h2>{props.titulo}</h2>
      {props.textoAccion && props.onAccion && (
        <button className="accion" onClick={props.onAccion}>
          {props.textoAccion}
        </button>
      )}
    </div>
  )
}

export function Divisor() {
  return <div className="divisor" role="separator" />
}

// ===========================================================================
// Botones
// ===========================================================================

type Variante = 'primario' | 'secundario' | 'destructivo' | 'destructivo-borde' | 'texto'

export function Boton(props: {
  children: ReactNode
  onClick?: () => void
  variante?: Variante
  icono?: Icono
  cargando?: boolean
  deshabilitado?: boolean
  ancho?: boolean
  chico?: boolean
  tipo?: 'button' | 'submit'
  className?: string
  etiqueta?: string
}) {
  const I = props.icono
  return (
    <button
      type={props.tipo ?? 'button'}
      className={`boton ${props.variante ?? 'primario'}${props.ancho ? ' ancho' : ''}${props.chico ? ' chico' : ''} ${props.className ?? ''}`}
      onClick={props.onClick}
      disabled={props.deshabilitado || props.cargando}
      aria-busy={props.cargando || undefined}
      aria-label={props.etiqueta}
    >
      {props.cargando ? <span className="giro" aria-hidden /> : I ? <I size={18} aria-hidden /> : null}
      {props.children}
    </button>
  )
}

export function BotonIcono(props: { icono: Icono; etiqueta: string; onClick: () => void; deshabilitado?: boolean; className?: string }) {
  const I = props.icono
  return (
    <button className={`boton-icono ${props.className ?? ''}`} onClick={props.onClick} aria-label={props.etiqueta} disabled={props.deshabilitado}>
      <I size={22} />
    </button>
  )
}

// ===========================================================================
// Elementos visuales
// ===========================================================================

export function IconoCircular(props: { icono: Icono; tono?: Tono; tamano?: number }) {
  const t = props.tamano ?? 40
  const I = props.icono
  return (
    <span className={`icono-circular tono-${props.tono ?? 'exito'}`} style={{ width: t, height: t }} aria-hidden>
      <I size={Math.round(t * 0.5)} />
    </span>
  )
}

export function Badge(props: { texto: string; tono: Tono; icono?: Icono; className?: string }) {
  const I = props.icono
  return (
    <span className={`badge tono-${props.tono} ${props.className ?? ''}`}>
      {I && <I size={14} aria-hidden />}
      {props.texto}
    </span>
  )
}

export function Avatar(props: { nombre: string; tamano?: number }) {
  const t = props.tamano ?? 44
  return (
    <span className="avatar" style={{ width: t, height: t, fontSize: t * 0.36 }} aria-hidden>
      {iniciales(props.nombre)}
    </span>
  )
}

export function LogoDC({ tamano = 80 }: { tamano?: number }) {
  return (
    <span className="logo-dc" style={{ width: tamano, height: tamano, fontSize: tamano * 0.36 }} role="img" aria-label="DocenCheck">
      DC
    </span>
  )
}

export function AvisoBanner(props: {
  texto: string
  titulo?: string
  tono: Tono
  icono?: Icono
  textoAccion?: string | null
  onAccion?: (() => void) | null
  textoAccionSecundaria?: string
  onAccionSecundaria?: () => void
}) {
  const I = props.icono
  return (
    <div className={`banner tono-${props.tono}`} role={props.tono === 'peligro' ? 'alert' : undefined}>
      {I && <I size={22} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />}
      <div style={{ flex: 1 }}>
        {props.titulo && <p className="titulo">{props.titulo}</p>}
        <p>{props.texto}</p>
        {((props.textoAccion && props.onAccion) || (props.textoAccionSecundaria && props.onAccionSecundaria)) && (
          <div className="acciones">
            {props.textoAccion && props.onAccion && <button onClick={props.onAccion}>{props.textoAccion}</button>}
            {props.textoAccionSecundaria && props.onAccionSecundaria && (
              <button onClick={props.onAccionSecundaria}>{props.textoAccionSecundaria}</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Barra de progreso: verde si va al ritmo esperado, ámbar si va por debajo
 * (B-06). Con [ritmoEsperado] dibuja una marca donde "debería ir" a esta altura.
 */
export function BarraProgreso(props: { progreso: number; ritmoEsperado?: number | null; altura?: number }) {
  const valor = Math.min(1, Math.max(0, props.progreso))
  const color = vaAlRitmo(props.progreso, props.ritmoEsperado) ? 'var(--exito)' : 'var(--alerta)'
  const ritmo = props.ritmoEsperado
  return (
    <div
      className="barra-progreso"
      style={{ height: props.altura ?? 8 }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(valor * 100)}
    >
      <div className="relleno" style={{ width: `${valor * 100}%`, background: color }} />
      {ritmo != null && ritmo > 0.01 && ritmo < 0.99 && <div className="marca" style={{ left: `${ritmo * 100}%` }} />}
    </div>
  )
}

/** Etiqueta + "x / y h" + barra. Se usa en Inicio, Reporte de horas y listas de becarios. */
export function FilaProgreso(props: { etiqueta: string; horas: number; meta: number | null | undefined; ritmoEsperado?: number | null }) {
  const { meta } = props
  const progreso = meta != null && meta > 0 ? props.horas / meta : 0
  return (
    <div className="fila-progreso">
      <div className="fila">
        <span className="crece texto-2">{props.etiqueta}</span>
        {progreso >= 1 && <CheckCircle2 size={16} color="var(--exito)" aria-label="Meta cumplida" />}
        <span className="titulo-s tnum">{horasDeMeta(props.horas, meta)}</span>
      </div>
      {meta != null && meta > 0 && (
        <div style={{ marginTop: 8 }}>
          <BarraProgreso progreso={progreso} ritmoEsperado={props.ritmoEsperado} />
        </div>
      )}
    </div>
  )
}

export function CuadriculaDos({ children }: { children: ReactNode }) {
  return <div className="cuadricula-dos">{children}</div>
}

export function TarjetaIndicador(props: {
  valor: string
  etiqueta: string
  icono: Icono
  alerta?: boolean
  detalle?: string | null
  onClick?: () => void
}) {
  const I = props.icono
  return (
    <Tarjeta onClick={props.onClick} className={`indicador${props.alerta ? ' alerta' : ''}`} etiqueta={`${props.etiqueta}: ${props.valor}`}>
      <I size={22} color={props.alerta ? 'var(--alerta)' : 'var(--primario)'} aria-hidden />
      <span className="valor">{props.valor}</span>
      <span className="titulo-s">{props.etiqueta}</span>
      {props.detalle && <span className="chico texto-2">{props.detalle}</span>}
    </Tarjeta>
  )
}

export function FilaInfo(props: { etiqueta: string; icono: Icono; valor?: string; children?: ReactNode }) {
  const I = props.icono
  return (
    <div className="fila" style={{ padding: '10px 0' }}>
      <I size={20} color="var(--texto-2)" aria-hidden />
      <span className="crece texto-2">{props.etiqueta}</span>
      {props.children ?? <span className="titulo-s" style={{ textAlign: 'right' }}>{props.valor}</span>}
    </div>
  )
}

// ===========================================================================
// Estados de carga, error y vacío
// ===========================================================================

export function EstadoError(props: { mensaje: string; onReintentar?: () => void }) {
  const sinRed = props.mensaje.startsWith(MENSAJE_SIN_CONEXION.slice(0, 12))
  return (
    <div className="estado-centrado" role="alert">
      <IconoCircular icono={sinRed ? CloudOff : AlertTriangle} tono="peligro" tamano={56} />
      <p className="titulo-m" style={{ marginTop: 10 }}>
        {sinRed ? 'Sin conexión' : 'Algo salió mal'}
      </p>
      <p className="texto-2">{props.mensaje}</p>
      {props.onReintentar && (
        <Boton variante="secundario" icono={RefreshCw} onClick={props.onReintentar}>
          Reintentar
        </Boton>
      )}
    </div>
  )
}

export function EstadoVacio(props: { titulo: string; mensaje?: string | null; icono?: Icono; textoAccion?: string | null; onAccion?: () => void }) {
  return (
    <div className="estado-centrado">
      <IconoCircular icono={props.icono ?? Inbox} tono="neutro" tamano={64} />
      <p className="titulo-m" style={{ marginTop: 10 }}>
        {props.titulo}
      </p>
      {props.mensaje && <p className="texto-2">{props.mensaje}</p>}
      {props.textoAccion && props.onAccion && (
        <Boton variante="secundario" onClick={props.onAccion}>
          {props.textoAccion}
        </Boton>
      )}
    </div>
  )
}

export function Cargando({ texto }: { texto?: string }) {
  return (
    <div className="estado-centrado" aria-live="polite">
      <span className="giro grande" aria-hidden />
      <p className="texto-2" style={{ marginTop: 8 }}>
        {texto ?? 'Cargando…'}
      </p>
    </div>
  )
}

export function Esqueleto({ ancho = '100%', alto = 16 }: { ancho?: string; alto?: number }) {
  return <div className="esqueleto" style={{ width: ancho, height: alto }} aria-hidden />
}

export function EsqueletoLista({ tarjetas = 3 }: { tarjetas?: number }) {
  return (
    <div className="columna" style={{ gap: 12 }} aria-label="Cargando" role="status">
      {Array.from({ length: tarjetas }, (_, i) => (
        <div key={i} className="tarjeta columna">
          <Esqueleto ancho="55%" alto={18} />
          <Esqueleto ancho="35%" />
          <Esqueleto alto={8} />
        </div>
      ))}
    </div>
  )
}

/** Pinta el estado de una carga: esqueleto, error con "Reintentar" o el contenido. */
export function SegunEstado<T>(props: { estado: Estado<T>; onReintentar: () => void; children: (datos: T) => ReactNode; tarjetas?: number }) {
  const e = props.estado
  if (e.tipo === 'cargando') return <EsqueletoLista tarjetas={props.tarjetas} />
  if (e.tipo === 'error') return <EstadoError mensaje={e.mensaje} onReintentar={props.onReintentar} />
  return <>{props.children(e.datos)}</>
}

// ===========================================================================
// Diálogos
// ===========================================================================

/**
 * Confirmación para acciones que no se pueden deshacer. Con [destructivo] el
 * botón de confirmar es rojo y el ícono es de advertencia.
 */
export function Dialogo(props: {
  titulo: string
  mensaje: string
  onConfirmar: () => void
  onCancelar: () => void
  textoConfirmar?: string
  textoCancelar?: string
  destructivo?: boolean
  confirmarHabilitado?: boolean
  icono?: Icono | null
  children?: ReactNode
}) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus()
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onCancelar()
    }
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('keydown', alTeclear)
      previo?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const I = props.icono === undefined ? (props.destructivo ? AlertTriangle : null) : props.icono
  return (
    <div className="fondo-dialogo" onClick={props.onCancelar}>
      <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} onClick={(e) => e.stopPropagation()}>
        {I && (
          <div style={{ display: 'grid', placeItems: 'center' }}>
            <IconoCircular icono={I} tono={props.destructivo ? 'peligro' : 'exito'} tamano={48} />
          </div>
        )}
        <h2 id={id}>{props.titulo}</h2>
        <p className="texto-2">{props.mensaje}</p>
        {props.children && <div className="columna" style={{ gap: 12, marginTop: 4 }}>{props.children}</div>}
        <div className="botones">
          <Boton variante="texto" onClick={props.onCancelar}>
            {props.textoCancelar ?? 'Cancelar'}
          </Boton>
          <Boton
            variante={props.destructivo ? 'destructivo' : 'primario'}
            onClick={props.onConfirmar}
            deshabilitado={props.confirmarHabilitado === false}
          >
            {props.textoConfirmar ?? 'Confirmar'}
          </Boton>
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
// Formularios
// ===========================================================================

export function CampoTexto(props: {
  etiqueta: string
  valor: string
  onCambio: (v: string) => void
  icono?: Icono
  placeholder?: string
  error?: string | null
  ayuda?: string | null
  tipo?: 'text' | 'email' | 'password' | 'number' | 'date' | 'time' | 'search'
  modoTeclado?: 'text' | 'decimal' | 'numeric' | 'email' | 'search'
  autoComplete?: string
  deshabilitado?: boolean
  multilinea?: number
  sufijo?: ReactNode
  min?: string
  max?: string
  onEnter?: () => void
}) {
  const id = useId()
  const I = props.icono
  const comunes = {
    id,
    value: props.valor,
    placeholder: props.placeholder,
    disabled: props.deshabilitado,
    'aria-invalid': props.error ? true : undefined,
    'aria-describedby': props.error || props.ayuda ? `${id}-ayuda` : undefined
  }
  return (
    <div className={`campo${props.error ? ' error' : ''}`}>
      <label htmlFor={id}>{props.etiqueta}</label>
      <div className="control">
        {I && <I size={20} aria-hidden />}
        {props.multilinea ? (
          <textarea {...comunes} rows={props.multilinea} onChange={(e) => props.onCambio(e.target.value)} />
        ) : (
          <input
            {...comunes}
            type={props.tipo ?? 'text'}
            inputMode={props.modoTeclado}
            autoComplete={props.autoComplete}
            min={props.min}
            max={props.max}
            onChange={(e) => props.onCambio(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && props.onEnter) {
                e.preventDefault()
                props.onEnter()
              }
            }}
          />
        )}
        {props.sufijo}
      </div>
      {props.error ? (
        <span className="mensaje-error" id={`${id}-ayuda`}>
          {props.error}
        </span>
      ) : props.ayuda ? (
        <span className="ayuda" id={`${id}-ayuda`}>
          {props.ayuda}
        </span>
      ) : null}
    </div>
  )
}

export function Desplegable<T>(props: {
  etiqueta: string
  opciones: T[]
  seleccionado: T | null | undefined
  textoDe: (o: T) => string
  claveDe: (o: T) => string
  onSeleccionar: (o: T) => void
  icono?: Icono
  placeholder?: string
  error?: string | null
  ayuda?: string | null
  deshabilitado?: boolean
}) {
  const id = useId()
  const I = props.icono
  const clave = props.seleccionado != null ? props.claveDe(props.seleccionado) : ''
  return (
    <div className={`campo${props.error ? ' error' : ''}`}>
      <label htmlFor={id}>{props.etiqueta}</label>
      <div className="control">
        {I && <I size={20} aria-hidden />}
        <select
          id={id}
          value={clave}
          disabled={props.deshabilitado}
          onChange={(e) => {
            const o = props.opciones.find((x) => props.claveDe(x) === e.target.value)
            if (o !== undefined) props.onSeleccionar(o)
          }}
        >
          {props.seleccionado == null && <option value="">{props.placeholder ?? 'Elige una opción'}</option>}
          {props.opciones.map((o) => (
            <option key={props.claveDe(o)} value={props.claveDe(o)}>
              {props.textoDe(o)}
            </option>
          ))}
        </select>
      </div>
      {props.error ? <span className="mensaje-error">{props.error}</span> : props.ayuda ? <span className="ayuda">{props.ayuda}</span> : null}
    </div>
  )
}

export function Segmentado(props: {
  opciones: string[]
  seleccionado: number
  onSeleccionar?: (i: number) => void
  iconos?: Icono[]
  deshabilitado?: boolean
  etiqueta?: string
}) {
  const informativo = !props.onSeleccionar
  return (
    <div className={`segmentado${informativo ? ' informativo' : ''}`} role="group" aria-label={props.etiqueta}>
      {props.opciones.map((o, i) => {
        const I = props.iconos?.[i]
        return (
          <button
            key={o}
            type="button"
            aria-pressed={i === props.seleccionado}
            disabled={props.deshabilitado}
            tabIndex={informativo ? -1 : undefined}
            onClick={() => props.onSeleccionar?.(i)}
          >
            {I && <I size={16} aria-hidden />}
            {o}
          </button>
        )
      })}
    </div>
  )
}

export function Chip(props: { texto: string; activo: boolean; onClick: () => void; icono?: Icono }) {
  const I = props.icono
  return (
    <button type="button" className="chip" aria-pressed={props.activo} onClick={props.onClick}>
      {I && <I size={16} aria-hidden />}
      {props.texto}
    </button>
  )
}

/** Selector de mes con flechas (A-03). */
export function SelectorMes(props: { nombre: string; puedeSiguiente: boolean; onAnterior: () => void; onSiguiente: () => void }) {
  return (
    <div className="fila" style={{ padding: '8px 8px 0' }}>
      <BotonIcono icono={ChevronLeft} etiqueta="Mes anterior" onClick={props.onAnterior} />
      <p className="titulo-m crece" style={{ textAlign: 'center' }}>
        {props.nombre}
      </p>
      <BotonIcono icono={ChevronRight} etiqueta="Mes siguiente" onClick={props.onSiguiente} deshabilitado={!props.puedeSiguiente} />
    </div>
  )
}

export function Buscador(props: { valor: string; onCambio: (v: string) => void; placeholder: string }) {
  return (
    <CampoTexto etiqueta="Buscar" valor={props.valor} onCambio={props.onCambio} placeholder={props.placeholder} tipo="search" modoTeclado="search" />
  )
}

// ===========================================================================
// Enums → etiqueta, tono e ícono (una sola fuente de verdad, auditoría M-03)
// ===========================================================================

export const etiquetaTipo = (t: TipoAsistencia) => (t === 'entrada' ? 'Entrada' : 'Salida')
/** Entrada en verde, Salida en ámbar. */
export const tonoTipo = (t: TipoAsistencia): Tono => (t === 'entrada' ? 'exito' : 'alerta')
export const iconoTipo = (t: TipoAsistencia): Icono => (t === 'entrada' ? LogIn : LogOut)

/** null = día sin configurar / no aplica. */
export const etiquetaModalidad = (m: ModalidadTrabajo | null | undefined) =>
  m === 'presencial' ? 'Presencial' : m === 'home_office' ? 'Home office' : 'No aplica'
export const iconoModalidad = (m: ModalidadTrabajo | null | undefined): Icono =>
  m === 'presencial' ? Building2 : m === 'home_office' ? Home : Ban
/** Ícono para "sin configurar" (distinto de "no aplica"). */
export const IconoSinConfigurar = CircleHelp

/** Abre una URL que se obtiene después de un await sin que el navegador la bloquee como ventana emergente. */
export async function abrirUrl(obtener: () => Promise<string>): Promise<void> {
  const ventana = window.open('', '_blank')
  try {
    const url = await obtener()
    if (ventana) ventana.location.href = url
    else window.location.href = url
  } catch (e) {
    ventana?.close()
    throw e
  }
}

export function useAhora(intervaloMs = 30_000): Date {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setAhora(new Date()), intervaloMs)
    return () => window.clearInterval(t)
  }, [intervaloMs])
  return ahora
}
