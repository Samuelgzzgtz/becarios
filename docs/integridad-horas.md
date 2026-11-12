# Integridad de horas y asistencias (migración 0021)

Cierra los huecos que dejaba el conteo de horas: la hora de cada registro la mandaba el
teléfono sin comprobarla, no había tope de jornada, un turno sin salida pasaba
desapercibido y las correcciones manuales no dejaban rastro. Este documento es el
contrato entre la base (`backend/sql/0021_integridad_horas.sql`) y la app (`web/`).

## Decisiones (ajustables desde Configuración, rol administrador)

| Regla | Valor inicial | Qué pasa al incumplirla |
| --- | --- | --- |
| `jornada_maxima_horas` | 10 | La jornada (entrada → salida del mismo día) **no suma** hasta que el ingeniero la apruebe |
| `atraso_maximo_minutos` | 60 | Un registro que llega con más atraso (cola sin red) queda `por_revisar` y no suma hasta aprobarlo |
| `tolerancia_minutos` | 5 | Diferencia aceptada entre el reloj del teléfono y el servidor. Un registro con hora **futura** más allá de esto se corrige a la hora del servidor y queda `por_revisar` |

- La regla del mismo día local (0012) se conserva: una salida después de la medianoche
  deja el turno abierto y no suma; se corrige con "Agregar registro".
- Los registros que **agrega el ingeniero asignado** (`origen = 'manual'`) son de
  confianza y suman aunque pasen el tope; quedan en la bitácora.
- La hora del cliente solo se reescribe cuando es futura. Dentro de la tolerancia, o con
  atraso, se conserva tal cual (así un reintento de la cola sigue siendo un duplicado exacto
  y el anti-duplicado de 0013 lo detecta).
- Geocerca: **opcional**. Mientras el administrador no registre ninguna zona activa no cambia
  nada. Con zonas activas, un registro `presencial` sin ubicación o fuera de todas las zonas
  queda `por_revisar`. `home_office` no se evalúa.
- `puntaje_rostro` (similitud del reconocimiento facial) se guarda para auditoría. Como la
  comparación corre en el teléfono, **no es una garantía**: sirve para detectar patrones.
  Desde 0023, un registro propio sin puntaje queda `por_revisar` / `sin_rostro`.
- Modalidad (0023): el servidor la compara con `horarios_modalidad` para el día local del
  registro (sin horario se espera `presencial`); si no coincide queda `por_revisar` /
  `modalidad_distinta`.

## Base de datos (0021)

Identidad: usar `public.uid_actual()`, nunca `auth.uid()` (0018 migró todo a Clerk).
Helpers existentes: `es_admin()`, `es_ingeniero_de(becario)`, `usuario_activo()`,
`hoy_local()`, `inicio_dia_local(date)`; zona `America/Monterrey`.

### `asistencias` — columnas nuevas

| Columna | Tipo | Notas |
| --- | --- | --- |
| `origen` | text, `'en_linea' \| 'cola' \| 'manual'`, default `'en_linea'` | Lo calcula el servidor; el cliente no lo decide |
| `revision` | text, `'ok' \| 'por_revisar' \| 'aprobada'`, default `'ok'` | Idem |
| `motivo_revision` | text null | `'atraso_cola' \| 'reloj_adelantado' \| 'sin_ubicacion' \| 'fuera_de_zona' \| 'sin_rostro' \| 'modalidad_distinta' \| 'revision_humana'` (`sin_rostro` y `modalidad_distinta` desde 0023; `revision_humana` desde 0024: todo autorregistro sin otro motivo, porque la coincidencia facial se calcula en el teléfono) |
| `puntaje_rostro` | numeric(5,4) null, 0 a 1 | Lo manda el cliente |

Trigger `BEFORE INSERT` (se ejecuta antes de `asistencias_validar`): ignora y recalcula
`origen`, `revision` y `motivo_revision` aunque el cliente los mande.

