# Migraciones — Fase 2 (Base de datos y backend)

Corresponden a la Fase 2 del `plan-construccion-becarios.md`. **Aplicadas al proyecto
`rcvpowylehewvsxquhip` el 2026-09-17.** Los advisors de seguridad y performance de
Supabase se corrieron después de cada tanda y quedaron limpios salvo lo que se explica
en "Warnings que se dejaron a propósito" más abajo.

| Archivo | Qué hace |
| --- | --- |
| `0001_tipos_base.sql` | Enums de perfil, modalidad, estados; helper de `updated_at` |
| `0002_tablas.sql` | Las 10 tablas de la sección "Base de datos" del plan |
| `0003_auth_y_helpers.sql` | Trigger `auth.users` → `usuarios`; helpers de RLS |
| `0004_rls.sql` | Políticas RLS por perfil (becario / ingeniero / administrador) |
| `0005_funciones.sql` | Horas, ventana SIASE, cierre de ventana, cierre de semestre |
| `0006_semillas.sql` | Ventana 26–30, metas globales, periodo inicial |
| `0007_hardening.sql` | Corrige lo que marcaron los advisors tras aplicar 0001–0006 (ver abajo) |
| `0008_hardening_grants_explicitos.sql` | Revoca EXECUTE que 0007 no alcanzó a quitar (ver abajo) |
| `0009_embedding_como_arreglo.sql` | `embedding_vector` de `bytea` a `real[]` |
| `0010_storage_siase.sql` | Bucket `siase` y sus políticas |
| `0011_ingenieros_ven_ingenieros.sql` | Un ingeniero puede ver a otros ingenieros (destino de transferencia) |
| `0012_zona_horaria_y_horas.sql` | Auditoría A-06/C-04: hora de Monterrey en semana/mes/ventana; horas solo se emparejan dentro del mismo día local |
| `0013_asistencias_integridad.sql` | Auditoría C-03/C-04/A-13: anti-duplicado (<1 min), insert solo con cuenta activa, corrección por el ingeniero asignado |
| `0014_siase_reportes.sql` | Auditoría A-01/A-02/A-03/A-04/M-04/M-16: trigger que impide auto-confirmarse, ruta de Storage en vez de URL firmada, estado efectivo sin pg_cron, firma/exclusión por RPC |
| `0015_operaciones_transaccionales.sql` | Auditoría C-05/C-06/A-05/A-10/A-13/M-10/M-11: RPC atómicas para transferencias, asignación, enrolamiento, configuración, cierre/apertura de periodo y bajas |
| `0016_consultas_agregadas.sql` | Auditoría M-05/M-09/A-16: progreso del equipo en una llamada, indicadores del panel, exportación paginada |

Se aplican **en orden**. (`0006` ya no incluye el bloque de `pg_cron` comentado que
trae el archivo en disco.) **0012–0016 se aplicaron al proyecto `rcvpowylehewvsxquhip`
el 2026-10-20** y se probaron con los usuarios fixture dentro de una transacción
revertida (no quedó ningún dato de prueba).

## Correcciones de la auditoría UX (0012–0016)

Ver `docs/auditoria-ux.md`, sección "Estado de corrección". Lo esencial para quien
toque el backend:

- **Zona horaria.** La base sigue en `TimeZone = UTC` (no se cambió a nivel base para
  no afectar otros timestamps). Las funciones de negocio convierten explícitamente con
  `hoy_local()` / `inicio_dia_local(fecha)` (`America/Monterrey`). La app usa la misma
  zona (`core/util/FechaUi.kt`), nunca `ZoneId.systemDefault()`.
- **Horas.** `horas_trabajadas` empareja entrada→salida solo si ambas caen el mismo día
  local. Una entrada sin salida ese día no suma (antes sumaba 24 h con la salida del día
  siguiente).
- **"Sin reporte" sin pg_cron.** `pg_cron` está *disponible* pero no instalado. Se
  decidió **no** depender de un job: `reportes_siase_mes(p_mes)` calcula el estado
  efectivo de cada becario activo (con o sin fila) — si no hay fila o está en
  `pendiente` y ya pasó el día de cierre de ese mes (hora local), es `sin_reporte`. Así
  funciona igual para becario, ingeniero y admin, y no hay un proceso que pueda dejar de
  correr. `cerrar_ventana_siase` se conserva (con hora local) por si algún día se quiere
  materializar el estado con `pg_cron`; no está concedida a ningún rol de la API.
