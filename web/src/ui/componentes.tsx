import { useEffect, useId, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CloudOff,
  Home,
  Inbox,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  type LucideProps
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar as AvatarRadix, AvatarFallback } from '@/components/ui/avatar'
import { Badge as BadgeUi } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { MENSAJE_SIN_CONEXION } from '../lib/errores'
import { iniciales, numeroHoras, vaAlRitmo } from '../lib/formato'
import type { ModalidadTrabajo, TipoAsistencia } from '../lib/modelos'
import type { Estado } from './hooks'

export type Icono = ComponentType<LucideProps>
export type Tono = 'exito' | 'alerta' | 'peligro' | 'info' | 'neutro'

/*
 * Componentes de Pasalista sobre shadcn/ui + Tailwind. Las pantallas solo usan estos;
 * cambiar el aspecto de la app es cambiar este archivo y ui/estilos.css.
 * Reglas visuales: superficies blancas sin borde ni sombra, títulos de texto sobre el
 * fondo, un solo botón principal (casi negro) por pantalla, pastillas solo dentro de
 * filas, sin íconos dentro de círculos de color.
 */

/** Pastilla: tinte pálido con texto oscuro del mismo tono. Info y neutro van en gris (el cromo no lleva color). */
const PASTILLA: Record<Tono, string> = {
  exito: 'bg-dato-c text-sobre-dato-c',
  alerta: 'bg-alerta-c text-alerta',
  peligro: 'bg-peligro-c text-peligro',
  info: 'bg-neutro-c text-sobre-neutro-c',
  neutro: 'bg-neutro-c text-sobre-neutro-c'
}

/** Color de un ícono suelto: solo lo que pide acción o falló lleva color. */
const COLOR_ICONO: Record<Tono, string> = {
  exito: 'text-dato',
  alerta: 'text-alerta',
  peligro: 'text-peligro',
  info: 'text-texto-2',
  neutro: 'text-texto-2'
}

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
 * Pantalla: título de texto sobre el fondo (con "Volver" si aplica) y el contenido.
 * [saludo] pone el título en peso normal (el "Hola, Ana" del becario).
 * [barraAccion] queda fija abajo (botón principal).
 */
export function Pantalla(props: {
  titulo: string
  subtitulo?: string | null
  saludo?: boolean
  onVolver?: (() => void) | null
  accionHeader?: ReactNode
  barraAccion?: ReactNode
  children: ReactNode
  sinRelleno?: boolean
}) {
  useEffect(() => {
    document.title = `${props.titulo} · Pasalista`
  }, [props.titulo])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 px-4 pt-[calc(18px+var(--seguro-arriba))] pb-3.5 lg:pt-7">
        {props.onVolver && (
          <button
            type="button"
            className="grid size-11 shrink-0 place-items-center rounded-md bg-superficie transition-colors hover:bg-elevado"
            onClick={props.onVolver}
            aria-label="Volver"
          >
            <ArrowLeft className="size-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className={cn('text-2xl leading-tight tracking-[-0.01em]', props.saludo ? 'font-normal' : 'font-semibold')}>{props.titulo}</h1>
          {props.subtitulo && <p className="mt-0.5 text-texto-2">{props.subtitulo}</p>}
        </div>
        {props.accionHeader}
      </header>
      {props.sinRelleno ? (
        props.children
      ) : (
        <main className="flex flex-1 flex-col gap-3 px-4 pb-4 motion-safe:animate-[entrar_var(--duration-fast)_var(--ease-smooth-out)]">{props.children}</main>
      )}
      {props.barraAccion && (
        <div className="sticky bottom-[var(--alto-barra,0px)] z-[4] border-t border-regla bg-fondo px-4 pt-3 pb-[calc(12px+var(--seguro-abajo))]">
          {props.barraAccion}
        </div>
      )}
    </div>
  )
}

/** Contenedor blanco sin borde ni sombra. Con [onClick] es un botón de ancho completo. */
export function Tarjeta(props: {
  children: ReactNode
  onClick?: () => void
  className?: string
  seleccionada?: boolean
  style?: CSSProperties
  etiqueta?: string
}) {
  const clases = cn(
    'tarjeta',
    props.onClick && 'block w-full text-left transition-colors hover:bg-superficie/70 active:scale-[0.995]',
    props.seleccionada && 'seleccionada',
    props.className
  )
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

/** Título de sección; el ícono ya no se dibuja (los encabezados van solo con texto). */
export function EncabezadoSeccion(props: { titulo: string; icono?: Icono; textoAccion?: string | null; onAccion?: () => void }) {
  return (
    <div className="flex min-h-9 items-center gap-2">
      <h2 className="flex-1 text-[15px] font-semibold">{props.titulo}</h2>
      {props.textoAccion && props.onAccion && (
        <Button variant="link" className="min-h-9 h-auto" onClick={props.onAccion}>
          {props.textoAccion}
        </Button>
      )}
    </div>
  )
}

export function Divisor() {
  return <div className="my-1 h-px bg-regla" role="separator" />
}

// ===========================================================================
// Botones
// ===========================================================================

type Variante = 'primario' | 'secundario' | 'destructivo' | 'destructivo-borde' | 'texto'

const VARIANTE = {
  primario: 'default',
  secundario: 'secondary',
  destructivo: 'destructive',
  'destructivo-borde': 'destructive-soft',
  texto: 'link'
} as const

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
    <Button
      type={props.tipo ?? 'button'}
      variant={VARIANTE[props.variante ?? 'primario']}
      size={props.chico ? 'sm' : 'default'}
      className={cn(props.ancho && 'w-full', props.className)}
      onClick={props.onClick}
      disabled={props.deshabilitado || props.cargando}
      aria-busy={props.cargando || undefined}
      aria-label={props.etiqueta}
    >
      {props.cargando ? <span className="giro size-4" aria-hidden /> : I ? <I aria-hidden /> : null}
      {props.children}
    </Button>
  )
}