- Inserta otra persona que no es el becario (el ingeniero asignado, con `corregir_asistencia` o al aprobar una solicitud de agregar): `origen='manual'`, `revision='ok'`.
- Inserta el propio becario: atraso = `now() - ocurrido_en`.
  - atraso entre `-tolerancia` y `+tolerancia`: `en_linea`, `ok`.
  - atraso mayor que la tolerancia: `origen='cola'`; si pasa `atraso_maximo_minutos` → `por_revisar` / `atraso_cola`.
  - hora futura más allá de la tolerancia: `ocurrido_en := now()`, `por_revisar` / `reloj_adelantado`.
  - sin `puntaje_rostro` → `sin_rostro`; modalidad distinta a la del horario → `modalidad_distinta` (0023, solo si aún `ok`).
  - geocerca (solo si hay zonas activas, modalidad `presencial` y aún `ok`): sin latitud/longitud → `sin_ubicacion`; más lejos que el radio de todas las zonas (haversine) → `fuera_de_zona`.
- Sin JWT (dueño, jobs) o con `service_role`: no toca nada. Un JWT `anon`/`authenticated` sin usuario de Clerk se rechaza (0025).
- Ignora `jornada_aprobada` del cliente (0025).

### `horas_trabajadas(becario, desde, hasta)` (misma firma)

Suma entrada → salida inmediata siguiente **si** (1) el mismo día local, (2) ni la entrada
ni la salida están `por_revisar`, y (3) duración ≤ `jornada_maxima_horas`, **o** la salida
tiene `jornada_aprobada` o es `manual` (0025: aprobar solo la revisión de la salida ya no
levanta el tope). `horas_por_aprobar(becario)` suma con las mismas reglas los pares que
siguen `por_revisar`, en las ventanas de `progreso_horas`. `progreso_horas`, `progreso_equipo`, el cierre de periodo y
`_cumplimiento_periodo` la usan, así que no cambian. Revisar que ninguna otra función
repita el emparejamiento por su cuenta.

### Tablas nuevas (todas con RLS; solo se escriben por RPC o disparador)

- `config_asistencia`: una fila (`id boolean primary key default true check (id)`) con
  `jornada_maxima_horas numeric(4,1)` (1–24), `atraso_maximo_minutos int` (1–1440),
  `tolerancia_minutos int` (1–60), `updated_at`. Lectura: cualquier usuario autenticado.
- `geocercas`: `id uuid`, `nombre text`, `latitud numeric(9,6)`, `longitud numeric(9,6)`,
  `radio_m int` (20–5000, default 150), `activa boolean default true`. Lectura: autenticados.
- `bitacora_asistencias`: `id bigint identity`, `asistencia_id uuid` (sin FK, sobrevive al
  borrado), `becario_id uuid`, `accion text` (`'agregar' \| 'editar' \| 'eliminar' \| 'aprobar'`),
  `hecho_por uuid null`, `hecho_en timestamptz default now()`, `antes jsonb`, `despues jsonb`.
  Se llena con un disparador `AFTER` `SECURITY DEFINER`: toda edición y borrado, los inserts
  `manual` y la aprobación (cambio de `revision` a `aprobada`). Lectura: administrador, el
  ingeniero asignado y el propio becario. Nadie escribe directo.

### RPC (todas `SECURITY DEFINER`, `search_path = public, pg_temp`, `EXECUTE` solo a `authenticated`)

```sql
anomalias_asistencia(p_becario uuid default null, p_desde date default null, p_hasta date default null)
returns table (
  tipo           text,        -- 'turno_abierto' | 'jornada_larga' | 'atraso' | 'reloj_adelantado' | 'sin_ubicacion' | 'fuera_de_zona' | 'sin_rostro' | 'modalidad_distinta'
  becario_id     uuid,
  becario_nombre text,
  asistencia_id  uuid,        -- fila a revisar (turno_abierto: la entrada; jornada_larga: la salida)
  entrada_id     uuid,        -- solo jornada_larga: su entrada; si no, null
  ocurrido_en    timestamptz,
  fecha          date,        -- día local
  horas          numeric,     -- jornada_larga: duración; turno_abierto: horas transcurridas si es de hoy; si no, null
  atraso_minutos integer,     -- solo atraso: now() - ocurrido_en al registrar (created_at)
  detalle        text         -- frase corta en español
)
```
Por defecto `p_desde` = inicio del periodo activo (o `hoy_local() - 30` sin periodo), `p_hasta = hoy_local()`.
Desde 0025 también devuelve evidencia del registro `asistencia_id`: `puntaje_rostro`,
`distancia_m` (metros fuera de la zona activa más cercana, 0 = dentro; null en home office), `origen` y
`subido_minutos` (`created_at - ocurrido_en`). `contar_anomalias_asistencia` da solo el total. Visibilidad: administrador ve a
todos los becarios activos; ingeniero a los suyos; becario solo a sí mismo (si `p_becario` no
es visible para quien llama → error). Los motivos del servidor salen solo mientras el registro
sigue `por_revisar`. `turno_abierto`: entrada sin
salida el mismo día local y (su día ya pasó, o hoy y lleva más de `jornada_maxima_horas`).
Aprobar la entrada no oculta el turno sin salida (0025).
`jornada_larga`: pares que sobrepasan el tope sin `jornada_aprobada` ni salida `manual`.
Ordenar por `fecha, becario_nombre, ocurrido_en` (0025: lo más antiguo primero).