- **`archivo_url` guarda la ruta** del objeto en el bucket (`<becario>/<mes>/<archivo>`),
  no una URL firmada. La app firma una URL de 10 min al abrir el archivo.
- **Trigger `reportes_siase_proteger`.** Quien no es ingeniero asignado ni admin solo
  puede crear/reemplazar su reporte del mes en curso, con la ventana abierta, mientras
  esté en `pendiente`/`subido`, sin tocar `firmado_por`/`fecha_firma`. Las llamadas sin
  usuario (service_role, jobs) pasan. Las políticas de Storage `siase_insert/update`
  impiden además sobrescribir el archivo de un mes ya revisado.
- **Trigger `asistencias_validar`.** Rechaza dos registros del mismo becario a menos de
  1 minuto (con `pg_advisory_xact_lock` por becario para el doble toque concurrente).
  Responde con `HINT = 'asistencia_duplicada'`, que la cola offline de la app interpreta
  como "ya se había subido".
- **Usuarios inactivos.** `usuario_activo()` nueva; `es_ingeniero_de()` ahora exige que
  el ingeniero esté activo; la política de insert de asistencias exige cuenta activa.
  La app además bloquea el login de cuentas no activas.
- **RPC transaccionales** (`SECURITY DEFINER`, validan el perfil adentro y responden en
  español con `raise exception`, código `P0001`, que la app muestra tal cual):
  `resolver_transferencia`, `asignar_ingeniero`, `enrolar_becario`, `tiene_enrolamiento`,
  `guardar_configuracion`, `vista_previa_cierre`, `cerrar_semestre` (nuevo parámetro
  opcional `p_periodo_actual` contra el doble cierre), `abrir_periodo`,
  `cambiar_estado_usuario`, `firmar_reportes_siase`. Auxiliares internas sin EXECUTE
  para la API: `_reasignar_becario`, `_cumplimiento_periodo`.
- **Consultas agregadas** (`SECURITY INVOKER`, respetan RLS): `progreso_equipo`,
  `indicadores_admin` (solo admin), `exportar_asistencias` (solo admin, paginada de 1000
  en 1000 porque PostgREST corta ahí), `reportes_siase_mes`.
- `ventana_siase` tiene ahora `check (dia_apertura <= dia_cierre)`.
- Se revocó `EXECUTE` a `anon` en `horas_trabajadas`, `progreso_horas` y
  `estado_ventana_siase` (lo tenían por el grant automático de Supabase).

**Advisors tras 0012–0016:** sin errores. Warnings esperados: las RPC nuevas aparecen en
`authenticated_security_definer_function_executable` (es a propósito: cada una valida
`es_admin()`/`es_ingeniero_de()` antes de hacer nada), más los dos que ya estaban
(`rls_auto_enable`, protección de contraseñas filtradas desactivada en Auth).
Performance: solo "índice sin usar" en tablas casi vacías.

**Pendiente de decidir (no se aplicó):** si al cerrar el semestre los becarios deben
pasar a `egresado`/"Finalizado" (M-11). `cerrar_semestre` hoy solo archiva el periodo.

**Edge function `admin-crear-usuario` v2 (desplegada 2026-10-20):** valida datos,
revisa matrícula repetida antes de crear, traduce los errores de GoTrue a español y
devuelve los errores de negocio con HTTP 200 + `{ "error": "..." }` para que la app
siempre pueda leer el mensaje.

## Qué corrigieron 0007 y 0008

Los advisors tras aplicar 0001–0006 marcaron:

- **`function_search_path_mutable`**: a `tocar_updated_at()` le faltaba `set search_path`.
- **Funciones `security definer` ejecutables por `anon` de más.** Causa real: Supabase
  concede `EXECUTE` a `anon`/`authenticated` **explícitamente por rol** al crear una
  función en `public` (no es un grant heredado de `PUBLIC`, así que `revoke ... from
  public` no lo quita — hay que revocar del rol directamente; se confirmó leyendo
  `pg_proc.proacl`). El caso que más importaba: `cerrar_ventana_siase` no tiene
  guardia de admin adentro (solo la debe llamar el cron), y antes de 0007/0008 `anon`
  podía invocarla vía `/rest/v1/rpc/cerrar_ventana_siase` y marcar reportes SIASE como
  "sin_reporte" sin autenticarse.