export function BotonIcono(props: { icono: Icono; etiqueta: string; onClick: () => void; deshabilitado?: boolean; className?: string }) {
  const I = props.icono
  return (
    <Button variant="ghost" size="icon" className={cn('rounded-md [&_svg]:size-5', props.className)} onClick={props.onClick} aria-label={props.etiqueta} disabled={props.deshabilitado}>
      <I />
    </Button>
  )
}

// ===========================================================================
// Elementos visuales
// ===========================================================================

/**
 * Antes un ícono dentro de un círculo de color; ahora el ícono solo, en gris (o en el
 * color del tono si avisa algo). Conserva el ancho para que las filas sigan alineadas.
 */
export function IconoCircular(props: { icono: Icono; tono?: Tono; tamano?: number }) {
  const t = props.tamano ?? 40
  const I = props.icono
  return (
    <span className={cn('grid shrink-0 place-items-center', COLOR_ICONO[props.tono ?? 'neutro'])} style={{ width: Math.min(t, 32) }} aria-hidden>
      <I size={Math.min(28, Math.max(18, Math.round(t * 0.42)))} strokeWidth={1.75} />
    </span>
  )
}

export function Badge(props: { texto: string; tono: Tono; icono?: Icono; className?: string }) {
  return <BadgeUi className={cn('h-5 self-center border-0 px-2 py-0 text-xs', PASTILLA[props.tono], props.className)}>{props.texto}</BadgeUi>
}

/** Tonos pálidos para avatares (sin violetas ni índigos); cada persona conserva siempre el mismo. */
const MATICES = [150, 30, 195, 0, 85, 175, 45, 120, 210, 15]

export function matizDe(nombre: string): number {
  let h = 0
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) | 0
  return MATICES[Math.abs(h) % MATICES.length]
}

export function Avatar(props: { nombre: string; tamano?: number }) {
  const t = props.tamano ?? 40
  return (
    <AvatarRadix className="shrink-0" style={{ width: t, height: t, '--h': matizDe(props.nombre) } as CSSProperties} aria-hidden>
      <AvatarFallback
        className="bg-[hsl(var(--h)_45%_90%)] font-semibold text-[hsl(var(--h)_45%_26%)] dark:bg-[hsl(var(--h)_20%_22%)] dark:text-[hsl(var(--h)_45%_82%)]"
        style={{ fontSize: Math.round(t * 0.36) }}
      >
        {iniciales(props.nombre)}
      </AvatarFallback>
    </AvatarRadix>
  )
}