```sql
aprobar_asistencia(p_asistencia uuid, p_jornada boolean default false) returns void
  -- solo el ingeniero asignado (0026), nunca el propio becario; deja revision='aprobada' y, con p_jornada, jornada_aprobada
aprobar_asistencias(p_ids uuid[]) returns integer       -- lote solo de revision_humana (todo o nada), sin confirmar jornadas
bitacora_asistencias_de(p_becario uuid, p_limite int default 50)
returns table (id bigint, hecho_en timestamptz, accion text, hecho_por uuid,
               hecho_por_nombre text, asistencia_id uuid, antes jsonb, despues jsonb)
guardar_config_asistencia(p_jornada_maxima numeric, p_atraso_maximo_minutos int, p_tolerancia_minutos int) returns void  -- admin
guardar_geocerca(p_id uuid, p_nombre text, p_latitud numeric, p_longitud numeric, p_radio_m int, p_activa boolean) returns uuid  -- admin; p_id null crea
eliminar_geocerca(p_id uuid) returns void                -- admin
```
Errores con `raise exception` en español claro, sin tecnicismos.

Precisiones de implementación: la bitácora registra `aprobar` solo si el único cambio fue
`revision → 'aprobada'` o `jornada_aprobada → true`; cualquier otra edición es `editar`. `anomalias_asistencia` solo
considera becarios activos y, para `jornada_larga`, `ocurrido_en` es la hora de la salida.
`exportar_asistencias` incluye `revision`, `motivo_revision` y `origen` y acepta un cursor
opcional (`p_despues_en`, `p_despues_id`) además de `p_offset` (0025).

## App (`web/src`)

- `lib/modelos.ts`: `Asistencia` gana `origen`, `revision`, `motivo_revision`, `puntaje_rostro`;
  tipos `ConfigAsistencia`, `Geocerca`, `Anomalia` (columnas de arriba), `EntradaBitacora`.
  `horasPorDia` aplica las mismas reglas que SQL (revisión, tope, `manual`/`aprobada`) y recibe el tope.
- `datos/asistencias.ts` + `datos/repositorios.ts`: leer `config_asistencia` y `geocercas`;
  funciones para `anomalias_asistencia`, `aprobar_asistencia`, `bitacora_asistencias_de`,
  `guardar_config_asistencia`, `guardar_geocerca`, `eliminar_geocerca`.
- Registrar asistencia: pedir la ubicación del navegador (`navigator.geolocation`, 8 s de
  espera, sin bloquear el registro si se niega o falla) y mandar `latitud`, `longitud` y
  `puntaje_rostro`. La cola sin red conserva esos campos.
- Becario: aviso en Inicio cuando tiene un turno abierto ("Tu entrada de ayer no tiene
  salida; pide a tu ingeniero que la agregue") y etiquetas "Por revisar" / "Registro tardío"
  en sus registros.
- Ingeniero: tarjeta "Por revisar" en su panel y pantalla `/ingeniero/revisar` con la lista
  de anomalías y acciones **Aprobar** (jornada larga, atraso, reloj, ubicación) o **Agregar
  salida / corregir** (lleva a las asistencias del becario). En las asistencias del becario:
  etiquetas de revisión y la bitácora de cambios.
- Administrador: la misma lista en `/admin/revisar` (todos los becarios), solo para consulta
  desde 0026; en Configuración,
  tarjeta "Reglas de asistencia" (tres valores) y "Zonas de registro" (alta con "usar mi
  ubicación actual", activar/desactivar y quitar).

## Pruebas

`web/src/sql-tests/` corre las migraciones 0001–0021 en PGlite (con un `auth`/`storage`
mínimos simulados) y comprueba las reglas de arriba con Vitest. Se ejecutan con `npm test`.