- **7 llaves foráneas sin índice** (`verificado_por`, `capturado_por`, `firmado_por`,
  `periodo_id`, `ingeniero_destino`, `ingeniero_origen`, `resuelta_por`).
- **13 políticas RLS que llamaban `auth.uid()` directo** en vez de `(select auth.uid())`,
  forzando a Postgres a reevaluarlo fila por fila en vez de una vez por consulta.
- **11 políticas permisivas duplicadas** — tablas con una política específica (SELECT/
  INSERT) y además una política `_admin FOR ALL` que repetía esa misma acción. Se
  dividieron en políticas por acción para que cada consulta evalúe solo una.

## Warnings que se dejaron a propósito

- `es_admin()`, `es_ingeniero_de()`, `perfil_actual()`, `cerrar_semestre()` siguen
  ejecutables por `authenticated`: es necesario para que las políticas RLS funcionen
  (evaluar una policy requiere que quien consulta tenga `EXECUTE` sobre las funciones
  que esa policy invoca), y `cerrar_semestre` ya se autoprotege con `es_admin()` adentro.
- `rls_auto_enable()` sigue ejecutable por `anon`/`authenticated`: **no se creó en estas
  migraciones** — ya existía en el proyecto (aparenta ser infraestructura interna de
  Supabase para auto-activar RLS en tablas nuevas). No se tocó por no ser parte del
  esquema del plan; si se quiere revisar, es un tema de la plantilla del proyecto, no
  de este roadmap.

## Decisiones tomadas que conviene revisar

- **Un ingeniero vigente por becario.** `ingenieros_becarios` tiene índice único
  parcial sobre `becario_id where activo`; el histórico se conserva con
  `activo = false`. Si un becario puede tener dos ingenieros a la vez, hay que quitarlo.
- **Ubicación como `latitud`/`longitud` numéricas**, no PostGIS, para no depender
  de una extensión extra. Si van a hacer geocercas, conviene cambiar a `geography`.
- **`horas_trabajadas` no es `security definer`**: corre bajo el RLS de quien llama,
  así que preguntar por un becario ajeno devuelve `0`, no un error.
- **Escalamiento de privilegios bloqueado**: el trigger `usuarios_proteger_campos`
  impide que alguien se cambie `perfil`, `estado` o `matricula` a sí mismo. Sin eso,
  la política `usuarios_update_propio` permitiría que un becario se hiciera admin.
- **El ingeniero no puede leer embeddings faciales**, solo insertarlos. La verificación
  corre en el dispositivo del becario, que lee el suyo.

## Diferido a Fase 3: cifrado del embedding facial

El plan pide que el embedding "se guarde cifrado en la base". Hoy estas migraciones
lo protegen **solo con RLS** (`enrolamientos_faciales.embedding_vector` es `bytea` en
claro). Se acordó (2026-09-17) dejarlo así por ahora y resolverlo **antes de cerrar la
Fase 3**, que es cuando el enrolamiento facial empieza a escribir vectores reales.
Hasta entonces la tabla no debe recibir datos biométricos de personas reales.

Cifrarlo de verdad exige elegir dónde vive la llave; las dos rutas sobre la mesa:

1. **Supabase Vault + `pgsodium`** — la llave vive en el proyecto. Protege contra un
   dump de la tabla, no contra alguien con acceso a la base.
2. **Cifrado en el dispositivo** — la app cifra antes de subir y el servidor nunca ve
   el vector en claro. Es lo más fuerte y encaja con que el embedding ya se calcula
   localmente, pero obliga a resolver cómo se comparte la llave entre el dispositivo
   del ingeniero que enrola y el del becario que verifica.

## Datos de prueba

El último punto de la Fase 2 ("poblar datos de prueba") **no está en estas migraciones**
a propósito: los usuarios tienen que nacer en `auth.users` para que el trigger cree su
fila en `usuarios`. Se crean por la API de Auth pasando el perfil en el metadata:

```json
{ "email": "...", "password": "...",
  "user_metadata": { "perfil": "ingeniero", "matricula": "1900123", "nombre": "..." } }
```