export function Logo({ tamano = 80 }: { tamano?: number }) {
  return <img className="rounded-[24%]" src="/logo.svg" width={tamano} height={tamano} alt="" />
}

/** Aviso dentro de la pantalla: panel blanco, ícono y título en el color del tono, acciones de texto. */
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
  const acciones = (props.textoAccion && props.onAccion) || (props.textoAccionSecundaria && props.onAccionSecundaria)
  return (
    <div className="flex items-start gap-3 rounded-lg bg-superficie px-4 py-3.5" role={props.tono === 'peligro' ? 'alert' : undefined}>
      {I && <I className={cn('mt-0.5 size-[18px] shrink-0', COLOR_ICONO[props.tono])} strokeWidth={1.75} aria-hidden />}
      <div className="min-w-0 flex-1">
        {props.titulo && <p className="font-medium">{props.titulo}</p>}
        <p className={cn(props.titulo && 'text-[13px] text-texto-2')}>{props.texto}</p>
        {acciones && (
          <div className="mt-1 -mb-2 flex flex-wrap gap-x-4">
            {props.textoAccion && props.onAccion && (
              <Button variant="link" className="px-0" onClick={props.onAccion}>
                {props.textoAccion}
              </Button>
            )}
            {props.textoAccionSecundaria && props.onAccionSecundaria && (
              <Button variant="link" className="px-0 text-texto-2" onClick={props.onAccionSecundaria}>
                {props.textoAccionSecundaria}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Barra de horas: el relleno siempre en verde (horas trabajadas); con [ritmoEsperado]
 * dibuja una marca donde "debería ir" a esta altura (B-06). Quien la usa pinta en ámbar
 * la cifra si va atrasado.
 */
export function BarraProgreso(props: { progreso: number; ritmoEsperado?: number | null; altura?: number }) {
  const valor = Math.min(1, Math.max(0, props.progreso))
  const ritmo = props.ritmoEsperado
  const alto = props.altura ?? 6
  return (
    <div
      className="relative rounded-full bg-regla"
      style={{ height: alto }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(valor * 100)}
    >
      <div className="absolute inset-y-0 left-0 rounded-full bg-dato transition-[width] duration-700" style={{ width: `${valor * 100}%` }} />
      {ritmo != null && ritmo > 0.01 && ritmo < 0.99 && (
        <div className="absolute w-[1.5px] bg-marca-ritmo" style={{ left: `${ritmo * 100}%`, top: -4, height: alto + 8 }} />
      )}
    </div>
  )
}

/** "12.5 de 20 h": cifra en tinta (ámbar si va atrasada) y la meta en gris. */
export function HorasDeMeta(props: { horas: number; meta: number | null | undefined; atrasado?: boolean }) {
  const { meta } = props
  return (
    <span className="whitespace-nowrap">
      <span className={cn('font-medium', props.atrasado && 'text-alerta')}>{numeroHoras(props.horas)}</span>
      <span className="text-texto-2">{meta != null && meta > 0 ? ` de ${numeroHoras(meta)} h` : ' h'}</span>
    </span>
  )
}

/** Etiqueta + "x de y h" + barra. Se usa en Reporte de horas y listas de becarios. */
export function FilaProgreso(props: { etiqueta: string; horas: number; meta: number | null | undefined; ritmoEsperado?: number | null }) {
  const { meta } = props
  const progreso = meta != null && meta > 0 ? props.horas / meta : 0
  return (
    <div className="py-2.5">
      <div className="fila">
        <span className="crece">{props.etiqueta}</span>
        <HorasDeMeta horas={props.horas} meta={meta} atrasado={meta != null && meta > 0 && !vaAlRitmo(progreso, props.ritmoEsperado)} />
      </div>
      {meta != null && meta > 0 && (
        <div className="mt-2">
          <BarraProgreso progreso={progreso} ritmoEsperado={props.ritmoEsperado} />
        </div>
      )}
    </div>
  )
}

/**
 * Indicadores: un solo contenedor blanco dividido por reglas de 1 px (el fondo gris
 * asoma por el hueco de 1 px). Si la cuenta es impar, la última celda ocupa el resto
 * de la fila para no dejar un hueco.
 */
export function CuadriculaDos({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-regla',
        '[&>*:last-child:nth-child(odd)]:col-span-2',
        className
      )}
    >
      {children}
    </div>
  )
}

/** Celda de indicador: valor arriba, etiqueta abajo; sin ícono. El ícono se acepta por compatibilidad y no se dibuja. */
export function TarjetaIndicador(props: {
  valor: string
  etiqueta: string
  icono?: Icono
  alerta?: boolean
  detalle?: string | null
  onClick?: () => void
}) {
  const contenido = (
    <>
      <span className="text-[22px] leading-tight font-semibold tracking-[-0.01em]">
        <span className={cn(props.alerta && 'text-alerta')}>{props.valor}</span>
        {props.detalle && <span className="text-sm font-normal tracking-normal text-texto-2"> {props.detalle}</span>}
      </span>
      <span className="truncate text-[13px] text-texto-2">{props.etiqueta}</span>
    </>
  )
  const clases = 'flex min-w-0 flex-col gap-0.5 bg-superficie px-3.5 py-3 text-left'
  return props.onClick ? (
    <button type="button" className={cn(clases, 'transition-colors hover:bg-superficie/70')} onClick={props.onClick} aria-label={`${props.etiqueta}: ${props.valor}`}>
      {contenido}
    </button>
  ) : (
    <div className={clases}>{contenido}</div>
  )
}

export function FilaInfo(props: { etiqueta: string; icono: Icono; valor?: string; children?: ReactNode }) {
  const I = props.icono
  return (
    <div className="fila py-2.5">
      <I className="size-[18px] text-texto-2" strokeWidth={1.75} aria-hidden />
      <span className="crece text-texto-2">{props.etiqueta}</span>
      {props.children ?? <span className="text-right font-medium">{props.valor}</span>}
    </div>
  )
}

// ===========================================================================
// Estados de carga, error y vacío
// ===========================================================================

export function EstadoError(props: { mensaje: string; onReintentar?: () => void }) {
  const sinRed = props.mensaje.startsWith(MENSAJE_SIN_CONEXION.slice(0, 12))
  const I = sinRed ? CloudOff : AlertTriangle
  return (
    <div className="estado-centrado" role="alert">
      <I className="size-7 text-peligro" strokeWidth={1.75} aria-hidden />
      <p className="titulo-m mt-1.5">{sinRed ? 'Sin conexión' : 'Algo salió mal'}</p>
      <p className="max-w-sm text-texto-2">{props.mensaje}</p>
      {props.onReintentar && (
        <Boton variante="secundario" icono={RefreshCw} onClick={props.onReintentar} className="mt-3">
          Reintentar
        </Boton>
      )}
    </div>
  )
}

export function EstadoVacio(props: { titulo: string; mensaje?: string | null; icono?: Icono; textoAccion?: string | null; onAccion?: () => void }) {
  const I = props.icono ?? Inbox
  return (
    <div className="estado-centrado">
      <I className="size-7 text-texto-2" strokeWidth={1.75} aria-hidden />
      <p className="titulo-m mt-1.5">{props.titulo}</p>
      {props.mensaje && <p className="max-w-sm text-texto-2">{props.mensaje}</p>}
      {props.textoAccion && props.onAccion && (
        <Boton variante="secundario" onClick={props.onAccion} className="mt-3">
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
      <p className="mt-2 text-texto-2">{texto ?? 'Cargando…'}</p>
    </div>
  )
}

export function Esqueleto({ ancho = '100%', alto = 16 }: { ancho?: string; alto?: number }) {
  return <Skeleton className="rounded-sm bg-elevado" style={{ width: ancho, height: alto }} aria-hidden />
}

export function EsqueletoLista({ tarjetas = 3 }: { tarjetas?: number }) {
  return (
    <div className="columna gap-3" aria-label="Cargando" role="status">
      {Array.from({ length: tarjetas }, (_, i) => (
        <div key={i} className="tarjeta columna">
          <Esqueleto ancho="55%" alto={18} />
          <Esqueleto ancho="35%" />
          <Esqueleto alto={6} />
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
 * Confirmación para acciones que no se pueden deshacer (Dialog de shadcn/Radix: atrapa
 * el foco, cierra con Escape o tocando fuera y devuelve el foco al salir). Con
 * [destructivo] el botón de confirmar es rojo. [icono] se acepta por compatibilidad y no se dibuja.
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
  return (
    <Dialog open onOpenChange={(abierto) => !abierto && props.onCancelar()}>
      <DialogContent showCloseButton={false} className="max-h-[88dvh] gap-3 overflow-y-auto rounded-lg border-0 bg-superficie p-5 sm:max-w-[420px]">
        <DialogHeader className="gap-1.5 text-left">
          <DialogTitle className="text-lg leading-snug">{props.titulo}</DialogTitle>
          <DialogDescription className="text-sm text-texto-2">{props.mensaje}</DialogDescription>
        </DialogHeader>
        {props.children && <div className="columna mt-1 gap-3">{props.children}</div>}
        <DialogFooter className="mt-2 flex-row justify-end gap-2">
          <Boton variante="secundario" onClick={props.onCancelar}>
            {props.textoCancelar ?? 'Cancelar'}
          </Boton>
          <Boton variante={props.destructivo ? 'destructivo' : 'primario'} onClick={props.onConfirmar} deshabilitado={props.confirmarHabilitado === false}>
            {props.textoConfirmar ?? 'Confirmar'}
          </Boton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ===========================================================================
// Formularios
// ===========================================================================

const CONTROL = 'flex items-center gap-2 rounded-md border border-control bg-superficie px-3 focus-within:ring-[3px] focus-within:ring-ring/40'
const ETIQUETA = 'text-[13px] font-medium'

function AyudaOError(props: { id: string; error?: string | null; ayuda?: string | null }) {
  if (props.error) return <span className="mensaje-error" id={props.id}>{props.error}</span>
  if (props.ayuda) return <span className="text-[13px] text-texto-2" id={props.id}>{props.ayuda}</span>
  return null
}

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
  /** La etiqueta solo para lectores de pantalla (buscadores). */
  etiquetaOculta?: boolean
}) {
  const id = useId()
  const I = props.icono
  const comunes = {
    id,
    value: props.valor,
    placeholder: props.placeholder,
    disabled: props.deshabilitado,
    'aria-invalid': props.error ? true : undefined,
    'aria-describedby': props.error || props.ayuda ? `${id}-ayuda` : undefined,
    // El borde y el foco los pone el contenedor (para el ícono y el sufijo).
    className: 'border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent'
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={cn(ETIQUETA, props.etiquetaOculta && 'sr-only')}>
        {props.etiqueta}
      </label>
      <div className={cn(CONTROL, props.error && 'border-peligro', props.deshabilitado && 'opacity-60')}>
        {I && <I className="size-[18px] shrink-0 text-texto-2" strokeWidth={1.75} aria-hidden />}
        {props.multilinea ? (
          <Textarea {...comunes} className={cn(comunes.className, 'min-h-0 py-2.5')} rows={props.multilinea} onChange={(e) => props.onCambio(e.target.value)} />
        ) : (
          <Input
            {...comunes}
            className={cn(comunes.className, 'h-11 text-base md:text-base lg:text-sm')}
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
      <AyudaOError id={`${id}-ayuda`} error={props.error} ayuda={props.ayuda} />
    </div>
  )
}

/** Lista desplegable nativa (en el teléfono abre el selector del sistema). [icono] ya no se dibuja. */
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
  etiquetaOculta?: boolean
}) {
  const id = useId()
  const clave = props.seleccionado != null ? props.claveDe(props.seleccionado) : ''
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={cn(ETIQUETA, props.etiquetaOculta && 'sr-only')}>
        {props.etiqueta}
      </label>
      <NativeSelect
        id={id}
        value={clave}
        disabled={props.deshabilitado}
        aria-invalid={props.error ? true : undefined}
        className={cn('h-11 border-control bg-superficie text-base shadow-none lg:text-sm dark:bg-superficie', props.error && 'border-peligro')}
        onChange={(e) => {
          const o = props.opciones.find((x) => props.claveDe(x) === e.target.value)
          if (o !== undefined) props.onSeleccionar(o)
        }}
      >
        {props.seleccionado == null && <NativeSelectOption value="">{props.placeholder ?? 'Elige una opción'}</NativeSelectOption>}
        {props.opciones.map((o) => (
          <NativeSelectOption key={props.claveDe(o)} value={props.claveDe(o)}>
            {props.textoDe(o)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <AyudaOError id={`${id}-ayuda`} error={props.error} ayuda={props.ayuda} />
    </div>
  )
}

/**
 * Control segmentado (Toggle Group de shadcn). Sin [onSeleccionar] es informativo:
 * muestra la opción vigente y no se puede tocar.
 */
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
    <ToggleGroup
      type="single"
      value={props.seleccionado >= 0 ? String(props.seleccionado) : ''}
      onValueChange={(v) => v && props.onSeleccionar?.(Number(v))}
      disabled={props.deshabilitado}
      aria-label={props.etiqueta}
      className="w-full gap-1 rounded-md bg-elevado p-1"
    >
      {props.opciones.map((o, i) => {
        const I = props.iconos?.[i]
        return (
          <ToggleGroupItem
            key={o}
            value={String(i)}
            tabIndex={informativo ? -1 : undefined}
            className={cn(
              'h-9 flex-1 rounded-[4px]! text-texto-2 hover:bg-transparent hover:text-texto data-[state=on]:bg-superficie data-[state=on]:text-texto',
              informativo && 'pointer-events-none'
            )}
          >
            {I && <I aria-hidden />}
            {o}
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}

/** Filtro de una sola fila: activo en tinta, inactivo en blanco. */
export function Chip(props: { texto: string; activo: boolean; onClick: () => void; icono?: Icono }) {
  return (
    <button
      type="button"
      aria-pressed={props.activo}
      onClick={props.onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors',
        props.activo ? 'bg-tinta text-sobre-tinta' : 'bg-superficie text-texto hover:bg-elevado'
      )}
    >
      {props.texto}
    </button>
  )
}

/** Selector de mes con flechas (A-03). */
export function SelectorMes(props: { nombre: string; puedeSiguiente: boolean; onAnterior: () => void; onSiguiente: () => void }) {
  return (
    <div className="fila">
      <BotonIcono icono={ChevronLeft} etiqueta="Mes anterior" onClick={props.onAnterior} className="bg-superficie" />
      <p className="crece text-center text-[15px] font-semibold">{props.nombre}</p>
      <BotonIcono icono={ChevronRight} etiqueta="Mes siguiente" onClick={props.onSiguiente} deshabilitado={!props.puedeSiguiente} className="bg-superficie" />
    </div>
  )
}

export function Buscador(props: { valor: string; onCambio: (v: string) => void; placeholder: string }) {
  return (
    <CampoTexto
      etiqueta="Buscar"
      etiquetaOculta
      icono={Search}
      valor={props.valor}
      onCambio={props.onCambio}
      placeholder={props.placeholder}
      tipo="search"
      modoTeclado="search"
    />
  )
}

// ===========================================================================
// Enums → etiqueta, tono e ícono (una sola fuente de verdad, auditoría M-03)
// ===========================================================================

export const etiquetaTipo = (t: TipoAsistencia) => (t === 'entrada' ? 'Entrada' : 'Salida')
export const iconoTipo = (t: TipoAsistencia): Icono => (t === 'entrada' ? LogIn : LogOut)

/** null = día sin configurar / no aplica. */
export const etiquetaModalidad = (m: ModalidadTrabajo | null | undefined) =>
  m === 'presencial' ? 'Presencial' : m === 'home_office' ? 'Home office' : 'No aplica'
export const iconoModalidad = (m: ModalidadTrabajo | null | undefined): Icono =>
  m === 'presencial' ? Building2 : m === 'home_office' ? Home : Ban
/** Ícono para "sin configurar" (distinto de "no aplica"). */
export const IconoSinConfigurar = CircleHelp

/**
 * Abre una URL que se obtiene después de un await sin que el navegador la bloquee como ventana emergente.
 * La pestaña nueva no conserva referencia a la app (equivale a noopener: un archivo abierto no puede
 * redirigirla).
 */
export async function abrirUrl(obtener: () => Promise<string>): Promise<void> {
  const ventana = window.open('', '_blank')
  if (ventana) ventana.opener = null
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
