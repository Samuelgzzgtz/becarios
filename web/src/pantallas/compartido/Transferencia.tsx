import type { ReactNode } from 'react'
import { ArrowRight, Clock } from 'lucide-react'
import { fechaHora } from '../../lib/fechas'
import { coincideBusqueda } from '../../lib/formato'
import type { TransferenciaDetalle } from '../../lib/modelos'
import { Avatar, Badge, Tarjeta } from '../../ui/componentes'
import { etiquetaTransferencia, tonoTransferencia } from '../../ui/estadosVisuales'

/** Tarjeta de transferencia: becario, "De → A", motivo, fecha y estado. La usan ingeniero y admin. */
export function TarjetaTransferencia({ detalle, children }: { detalle: TransferenciaDetalle; children?: ReactNode }) {
  const t = detalle.transferencia
  return (
    <Tarjeta>
      <div className="fila">
        <Avatar nombre={detalle.becario?.nombre ?? '?'} tamano={40} />
        <div className="crece">
          <p className="titulo-s recortar">{detalle.becario?.nombre ?? 'Becario'}</p>
          {detalle.becario && <p className="chico texto-2">Matrícula {detalle.becario.matricula}</p>}
        </div>
        <Badge texto={etiquetaTransferencia[t.estado]} tono={tonoTransferencia[t.estado]} />
      </div>
      <div className="fila" style={{ marginTop: 12, alignItems: 'flex-start' }}>
        <div className="crece">
          <p className="chico texto-2">De</p>
          <p>{detalle.origen?.nombre ?? '–'}</p>
        </div>
        <ArrowRight color="var(--texto-2)" aria-label="hacia" style={{ marginTop: 10 }} />
        <div className="crece">
          <p className="chico texto-2">A</p>
          <p>{detalle.destino?.nombre ?? '–'}</p>
        </div>
      </div>
      <p style={{ marginTop: 12 }}>“{t.motivo}”</p>
      {t.created_at && (
        <p className="chico texto-2 fila" style={{ gap: 4, marginTop: 8 }}>
          <Clock size={14} aria-hidden /> Solicitada el {fechaHora(t.created_at)}
        </p>
      )}
      {children && <div style={{ marginTop: 12 }}>{children}</div>}
    </Tarjeta>
  )
}

/** Búsqueda en una lista de transferencias: becario, matrícula o cualquiera de los dos ingenieros. */
export const coincideTransferencia = (d: TransferenciaDetalle, busqueda: string) =>
  coincideBusqueda(busqueda, d.becario?.nombre, d.becario?.matricula, d.origen?.nombre, d.destino?.nombre)
