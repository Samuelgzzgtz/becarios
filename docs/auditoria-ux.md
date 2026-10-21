# Auditoría UX / funcional — DocenCheck (Android)

Fecha: 2026-10-20 · Rol: QA senior / UX researcher (metodología `ui-ux-tester`, persona "usuario frustrado")

## Alcance y método

- **Qué se revisó:** las 87 fuentes Kotlin de `app/src/main/java/com/fime/docencheck`, `AndroidManifest.xml` (el fuente y el *merged manifest* de `app/build`), las 11 migraciones de `supabase/migrations`, la edge function `admin-crear-usuario`, y los documentos `plan-construccion-becarios.md`, `plan-frontend-docencheck.md`, `guia-frontend-docencheck.md`, `app/README.md` y `supabase/migrations/README.md`.
- **Backend real (solo lectura, vía MCP de Supabase, proyecto `rcvpowylehewvsxquhip`):** `TimeZone = UTC`; extensiones instaladas `plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault` (**no hay `pg_cron`**); las políticas RLS de `enrolamientos_faciales` y `reportes_siase` coinciden con la 0007; hay 6 usuarios (1 admin, 4 ingenieros, 1 becario), 0 asistencias, 0 enrolamientos y 0 reportes SIASE. No se aplicó ninguna migración ni se modificó ningún dato.
- **Sin dispositivo:** la auditoría se hizo leyendo el código y comparándolo con la documentación y el esquema. Cada hallazgo cita archivo:línea. Lo que depende de algo que no se pudo ejecutar va marcado **[especulativo]** o **[probable]**, con la razón.
- **Severidad:**
  - **Crítico:** pierde o corrompe datos, tumba la app en un flujo principal, o hace algo irreversible sin protección.
  - **Alto:** rompe una tarea documentada, deja al usuario sin salida, o es un riesgo de integridad o seguridad.
  - **Medio:** fricción importante, información engañosa, o una función documentada que falta.
  - **Bajo:** pulido visual, accesibilidad menor o consistencia.

Rutas abreviadas: `…/` = `app/src/main/java/com/fime/docencheck/`.

---

## Crítico

### C-01 · Las asistencias offline nunca se sincronizan y la app dice "Registrado"
- **Dónde:** `app/src/main/AndroidManifest.xml:23-27`, `…/DocenCheckApp.kt:59-62`, `…/data/repository/AsistenciaRepository.kt:45-57`, `…/worker/SincronizarAsistenciasWorker.kt:8-12`.
- **Escenario:** un becario registra su entrada sin red (o con un error 401/5xx). `registrar()` atrapa *cualquier* fallo, guarda el registro en Room y regresa `Result.success`, así que la pantalla muestra "Registrado: entrada". Después el worker tiene que subirlo. Pero el manifest elimina `androidx.work.impl.WorkManagerInitializer`, que es un nombre que ya no existe. En el *merged manifest* (`app/build/intermediates/merged_manifests/debug/.../AndroidManifest.xml:103-105`) sigue registrado `androidx.work.WorkManagerInitializer` dentro de `androidx.startup.InitializationProvider`. Se inspeccionó el bytecode de `work-runtime 2.11.2`: ese initializer llama `WorkManager.initialize(context, new Configuration.Builder().build())`, o sea, con la configuración por defecto, e ignora `DocenCheckWorkerFactory`. Entonces WorkManager crea `SincronizarAsistenciasWorker` por reflexión, el worker no tiene un constructor de 2 argumentos y falla en cada ejecución. Es justo el error que describe el comentario del manifest.
- **Impacto:** el becario cree que ya cumplió sus horas, pero en el servidor no existe ningún registro. Nadie se entera hasta el cierre del semestre.
- **Arreglo:**
  1. En el manifest, cambiar el nodo por:
     ```xml
     <provider android:name="androidx.startup.InitializationProvider" android:authorities="${applicationId}.androidx-startup" tools:node="merge">
       <meta-data android:name="androidx.work.WorkManagerInitializer" tools:node="remove"/>
     </provider>
     ```
  2. En `registrar()`, mandar a la cola solo los errores de red (`HttpRequestException`/`IOException`). Los rechazos 4xx deben mostrarse al usuario.
  3. Que el mensaje de éxito diga "Guardado en el teléfono; se subirá cuando haya conexión" cuando el registro quedó en cola.

### C-02 · Registrar asistencia sin red tumba la app
- **Dónde:** `…/ui/becario/asistencia/RegistrarAsistenciaViewModel.kt:69,75,101-102`.
- **Escenario:** el becario está en un aula sin señal y pulsa "Verificar y registrar". `enrolamientoRepository.propio()`, `siguienteTipo()` y `modalidadDeHoy()` hacen llamadas de red fuera de cualquier `runCatching`, dentro de `viewModelScope.launch`. La excepción no se atrapa y la app se cierra.
- **Impacto:** el plan promete que el registro "funcione aunque haya un corte de red momentáneo" (Room). Hoy pasa lo contrario: sin red, el flujo más usado truena.
- **Arreglo:**
  - Cachear en Room el embedding propio, el patrón semanal y el último tipo registrado al abrir la sesión.
  - Envolver `procesarFoto` en `try/catch`. Si falla la red, usar los datos cacheados; si no hay caché, mostrar "Sin conexión, intenta de nuevo".

### C-03 · Doble toque en "Verificar y registrar" crea dos registros
- **Dónde:** `…/ui/becario/asistencia/RegistrarAsistenciaScreen.kt:168-175`, `…/RegistrarAsistenciaViewModel.kt:65-67,101-104`.
- **Escenario:** el becario pulsa dos veces porque la foto tarda. Cada toque lanza su propia `tomarFotoComoBitmap` y el botón sigue habilitado hasta que `procesarFoto` cambia el estado a `Procesando`, ya con la foto tomada. Las dos corrutinas calculan `siguienteTipo()` antes de que cualquiera inserte, así que se graban **dos entradas**. Si el segundo toque llega después del primer insert, se graba entrada y salida con segundos de diferencia y el turno queda cerrado en 0 h.
- **Impacto:** horas corruptas, y el becario no tiene manera de corregirlas (ver C-04).
- **Arreglo:**
  - Poner el estado en `Procesando` (y deshabilitar el botón) **antes** de capturar la foto. Ignorar toques mientras haya una captura en curso.
  - En el ViewModel, proteger con un `Mutex` o una bandera `enCurso`.
  - En el backend, rechazar dos registros del mismo tipo en menos de N minutos (trigger o índice).

### C-04 · Olvidar la salida un día convierte el día siguiente en una jornada de 24+ horas
- **Dónde:** `…/data/repository/AsistenciaRepository.kt:106-120`, `supabase/migrations/0005_funciones.sql:21-37`, `…/data/model/Asistencia.kt:15-37`, `…/ui/theme/Componentes.kt:198-203` (`SegmentadoInformativo` es de solo lectura).
- **Escenario:** el lunes el becario registra entrada y olvida la salida. El martes en la mañana la app decide sola que toca **"Salida"**: alterna con el último registro global, sin ver el día. El becario no puede elegir "Entrada" porque el control es informativo. Al registrar, `horas_trabajadas` empareja la entrada del lunes 9:00 con la "salida" del martes 9:00 y suma **24 h**. `horasPorDia` hace lo mismo del lado del cliente.
- **Impacto:** la meta semanal queda inflada (o el becario, confundido, registra dos veces para "acomodarlo"). Ni el becario, ni el ingeniero, ni el admin pueden corregir una asistencia desde la app (no hay UPDATE/DELETE en ninguna pantalla).
- **Arreglo:**
  - Decidir el tipo con base en el **día local**: si la última entrada abierta es de un día anterior, el siguiente registro es "Entrada" y la anterior queda "sin salida".
  - En `horas_trabajadas`, emparejar solo dentro del mismo día local, o poner un tope (p. ej. 12 h).
  - Agregar una corrección manual para el ingeniero o el admin (RLS `asistencias_update_admin` ya la permite para el admin).

### C-05 · "Cerrar periodo y abrir el siguiente" es irreversible y no pide confirmación
- **Dónde:** `…/ui/admin/semestres/GestionSemestresScreen.kt:94-100`, `…/GestionSemestresViewModel.kt:46-58`, `…/data/repository/AdminRepository.kt:159-169`.
- **Escenario:** el admin llena el formulario para *probar* y pulsa el botón verde (igual a cualquier otro botón primario). El periodo activo se desactiva al instante y se crea el nuevo. No hay diálogo, no hay botón rojo/naranja (el plan lo pide "destacado como acción crítica") y no se puede deshacer. El RPC regresa `becarios_cumplidos`, pero el resultado se tira y la pantalla simplemente se cierra (`LaunchedEffect(cerrado) { onVolver() }`).
- **Impacto:** todas las horas del semestre quedan fuera del rango de `progreso_horas`, cuyo semestre se calcula sobre el periodo activo. Los becarios ven 0 h de un momento a otro.
- **Arreglo:**
  - Mostrar un `AlertDialog` con un resumen ("Se cerrará *Agosto-Diciembre 2026* con N becarios; X cumplieron. Esta acción no se puede deshacer") y pedir que escriban el nombre del periodo para confirmar.
  - Usar un botón de estilo destructivo.
  - Mostrar el resultado del RPC antes de salir de la pantalla.

### C-06 · Aprobar o rechazar transferencias a ciegas, sin confirmación y con carreras
- **Dónde:** `…/ui/admin/transferencias/TransferenciasAdminScreen.kt:54-63`, `…/TransferenciasAdminViewModel.kt:39-44`, `…/data/repository/AdminRepository.kt:91-116`.
- **Escenario:**
  1. La tarjeta solo muestra `transferencia.motivo`. El admin no ve qué becario es, de qué ingeniero sale ni a cuál va.
  2. "Aprobar" y "Rechazar" siguen activos mientras corre la petición. Si pulsa Aprobar y luego Rechazar, la segunda escritura deja `estado = 'rechazada'`, pero el becario **ya fue reasignado** por la primera.
  3. `resolverTransferencia` no es atómica: primero marca "aprobada" y luego llama a `asignarBecario`, que a su vez desactiva y después inserta. Si falla a la mitad, la transferencia queda aprobada y el becario sin ingeniero, o con el anterior.
  4. Los errores se tragan (`.onSuccess { cargar() }`, sin `onFailure`). Si `adminId` es null, el botón no hace nada.
- **Impacto:** reasignaciones equivocadas o fantasma, y el admin no recibe ninguna señal.
- **Arreglo:**
  - En la tarjeta: becario (nombre y matrícula), "De: Ing. X → A: Ing. Y", fecha y badge de estado.
  - Diálogo de confirmación. Deshabilitar los dos botones de esa tarjeta mientras se procesa.
  - Mover aprobar, reasignar y marcar a un **RPC `security definer` transaccional** (`resolver_transferencia(id, aprobar)`).
  - Mostrar el error en un Snackbar.

---

## Alto

### A-01 · El becario puede "auto-confirmarse" el reporte SIASE, y re-subir borra la firma
- **Dónde:** RLS `reportes_update` (`0007_hardening.sql:285-296`, verificada en vivo), `…/data/repository/SiaseRepository.kt:61-69`, `…/ui/becario/siase/ReporteSiaseScreen.kt:70-73`.
- **Escenario:**
  1. La política deja que el becario actualice **cualquier columna** de su fila. Con la llave pública y su JWT puede mandar `estado='confirmado'` sin que nadie lo firme.
  2. Sin malicia: si el becario vuelve a subir el archivo después de que su ingeniero lo confirmó (el botón sigue habilitado mientras la ventana esté abierta), el `update` pone `estado='subido'` y la confirmación se pierde sin aviso.
- **Arreglo:**
  - Trigger `before update` en `reportes_siase` que, si quien llama no es ingeniero ni admin, solo permita pasar de `pendiente|subido` a `subido` y cambiar `archivo_url`. Que bloquee `firmado_por`, `fecha_firma` y `confirmado`.
  - En la UI, deshabilitar "Subir" cuando el estado sea `confirmado`, `excluido` o `sin_reporte`, y explicar el motivo.

### A-02 · El archivo SIASE deja de verse a las 24 h, y nadie lo ve antes de firmar
- **Dónde:** `…/data/repository/SiaseRepository.kt:47-48` (`createSignedUrl(..., 24.hours)` guardado en `archivo_url`), `…/ui/ingeniero/siase/ReportesSiaseEquipoScreen.kt:57-70`, `…/ui/admin/reportes/ReportesSiaseLoteScreen.kt:53-65`.
- **Escenario:** el becario sube el día 26 y el ingeniero revisa el 28. La URL firmada ya expiró. Además, ninguna pantalla de ingeniero ni de admin ofrece "Ver archivo": el ingeniero pulsa "Aprobar y firmar" sin haber visto la evidencia.
- **Arreglo:**
  - Guardar la **ruta** del objeto (`<becario>/<mes>/<archivo>`), no la URL.
  - Generar la URL firmada al momento de abrir el archivo.
  - Agregar un botón "Ver reporte" (Intent `ACTION_VIEW`) en la tarjeta del ingeniero y en la del admin.

### A-03 · Los reportes SIASE desaparecen de la vista de firma al cambiar de mes
- **Dónde:** `…/ui/ingeniero/siase/ReportesSiaseEquipoViewModel.kt:28`, `…/ui/admin/reportes/ReportesSiaseLoteViewModel.kt:30`, `…/data/repository/AdminRepository.kt:55`.
- **Escenario:** la ventana va del 26 al 30. Un becario sube el 30 por la noche; el ingeniero entra el día 1 y su lista muestra el mes nuevo, sin reportes. El reporte de octubre ya no aparece en ninguna pantalla, así que nunca se firma.
- **Arreglo:** agregar un selector de mes (el plan pide "selector de mes" en Firmas). Por defecto mostrar el mes más reciente con reportes en `subido`, o incluir siempre los `subido` de meses anteriores en una sección "Pendientes de meses anteriores".

### A-04 · El cierre automático de la ventana SIASE no existe en el proyecto
- **Dónde:** `supabase/migrations/0006_semillas.sql:24-30` (cron comentado); verificado en vivo que la extensión `pg_cron` no está instalada (`relation "cron.job" does not exist`).
- **Escenario:** cuando cierra la ventana, nadie queda marcado como `sin_reporte`. Las filas solo existen si el becario sube algo. Resultado:
  - el indicador "Reportes SIASE pendientes" del panel cuenta solo filas existentes y marca **0** aunque nadie haya subido (`AdminRepository.kt:57-59`);
  - el ingeniero ve el texto "sin_reporte" inventado en el cliente (`ReportesSiaseEquipoScreen.kt:60`), pero en la base no hay nada.
- **Arreglo:** habilitar `pg_cron` y programar `cerrar_ventana_siase`, o calcular el estado efectivo en un RPC que una a todos los becarios activos con `reportes_siase`. Que los indicadores cuenten "becarios activos sin fila o con fila `pendiente`".

### A-05 · Re-enrolar a un becario falla para el ingeniero (RLS)
- **Dónde:** `…/data/repository/EnrolamientoRepository.kt:34-51`; políticas reales `enrolamientos_update_ingeniero` y `enrolamientos_select_propio`.
- **Escenario:** el ingeniero enrola por segunda vez (cambió de lentes, la primera foto salió mal). El `UPDATE ... SET activo=false WHERE becario_id=… AND activo` necesita **leer** las filas. En Postgres, un UPDATE con WHERE también aplica las políticas SELECT, y el ingeniero no puede hacer SELECT de enrolamientos (solo el propio becario o el admin). El update toca 0 filas sin error y el insert choca con `enrolamientos_faciales_becario_activo_idx`, devolviendo el mensaje crudo "duplicate key value…".
- **Estado:** **[probable]**. Se verificaron las políticas reales y la semántica documentada de RLS en Postgres, pero no se ejecutó la operación. Hoy hay 0 enrolamientos, así que nadie lo ha encontrado todavía.
- **Arreglo:** RPC `security definer` `enrolar_becario(p_becario, p_embedding, …)` que verifique `es_ingeniero_de` o `es_admin`, y que desactive e inserte en una sola transacción. Así también se resuelve que la operación actual no es atómica.

### A-06 · Las fronteras de día, semana y mes se calculan en UTC, no en hora de Monterrey
- **Dónde:** BD con `TimeZone = UTC` (verificado). `0005_funciones.sql:73-74` (`date_trunc('week'|'month', now())`) y `:89` (`current_date`). En el cliente: `…/ui/admin/exportar/ExportarViewModel.kt:13-14` + `AdminRepository.kt:176-177` (las fechas `aaaa-mm-dd` se mandan tal cual, así que se interpretan como medianoche UTC), y `…/ui/becario/consulta/ConsultaAsistenciasScreen.kt:68` (muestra `ocurrido_en` crudo en UTC).
- **Escenario:**
  - Lo trabajado el domingo de 18:00 a 24:00 (hora local, UTC-6) cuenta para la semana **siguiente**. Lo mismo pasa con el último día del mes.
  - El día 30 a las 18:01 hora local, `estado_ventana_siase` ya cree que es día 1 y la ventana se cierra 6 horas antes.
  - En Consulta, una entrada a las 9:00 se muestra como "2026-10-20T15:00:00+00:00".
- **Arreglo:**
  - En SQL: `date_trunc('week', now() at time zone 'America/Monterrey') at time zone 'America/Monterrey'` y `(now() at time zone 'America/Monterrey')::date`, o `alter database ... set timezone`.
  - En el cliente: convertir siempre con `ZoneId.of("America/Monterrey")` y formatear ("Lun 20 oct · 9:00").

### A-07 · Los datos no se refrescan al volver de una acción
- **Dónde:** `…/ui/becario/home/HomeViewModel.kt:39-41`, `…/ui/ingeniero/dashboard/DashboardViewModel.kt:32-34`, `…/ui/ingeniero/becarios/MisBecariosViewModel.kt:24-26`, `…/ui/admin/panel/PanelGeneralViewModel.kt:18-20`. Solo `IngenierosScreen` y `BecariosScreen` usan `RecargarAlReanudar`.
- **Escenario:**
  - El becario registra su entrada y pulsa "Volver". Home sigue diciendo "Sin registrar entrada", con las mismas horas y el mismo contador de pendientes.
  - El admin aprueba transferencias y regresa al panel: el contador "Transferencias pendientes" no cambia.
- **Arreglo:** llamar `RecargarAlReanudar(viewModel::cargar)` en Home, Dashboard, Mis Becarios y Panel general. Los `cargar()` ya existen y son públicos.

### A-08 · Acciones que fallan sin decir nada
- **Dónde:**
  - `…/ui/ingeniero/modalidad/ConfigurarModalidadViewModel.kt:48-50` (sin `onFailure`)
  - `…/ui/admin/usuarios/AsignarIngenieroViewModel.kt:42`
  - `…/ui/ingeniero/siase/ReportesSiaseEquipoViewModel.kt:57`
  - `…/ui/admin/reportes/ReportesSiaseLoteViewModel.kt:72-73` (se ignora el `Result`)
  - `…/ui/admin/transferencias/TransferenciasAdminViewModel.kt:42`
  - `HomeViewModel.kt:59-64` (la tarjeta "Hoy" simplemente no aparece)
  - `RegistrarAsistenciaViewModel.kt:52-57`
- **Escenario:** el ingeniero cambia el lunes a Home Office sin red. El spinner aparece y desaparece y el chip regresa a "Presencial". El usuario no sabe si se guardó. Con "Firmar seleccionados" la lista simplemente se recarga, haya funcionado o no.
- **Arreglo:** en todas las acciones, `onFailure { mostrar Snackbar(mensajeAmigable(it)) }`, con un `SnackbarHostState` en `PantallaConEncabezado`.

### A-09 · Formularios y listas que no se desplazan, y el teclado tapa los botones
- **Dónde:** el proyecto no tiene ningún `verticalScroll` ni `imePadding` (búsqueda en todo `…/`). Columnas fijas en:
  - `ui/login/LoginScreen.kt:55-58`
  - `ui/ingeniero/transferencia/SolicitarTransferenciaScreen.kt:58-95`
  - `ui/admin/usuarios/AsignarIngenieroScreen.kt:49-57`
  - `ui/admin/usuarios/CrearUsuarioScreen.kt:40`
  - `ui/admin/semestres/GestionSemestresScreen.kt:50`
  - `ui/admin/configuracion/ConfiguracionScreen.kt:46`
  - `ui/admin/exportar/ExportarScreen.kt:54`
- **Escenario:**
  - En Solicitar transferencia, cada ingeniero es un botón de ancho completo. Con 12 ingenieros, el campo "Motivo" y "Enviar solicitud" quedan **fuera de la pantalla** y no se puede llegar a ellos.
  - En Asignar ingeniero, los últimos ingenieros no se pueden tocar.
  - Con `targetSdk 36` (edge-to-edge obligatorio) el teclado se dibuja encima del contenido: en Login tapa "Iniciar sesión" y en Configuración tapa "Guardar".
- **Arreglo:**
  - `Column(Modifier.verticalScroll(rememberScrollState()).imePadding())` en todos los formularios.
  - Las listas de ingenieros como `LazyColumn` o `ExposedDropdownMenuBox` (el plan pide dropdowns).
  - `ImeAction.Next/Done` en los campos.

### A-10 · "Asignar ingeniero" reasigna con un solo toque y puede dejar al becario sin ingeniero
- **Dónde:** `…/ui/admin/usuarios/AsignarIngenieroScreen.kt:50-56`, `…/data/repository/AdminRepository.kt:91-100`.
- **Escenario:** el admin entra solo para *ver* quién tiene asignado a un becario. La pantalla no lo dice, y tocar cualquier nombre reasigna de inmediato, sin confirmación. Si el insert falla después de que el update desactivó la asignación vigente, el becario queda sin ingeniero y no aparece ningún mensaje (A-08).
- **Arreglo:**
  - Mostrar "Asignado actualmente: Ing. X" y marcar esa opción.
  - Seleccionar el ingeniero, confirmar con un botón y pedir confirmación si ya había uno asignado.
  - Hacer la operación en un RPC transaccional.

### A-11 · Excepciones no atrapadas que cierran la app
- **Dónde:**
  - `…/ui/login/LoginViewModel.kt:25-31` (`sesionActiva()` hace red dentro de `init`)
  - `…/ui/becario/cuenta/MiCuentaViewModel.kt:45-49` (`signOut()` sin red)
  - `…/ui/becario/asistencia/RegistrarAsistenciaScreen.kt:171-173` y `…/ui/ingeniero/enrolamiento/EnrolamientoFacialScreen.kt:148-151` (`tomarFotoComoBitmap` lanza `ImageCaptureException` si la cámara no está lista)
  - `…/ui/becario/siase/ReporteSiaseScreen.kt:41` (`openInputStream` y `readBytes` en el hilo principal, sin `try`)
  - `…/facial/FaceMatcher.kt:16` (`require` si cambia la dimensión del modelo)
  - Además, todos los ViewModels llaman `sessionManager.usuarioAutenticado()` fuera de `runCatching`. Tras la muerte del proceso esa llamada vuelve a ir a la red.
- **Escenario:** el usuario abre la app en el metro con la sesión guardada y la app se cierra. O pulsa "Cerrar sesión" sin red y la app se cierra.
- **Arreglo:** `CoroutineExceptionHandler` o `runCatching` en cada `launch`. Mover la lectura del archivo a `Dispatchers.IO`. En `cerrarSesion`, limpiar la sesión local aunque falle la llamada remota (`signOut(SignOutScope.LOCAL)` como respaldo).

### A-12 · Sin salida para cerrar sesión, y la cola offline pasa de un usuario a otro
- **Dónde:** `…/ui/becario/cuenta/MiCuentaScreen.kt:41,53`, `…/data/repository/AuthRepository.kt:25-28`, `…/data/repository/AsistenciaRepository.kt:61-75`.
- **Escenario:**
  1. Si la cuenta no carga, Mi Cuenta solo muestra el error y **no aparece el botón "Cerrar sesión"**, que no existe en ninguna otra pantalla. El usuario no puede salir.
  2. Un becario cierra sesión con registros en cola y otro inicia sesión en el mismo teléfono (un teléfono compartido en el laboratorio). El worker intenta subir los registros del primero con la sesión del segundo, RLS los rechaza, y como el `forEach` se detiene en la primera excepción, **toda la cola queda bloqueada para siempre**.
- **Arreglo:**
  - Mostrar "Cerrar sesión" en cualquier estado, también en el header o en un menú.
  - Al cerrar sesión, sincronizar o advertir antes de borrar los pendientes ("Tienes 2 registros sin subir").
  - En el worker, procesar cada registro por separado, contar `intentos` (el campo ya existe y nunca se usa) y mandar a "errores" los rechazos permanentes.

### A-13 · Un usuario dado de baja sigue entrando y registrando, y no hay manera de darlo de baja
- **Dónde:** `…/data/repository/AuthRepository.kt:14-21` (no revisa `estado`), `…/ui/admin/usuarios/BecariosScreen.kt:57-69`, `…/ui/admin/usuarios/IngenierosScreen.kt:56-63`. RLS `asistencias_insert` no revisa el estado.
- **Escenario:** el plan pide Editar, Eliminar, Dar de baja y filtros por Semestre/Ingeniero/Estado para becarios, e Editar/Eliminar para ingenieros. Nada de eso existe: las tarjetas solo traen "Asignar ingeniero". Y aunque se cambie `estado='inactivo'` a mano en la base, ese becario puede iniciar sesión y registrar asistencia.
- **Arreglo:**
  - Acciones Editar, Dar de baja (con confirmación) y Reactivar.
  - Bloquear el login si `estado != activo` ("Tu cuenta está inactiva; contacta a la coordinación").
  - Agregar `and (select estado from usuarios where id=auth.uid())='activo'` a la política de insert de asistencias.

### A-14 · Consulta de asistencias: el filtro no tiene UI y los datos salen crudos
- **Dónde:** `…/ui/becario/consulta/ConsultaAsistenciasViewModel.kt:40-59` (`filtrarPorRango` y `limpiarFiltro` nunca se llaman), `…/ConsultaAsistenciasScreen.kt:64-71`.
- **Escenario:** el becario quiere ver la semana pasada y no hay selector de fechas ni botón "Filtrar" (el plan los pide). Cada tarjeta dice "entrada · home_office" y "2026-10-20T15:03:12.123+00:00". Tampoco aparecen los registros que siguen en cola local, aunque Home los cuente.
- **Arreglo:**
  - `DateRangePicker` + "Filtrar" conectado a `filtrarPorRango`.
  - En cada tarjeta: "Lun 20 oct", "9:03", ícono + "Home office" y badge Entrada (verde) o Salida (ámbar), con `BadgeEstado`.
  - Incluir los pendientes con la etiqueta "Sin subir".

### A-15 · "Mi reporte de horas" calcula datos que nunca muestra
- **Dónde:** `…/ui/becario/reportehoras/ReporteHorasViewModel.kt:29-56` vs `…/ReporteHorasScreen.kt:39-46`.
- **Escenario:** el ViewModel calcula horas por día de los últimos 7 días y la modalidad por día, pero la pantalla solo repite las tres barras que ya están en Home. Faltan:
  - el segmentado Semana/Mes/Semestre;
  - la cuadrícula L–D;
  - la tarjeta "Meta semanal".
  
  Además, "los últimos 7 días" no es la semana L–D que pide el plan.
- **Arreglo:** usar `SegmentadoControl` (existe sin uso) y una cuadrícula de 7 columnas con lunes a domingo de la semana local, horas e ícono de modalidad (`modalidadPorDiaSemana`, 0 = domingo).

### A-16 · El CSV exportado sale roto o incompleto
- **Dónde:** `…/data/repository/AdminRepository.kt:173-192`, `…/ui/admin/exportar/ExportarScreen.kt:40-41`.
- **Escenario:**
  - Los nombres con coma ("Garza, Ana") recorren las columnas: no se escapa ni se entrecomilla nada.
  - `writeText` escribe UTF-8 sin BOM, así que Excel en Windows muestra "PÃ©rez".
  - Las asistencias de becarios inactivos salen con el UUID en la columna "matricula", porque `listarPorPerfil` filtra por `activo`.
  - Las fechas salen en UTC.
  - **[probable]** PostgREST en Supabase limita la respuesta a 1000 filas por defecto, así que un mes con más de 1000 registros se exporta truncado sin aviso.
- **Arreglo:**
  - Escapar campos según RFC 4180 y escribir el BOM `﻿`.
  - Unir con `usuarios` sin filtrar por estado.
  - Convertir las fechas a hora local.
  - Paginar con `range()` o generar el archivo en un RPC o edge function.
  - Mostrar el conteo exportado ("1,284 registros").

### A-17 · Si se niega el permiso de cámara, no hay salida
- **Dónde:** `…/ui/becario/asistencia/RegistrarAsistenciaScreen.kt:139-144`, `…/ui/ingeniero/enrolamiento/EnrolamientoFacialScreen.kt:112-114`.
- **Escenario:** el becario niega el permiso por reflejo. Solo aparece un texto, sin botón para volver a pedirlo ni para abrir Ajustes. Si eligió "No volver a preguntar", ni reabrir la pantalla lo pide otra vez. Para el becario la tarea queda bloqueada.
- **Arreglo:** botón "Conceder permiso", que vuelva a lanzar el launcher si `shouldShowRequestPermissionRationale`, o si no, que abra `Settings.ACTION_APPLICATION_DETAILS_SETTINGS`. Agregar una explicación breve de por qué se usa la cámara y de que no se guardan fotos.

---

## Medio

### M-01 · Mensajes técnicos crudos, muchas veces en inglés
- **Dónde:** cada `it.message` que llega a la UI. Por ejemplo `…/ui/login/LoginViewModel.kt:57`, `…/ui/admin/usuarios/CrearUsuarioViewModel.kt:55`, `…/ui/admin/semestres/GestionSemestresViewModel.kt:56`, `…/ui/ingeniero/transferencia/SolicitarTransferenciaViewModel.kt:72`, `supabase/functions/admin-crear-usuario/index.ts:73-77`.
- **Escenario:** el usuario ve cosas como:
  - "Invalid login credentials"
  - "duplicate key value violates unique constraint "transferencias_pendiente_idx"" (al pedir una segunda transferencia)
  - "invalid input value for enum tipo_periodo: "ad""
  - "A user with this email address has already been registered"
  - "Database error creating new user" (matrícula duplicada: falla el trigger)
- **Arreglo:** una función `mensajeAmigable(Throwable)` que traduzca por código (`23505`, `22P02`, `23514`, `invalid_credentials`, timeouts, sin red). En la edge function, validar de antemano que la matrícula y el correo no existan y devolver mensajes en español.

### M-02 · Ningún estado de error ofrece "Reintentar"
- **Dónde:** todas las ramas `is UiState.Error -> Text(...)`, por ejemplo `HomeScreen.kt:123`, `DashboardScreen.kt:48-52`, `MisBecariosScreen.kt:48-52`, `PanelGeneralScreen.kt:58` y otras.
- **Escenario:** falló la red un segundo y la única salida es volver atrás y entrar de nuevo. En Home, que es la raíz, ni eso: hay que matar la app.
- **Arreglo:** un componente `EstadoError(mensaje, onReintentar)` reutilizable, más *pull-to-refresh* en las listas.

### M-03 · Valores de enum crudos en pantalla
- **Dónde:** `ReporteSiaseScreen.kt:64` ("Estatus de tu reporte: sin_reporte"), `MiCuentaScreen.kt:47` ("Perfil: becario"), `RegistrarAsistenciaScreen.kt:149` ("Registrado: entrada"), `ConsultaAsistenciasScreen.kt:66`, `ConsultaBecarioScreen.kt:66`, `ReportesSiaseEquipoScreen.kt:60`, `ReportesSiaseLoteScreen.kt:64`.
- **Escenario y por qué importa:** la guía pide que los estados aparezcan "siempre con el color de badge correspondiente, nunca con texto plano". Hoy salen minúsculas, guiones bajos y texto sin color.
- **Arreglo:** funciones `etiqueta()` y `aEstadoTema()` por enum (como ya hace `TransferenciasScreen.kt:67-77`) y mostrar el estado con `BadgeEstado`.

### M-04 · El mismo reporte SIASE aparece con estados distintos según el perfil
- **Dónde:** `ReporteSiaseScreen.kt:64` (si no hay fila, "pendiente") vs `ReportesSiaseEquipoScreen.kt:60` y `ReportesSiaseLoteScreen.kt:64` (si no hay fila, "sin_reporte").
- **Escenario:** el día 27 el becario ve "pendiente" y su ingeniero ve "sin_reporte". El ingeniero cree que ya se venció.
- **Arreglo:** una sola regla (depende de A-04). Sin fila y ventana abierta: "Pendiente". Sin fila y ventana cerrada: "Sin reporte".

### M-05 · Los indicadores del panel de administración engañan
- **Dónde:** `…/data/repository/AdminRepository.kt:52-66`, `…/ui/admin/panel/PanelGeneralScreen.kt:61-81`.
- **Escenario:** "Reportes SIASE pendientes" no cuenta a los becarios sin fila (ver A-04) ni los `subido` que esperan firma, que son lo que el admin necesita atender. Falta el indicador "Sin asignar" del plan y la tarjeta "Periodo actual / ventana SIASE".
- **Arreglo:** dos indicadores separados, "Por firmar" (`subido`) y "Sin entregar". Agregar "Sin asignar" (becarios activos sin fila activa en `ingenieros_becarios`) y la tarjeta del periodo.

### M-06 · Transferencias del ingeniero sin contexto
- **Dónde:** `…/ui/ingeniero/transferencia/TransferenciasScreen.kt:80-86`, `…/SolicitarTransferenciaScreen.kt:45,59-75`, `…/data/repository/EquipoRepository.kt:55-63`.
- **Escenario:**
  - La lista "Transferencias" solo muestra el motivo y el badge: no se sabe de qué becario es, a dónde va ni cuándo se pidió.
  - "Solicitar transferencia" no dice a qué becario se está transfiriendo.
  - La lista de destino incluye ingenieros inactivos (no se filtra por `estado`).
  - Si el becario ya tiene una solicitud pendiente, sale el error crudo de M-01 en lugar de un aviso antes de empezar.
- **Arreglo:**
  - Mostrar el nombre del becario en el header.
  - Filtrar `estado = activo`.
  - Al cargar, revisar si hay una solicitud pendiente y mostrar "Ya hay una solicitud pendiente desde dd/mm" con el formulario deshabilitado.
  - Tarjetas con becario, destino y fecha.

### M-07 · Configurar modalidad muestra como guardados días que no lo están
- **Dónde:** `…/ui/ingeniero/modalidad/ConfigurarModalidadScreen.kt:55`, `…/ConfigurarModalidadViewModel.kt:44-51`, `…/data/repository/HorarioRepository.kt:32`.
- **Escenario:**
  - Un día sin fila aparece con "Presencial" *seleccionado*, como si estuviera configurado. Sábado y domingo salen "Presencial" y no hay opción "No aplica" (el plan la pide), así que el becario puede registrar un domingo presencial.
  - **Carrera:** el ingeniero toca rápido Lunes→HO y luego Martes→HO. Cada corrutina parte del mapa `actual` que capturó al tocar, así que la segunda sobreescribe la primera en la UI: el lunes se ve Presencial aunque en la base quedó HO.
  - No hay botón "Guardar patrón semanal". Se guarda automáticamente sin avisar.
- **Arreglo:**
  - Estado "Sin configurar" visible y una tercera opción "No aplica" (borrar la fila con la política `horarios_delete`).
  - Actualizar con `_estado.update { }` dentro del `onSuccess`, en lugar de usar un snapshot.
  - Confirmar con un Snackbar "Lunes: Home office guardado".

### M-08 · Enrolamiento: contador confuso y sin identificar al becario
- **Dónde:** `…/ui/ingeniero/enrolamiento/EnrolamientoFacialViewModel.kt:71-73,58-65`, `…/EnrolamientoFacialScreen.kt:85,140-155`.
- **Escenario:**
  - Si falla el guardado con 5 capturas, "Intentar de nuevo" muestra **"Foto 6 de 5"** y obliga a tomar otra foto. No hay "reintentar guardado".
  - El header no dice a quién se está enrolando.
  - No avisa que se va a reemplazar una biometría existente.
  - El doble toque en "Capturar" agrega dos *embeddings* casi idénticos.
  - Faltan los puntos indicadores 1–5 que pide el plan.
- **Arreglo:**
  - Separar "reintentar guardado" de "reintentar foto".
  - Subtítulo con el nombre del becario.
  - Diálogo "Este becario ya tiene biometría; se reemplazará".
  - Deshabilitar "Capturar" mientras se procesa.
  - Indicador de puntos 1–5.

### M-09 · Dashboard del ingeniero con números poco confiables
- **Dónde:** `…/ui/ingeniero/dashboard/DashboardViewModel.kt:49-60`, `…/data/repository/EquipoRepository.kt:19-37`.
- **Escenario:**
  - "En riesgo" espera `día ISO / 7` de la meta semanal. El lunes a las 8:00 ya pide 1/7 de las horas, así que marca **a todos** en riesgo. El fin de semana cuenta como día laboral.
  - "Becarios activos" cuenta a los asignados aunque estén inactivos.
  - Hace un RPC secuencial por becario (N+1), lo que es lento con equipos grandes. Lo mismo pasa en Mis Becarios y en el Reporte de horas global.
  - Faltan "Asistencias hoy", "Ventana reporte mensual" y "Actividad reciente" del plan.
- **Arreglo:**
  - Calcular sobre los días laborales configurados en `horarios_modalidad` y hasta el día anterior.
  - Filtrar por `estado = activo`.
  - Un RPC `progreso_equipo(ingeniero)` que regrese todo en una sola llamada.

### M-10 · Configuración acepta valores sin sentido y guarda a medias
- **Dónde:** `…/ui/admin/configuracion/ConfiguracionViewModel.kt:50-74`, `…/ConfiguracionScreen.kt:91-93`.
- **Escenario:**
  - Con apertura 30 y cierre 26, la ventana **nunca** abre (`p_fecha between 30 and 26`) y no aparece ningún aviso.
  - Con día 0 o 32, o una meta negativa, sale el error crudo del CHECK.
  - Metas y ventana se guardan con dos updates separados: si falla el segundo, el primero ya quedó guardado y la pantalla dice error.
  - "Guardado" y los errores se ven con el mismo estilo.
  - "20,5" se rechaza (el separador decimal es punto).
  - Falta la tarjeta "Plantillas de periodo" del plan.
- **Arreglo:**
  - Validar 1 ≤ apertura ≤ cierre ≤ 31 y metas ≥ 0 en el cliente.
  - Un RPC `guardar_configuracion` atómico.
  - Mensaje verde para éxito y rojo para error, por campo.
  - Aceptar coma decimal.

### M-11 · Gestión de semestres incompleta y propensa a errores
- **Dónde:** `…/ui/admin/semestres/GestionSemestresScreen.kt:51-88`, `supabase/migrations/0005_funciones.sql:169-221`.
- **Escenario:**
  - "Tipo (AD o EJ)" es texto libre y "ad" falla con el error crudo del enum. Las fechas son texto libre sin selector.
  - Si no hay periodo activo ("Periodo activo: ninguno"), el RPC lanza `No hay periodo academico activo` y **no hay manera de crear el primer periodo** desde la app.
  - No muestra fechas ni días restantes del periodo actual, ni la lista Cumplió/No cumplió del plan.
  - El RPC no pasa a los becarios a "Finalizado", aunque el plan dice que se archivan así.
- **Arreglo:**
  - Segmentado AD/EJ y `DatePicker` para las fechas.
  - RPC `abrir_periodo` para cuando no hay periodo activo.
  - Vista previa de cumplimiento antes de cerrar.
  - Decidir y aplicar el cambio de estado de los becarios en el RPC.

### M-12 · Reporte SIASE del becario incompleto y visualmente distinto al resto
- **Dónde:** `…/ui/becario/siase/ReporteSiaseScreen.kt:39-81`, `…/ReporteSiaseViewModel.kt:55`.
- **Escenario:**
  - Usa el `TopAppBar` genérico de Material con "←" en lugar del header verde (`EncabezadoApp`): es la única pantalla así.
  - El historial se carga pero no se muestra. Tampoco hay stepper (`StepperEtapas` existe sin uso), dropzone ni periodo/mes visible.
  - Al elegir un archivo no se confirma cuál fue. `uri.lastPathSegment` puede dar un nombre como "msf:1234".
  - No hay límite de tamaño y el archivo se lee completo en memoria, en el hilo principal.
- **Arreglo:**
  - `PantallaConEncabezado`, tarjeta "Periodo: Octubre 2026" con badge, stepper, lista de historial con badges.
  - Obtener el nombre real con `OpenableColumns.DISPLAY_NAME`.
  - Limitar a unos 10 MB y leer en `Dispatchers.IO`.

### M-13 · No se valida la ubicación en modalidad presencial
- **Dónde:** `…/ui/becario/asistencia/RegistrarAsistenciaViewModel.kt:103` (`latitud = null, longitud = null`). `asistencias.verificado_por` nunca se llena.
- **Escenario:** el plan habla de "Verificado por IP / Auto-validado" y de validar ubicación en presencial. Hoy un becario "presencial" puede registrarse desde su casa. El README lo deja como decisión de alcance, pero la UI no avisa: dice "Modalidad presencial" como si se estuviera verificando algo.
- **Arreglo:** decidir el mecanismo (geocerca FIME o IP de la red institucional). Mientras tanto, no insinuar una validación que no existe.

### M-14 · La sesión guardada puede no restaurarse al abrir la app **[especulativo]**
- **Dónde:** `…/core/session/SessionManager.kt:21`, `…/ui/login/LoginViewModel.kt:25-31`.
- **Escenario:** en un arranque en frío, `currentUserOrNull()` se consulta en cuanto se crea el cliente, y supabase-kt carga la sesión del almacenamiento de forma asíncrona. Puede regresar null y obligar a iniciar sesión cada vez, o mostrar el formulario un momento antes de redirigir. No se pudo comprobar sin dispositivo.
- **Arreglo:** `client.auth.awaitInitialization()` (o esperar `sessionStatus` ≠ `Initializing`) antes de decidir, y mostrar un splash con spinner en lugar del formulario mientras tanto.

### M-15 · Mi Cuenta muestra menos de lo que ya carga
- **Dónde:** `…/ui/becario/cuenta/MiCuentaScreen.kt:43-53`, `…/MiCuentaViewModel.kt:36-41`.
- **Escenario:**
  - El ingeniero asignado se consulta pero no se muestra.
  - No hay avatar (`AvatarIniciales` existe sin uso), ni badge de rol, ni "Estado del periodo" o "Semestre actual".
  - Admin e ingeniero usan la misma pantalla del becario (ruta `BECARIO_MI_CUENTA`) sin sus indicadores ("Administrador General", becarios activos, supervisores).
- **Arreglo:** completar según `plan-frontend-docencheck.md` §Mi Cuenta, con variantes por perfil.

### M-16 · Firma SIASE sin acciones masivas ni "excluir"
- **Dónde:** `…/ui/ingeniero/siase/ReportesSiaseEquipoScreen.kt:56-71`, `…/ui/admin/reportes/ReportesSiaseLoteScreen.kt:52-75`.
- **Escenario:**
  - El ingeniero no tiene "Confirmar a todos mis becarios" ni manera de rechazar o excluir. El estado `excluido` existe en el enum y nunca se usa.
  - El admin no tiene "Seleccionar todos", ni el banner "Hay N reportes listos para firmar", ni filtro de pendientes.
  - Solo se puede tocar el checkbox, no la fila.
  - La lista vacía queda en blanco y "Firmar seleccionados" con 0 seleccionados no hace nada y no dice nada.
- **Arreglo:**
  - "Seleccionar todos (N)" y fila completa tocable con `Modifier.toggleable`.
  - Botón con el conteo ("Firmar 5"), deshabilitado en 0.
  - Acción "Excluir" con motivo.
  - Estado vacío "No hay reportes por firmar este mes".

### M-17 · La consulta del equipo es solo por becario y sin filtros
- **Dónde:** `…/ui/ingeniero/asistencias/ConsultaBecarioScreen.kt:38,63-71`; en la navegación solo se llega desde Mis Becarios → "Asistencias".
- **Escenario:** el plan pide una "Consulta de Asistencias (equipo)" con filtros de becario, fechas y tipo. Lo que existe es una lista por becario cuyo header ni siquiera dice su nombre, con los mismos datos crudos de A-14.
- **Arreglo:** pantalla de equipo accesible desde el Dashboard, con los tres filtros y el nombre en cada tarjeta. Pasar el nombre como subtítulo en la vista por becario.

### M-18 · El botón "←" del header no es accesible
- **Dónde:** `…/ui/theme/Componentes.kt:83-89`.
- **Escenario:** es un `Text("←")` con `clickable`. Su área táctil mide unos 20×28 dp (menos de 48 dp), no tiene rol de botón y TalkBack lo lee como "flecha izquierda". Lo usan casi todas las pantallas.
- **Arreglo:** `IconButton(onClick = onVolver) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver", tint = Color.White) }`.

### M-19 · Contraste insuficiente en badges, números de alerta y navegación
- **Dónde:** `…/ui/theme/Color.kt:17-24`, `…/ui/theme/Componentes.kt:54-61,193`, `…/ui/theme/Type.kt:54-59`.
- **Mediciones (WCAG):**

  | Combinación | Contraste | Mínimo AA |
  | --- | --- | --- |
  | Texto blanco 12 sp sobre ámbar `#F5A623` | 2.0:1 | 4.5:1 |
  | Texto blanco sobre verde `#2E8B57` | 4.25:1 | 4.5:1 |
  | Texto blanco sobre rojo `#E53935` | 4.2:1 | 4.5:1 |
  | Número de alerta ámbar sobre blanco (`NumeroIndicador`) | 2.0:1 | — |
  | `NavInactivo #9CA3AF` sobre blanco | 2.5:1 | — |

- **Arreglo:** texto oscuro `#1A1A1A` sobre ámbar, o un ámbar más oscuro (`#B26A00`). Verde de badge `#1E7145` (unos 5.9:1). Rojo `#C62828`. Números de alerta en `#B26A00`.

### M-20 · Detalles del login
- **Dónde:** `…/ui/login/LoginViewModel.kt:42-50`, `…/ui/login/LoginScreen.kt:69-95`.
- **Escenario:**
  - El correo no se recorta: un espacio que agrega el autocompletado provoca "Invalid login credentials".
  - No hay `ImeAction.Next` ni `ImeAction.Done`, así que Enter no envía el formulario.
  - "Mostrar" es un texto de 12 sp, con un toque de unos 16 dp de alto.
  - El plan dice "Usuario" y la app dice "Correo institucional". Está bien si es intencional, pero conviene un ejemplo `@uanl.edu.mx`.
- **Arreglo:** `email.trim()`, acciones de teclado, `TextButton` o `IconButton` con ojo y `contentDescription`, y un placeholder de ejemplo.

---

## Bajo

### B-01 · Emojis como íconos
- **Dónde:** `HomeScreen.kt:106` (🏢/🏠), `RegistrarAsistenciaScreen.kt:129-131`, `SolicitarTransferenciaScreen.kt:64` ("✓ nombre"), `Componentes.kt:388,407` (`ItemNavInferior.icono`).
- **Por qué importa:** cambian de aspecto según el fabricante y TalkBack los lee literalmente ("edificio de oficinas"). La guía pide íconos rellenos y coherentes.
- **Arreglo:** usar Material Icons (`Business`, `Home`, `Check`) con `contentDescription`.

### B-02 · Componentes de la guía que existen pero no se usan
- **Dónde:** `StepperEtapas`, `SegmentadoControl`, `AvatarIniciales` y `PantallaConNavInferior` (`Componentes.kt:305,322,357,419`) no tienen ningún uso. `BadgeEstado` se usa en una sola pantalla.
- **Por qué importa:** la app se ve "genérica" justo lo que la guía quería evitar, aunque las piezas ya están hechas.
- **Arreglo:** aplicarlos en SIASE, Reporte de horas, Mi Cuenta y los estados.

### B-03 · Navegación por listas de botones verdes idénticos
- **Dónde:** `PanelGeneralScreen.kt:86-100` (9 botones primarios), `DashboardScreen.kt:91-94` (4), `HomeScreen.kt:86-97` (tarjetas que solo tienen un título).
- **Por qué importa:** cuando todo es primario, nada tiene jerarquía. El plan pide una barra inferior: becario Horas/SIASE/Asistencia/Cuenta; admin Inicio/Ingenieros/Becarios/Traspasos/Más.
- **Arreglo:** usar `PantallaConNavInferior` y dejar un solo botón primario por pantalla.

### B-04 · A Home le faltan la tarjeta SIASE y el contexto del becario
- **Dónde:** `HomeScreen.kt:56-76`.
- **Escenario:**
  - No aparece "Reporte mensual (SIASE) — quedan N días", que es justo el aviso que mueve al becario a subir.
  - El subtítulo es fijo ("Servicio social FIME") en lugar de su coordinación o ingeniero.
  - El título puede mostrar "Hola, becario" un momento, porque `nombre` no es estado observable.
  - El texto "registro(s)" no está pluralizado.
- **Arreglo:** agregar la tarjeta SIASE, poner `nombre` en el `StateFlow` y usar plurales (`pluralStringResource`).

### B-05 · Espaciado y alineación inconsistentes
- **Dónde:**
  - Los indicadores de carga quedan pegados arriba a la izquierda, con padding distinto en cada pantalla (p. ej. `ReporteHorasScreen.kt:37` vs `HomeScreen.kt:122`).
  - En `RegistrarAsistenciaScreen.kt:176` el botón no es de ancho completo, en contra del plan.
  - `ConfigurarModalidadScreen.kt:61` usa una etiqueta de día sin ancho fijo, así que los chips quedan desalineados entre filas ("Lunes" vs "Miércoles").
  - `ReportesSiaseLoteScreen.kt:55` separa filas con 8 dp sin tarjeta, mientras el resto de la app usa tarjetas con 12 dp.
  - El spinner del botón SIASE (`ReporteSiaseScreen.kt:75`) usa 4 dp de padding dentro de un botón de 40 dp y lo deforma.
- **Arreglo:** un `CargandoCentrado()` compartido, `Modifier.width(88.dp)` para la etiqueta del día, y la escala 4/8/12/16 de la guía.

### B-06 · La barra de progreso se pone verde con apenas el 50 % de la meta
- **Dónde:** `Componentes.kt:180`.
- **Por qué importa:** la guía dice ámbar "cuando está por debajo de la meta". Al 50 % del mes, con la mitad del mes ya transcurrido, la barra sale verde y engaña.
- **Arreglo:** comparar contra el ritmo esperado (el mismo cálculo del Dashboard) en lugar de un umbral fijo.

### B-07 · Sin confirmación tras acciones que regresan solas
- **Dónde:** `SolicitarTransferenciaScreen.kt:56`, `CrearUsuarioScreen.kt:35`, `AsignarIngenieroScreen.kt:42`, `GestionSemestresScreen.kt:48`.
- **Por qué importa:** la pantalla se cierra y el usuario no sabe si funcionó.
- **Arreglo:** Snackbar "Solicitud enviada", "Cuenta creada" o "Asignado a Ing. X" en la pantalla anterior (mediante `savedStateHandle`).

### B-08 · "Cerrar sesión" sin confirmación
- **Dónde:** `MiCuentaScreen.kt:53`.
- **Por qué importa:** junto con A-12 (cola offline) se pueden perder registros pendientes.
- **Arreglo:** diálogo de confirmación cuando haya pendientes.

### B-09 · Comparación frágil de marcas de tiempo
- **Dónde:** `AsistenciaRepository.kt:115`.
- **Por qué importa:** compara como texto un `Instant.toString()` ("...Z") contra el formato de Postgres ("...+00:00", con otra precisión). Funciona por casualidad mientras coincida el prefijo.
- **Arreglo:** parsear a `Instant` (`OffsetDateTime.parse`) antes de comparar.

### B-10 · La biometría se captura con una cámara y se verifica con otra **[especulativo]**
- **Dónde:** `EnrolamientoFacialScreen.kt:102` (`DEFAULT_BACK_CAMERA`) vs `RegistrarAsistenciaScreen.kt:117` (`DEFAULT_FRONT_CAMERA`).
- **Por qué importa:** ópticas distintas y un umbral sin calibrar (0.75, ver README) pueden producir rechazos falsos.
- **Arreglo:** calibrar con fotos reales tomadas con la cámara frontal, o dejar elegir la cámara en el enrolamiento.

### B-11 · Formulario "Nuevo usuario" poco amigable
- **Dónde:** `CrearUsuarioScreen.kt:55-69`.
- **Escenario:** el correo no usa `KeyboardType.Email`, la contraseña temporal no se puede mostrar para dictársela al usuario, no hay generador de contraseña, y no se obliga a cambiarla en el primer acceso.
- **Arreglo:** tipos de teclado, mostrar/ocultar, botón "Generar" y un flujo de cambio de contraseña.

### B-12 · Las rutas no están protegidas por perfil
- **Dónde:** `NavGraph.kt:41-224`.
- **Por qué importa:** todas las rutas viven en un solo `NavHost` sin revisar el perfil. Hoy solo se puede llegar a cada una por los callbacks correctos y RLS cubre el backend, pero un *deep link* o un error de navegación mostraría pantallas de admin a un becario (con datos vacíos o errores).
- **Arreglo:** grafos anidados por perfil (`navigation(route="becario")`) y una revisión del perfil en la entrada de cada grafo.

---

## Navegación por perfil

| Perfil | Pantallas documentadas | ¿Alcanzable? | Observaciones |
| --- | --- | --- | --- |
| Becario | Login, Home, Registrar asistencia, Mi reporte de horas, Reporte SIASE, Consulta de asistencias, Mi cuenta | Sí, todas desde Home | Sin barra inferior; Reporte de horas y Consulta incompletas (A-14, A-15); sin logout fuera de Mi cuenta (A-12) |
| Ingeniero | Dashboard, Mis becarios, Enrolamiento, Configurar modalidad, Solicitar transferencia, Reportes SIASE, Consulta del equipo | Sí, salvo la **Consulta del equipo** (solo hay vista por becario, M-17) | Faltan "Editar" en Mis becarios y "Excepciones" en Modalidad; Transferencias es solo lectura |
| Administrador | Panel, Semestres, Ingenieros, Becarios, Transferencias, Horas global, Firmas SIASE, Configuración, Excel, Mi cuenta | Sí, todas desde el Panel | Faltan Editar/Eliminar/Dar de baja (A-13), "Habilitar Reporte SIASE", filtros de Becarios; Mi cuenta es la de becario (M-15) |

**Back stack:**
- Tras iniciar sesión, `popUpTo(LOGIN) inclusive` impide volver al login. Correcto.
- Al cerrar sesión, `popUpTo(0) inclusive` deja la pila limpia. Correcto.
- Las pantallas de detalle regresan con `popBackStack`. Correcto.
- No se encontraron bucles de navegación.
- Lo que sí falla es lo que hay *detrás* de la pila: los datos no se refrescan (A-07).

---

## Problemas transversales

1. **Errores tragados o crudos.** El patrón `runCatching { … }.onSuccess { … }` sin `onFailure`, o `Text(it.message)`, se repite en unos 20 ViewModels. Hace falta una capa común: `mensajeAmigable()`, Snackbar global y el componente `EstadoError` con "Reintentar" (A-08, M-01, M-02).
2. **Excepciones fuera de `runCatching` en `viewModelScope`.** Sobre todo `sessionManager.usuarioAutenticado()` y las llamadas de red sin red. Con un `CoroutineExceptionHandler` común se elimina toda una clase de cierres de la app (C-02, A-11).
3. **Sin protección contra doble envío ni acciones concurrentes.** El estado "procesando" se pone tarde o no se pone, y no existe ningún diálogo de confirmación en toda la app (la búsqueda de `AlertDialog` no da resultados) (C-03, C-05, C-06, A-10).
4. **Operaciones de varios pasos que no son atómicas desde el cliente.** Asignar, enrolar, resolver transferencias y guardar configuración ejecutan dos o tres escrituras seguidas. Deben ser RPCs `security definer` transaccionales (C-06, A-05, A-10, M-10).
5. **Datos sin refrescar.** Solo 2 de las 25 pantallas usan `RecargarAlReanudar` (A-07).
6. **Fechas en UTC y en formato ISO crudo.** Hace falta un util `FechaUi` con la zona `America/Monterrey` para mostrar, filtrar y exportar, y arreglar las funciones SQL de la misma forma (A-06).
7. **Formularios sin scroll ni `imePadding`, y listas con `Column + forEach`.** El problema se repite en 7 pantallas (A-09).
8. **Datos calculados que no se muestran.** Historial SIASE, horas por día, ingeniero asignado y filtro de fechas existen en el ViewModel y no en la UI. Es trabajo casi terminado (A-14, A-15, M-12, M-15).
9. **Estados como texto plano o enum crudo, en lugar de `BadgeEstado`**, y con contraste insuficiente (M-03, M-19).
10. **Lógica de negocio que depende de procesos que no corren.** El cron SIASE no está instalado y el worker no se inicializa con la fábrica correcta. El sistema se ve "bien" en pruebas rápidas y falla con el tiempo (C-01, A-04).

---

## Totales

| Severidad | Hallazgos |
| --- | --- |
| Crítico | 6 |
| Alto | 17 |
| Medio | 20 |
| Bajo | 12 |
| **Total** | **55** |

---

## Estado de corrección

Fecha: 2026-10-20 · Alcance de esta pasada: lógica, datos, backend, sesión, navegación, manejo de errores y concurrencia. **No** se hizo rediseño visual: lo marcado *Pendiente-UI* queda para el agente de UI, que ya tiene en los ViewModels el estado y las funciones que necesita.

**Backend aplicado al proyecto `rcvpowylehewvsxquhip`:** migraciones `0012_zona_horaria_y_horas`, `0013_asistencias_integridad`, `0014_siase_reportes`, `0015_operaciones_transaccionales`, `0016_consultas_agregadas` (detalle en `supabase/migrations/README.md`) y edge function `admin-crear-usuario` v2. Se probaron con los fixtures (becario, ingeniero asignado, ingeniero ajeno y admin) dentro de una transacción revertida; no quedó ningún dato de prueba. Advisors de seguridad: solo los warnings esperados (RPC `SECURITY DEFINER` que validan el perfil adentro).

**Mecanismos nuevos en la app** (para que la UI los use):
- `core/error/MensajeAmigable.kt`: `mensajeAmigable()` traduce red/HTTP/Auth/Postgres/RLS a español; `intentar {}` (como `runCatching` sin tragarse la cancelación); `ErrorDeNegocio`.
- `core/ui/Avisos.kt`: `CanalAvisos` (eventos de una sola vez por ViewModel, con tipo ÉXITO/ERROR/INFO en `VisualesAviso`) y `rememberAvisos(...)` → `SnackbarHostState`. `PantallaConEncabezado` acepta `snackbarHostState`.
- `core/ui/ComponentesEstado.kt`: `DialogoConfirmacion` (con modo destructivo y contenido extra) y `EstadoError(mensaje, onReintentar)`.
- `core/ui/PermisoCamara.kt`: `rememberPermisoCamara()` (pedir de nuevo / abrir Ajustes / revisar al volver).
- `core/util/FechaUi.kt`: zona `America/Monterrey`, parseo robusto y formatos ("Lun 20 oct · 9:03", "Octubre 2026").
- `navigation/AvisosNavegacion.kt`: `volverConAviso()` / `avisosAlVolver()` (aviso en la pantalla anterior vía `savedStateHandle`).
- `data/local/CacheLocal.kt`: perfil, embedding, patrón semanal y último registro para registrar sin red.
- Pruebas unitarias en `app/src/test/.../LogicaNegocioTest.kt` (8 pruebas, pasan).

**Pasada de UI (2026-10-21):** rediseño completo de la capa visual con sistema de diseño propio (`ui/theme`, documentado en `docs/sistema-diseno.md`), barra inferior por perfil, modo oscuro, edge-to-edge, ícono adaptativo `DC` y splash. Las filas siguientes ya reflejan esa pasada.

| ID | Estado | Qué se hizo |
| --- | --- | --- |
| C-01 | Corregido | Manifest: se quita el meta-data `androidx.work.WorkManagerInitializer` del `InitializationProvider` (verificado en el merged manifest), así WorkManager usa `DocenCheckWorkerFactory`. Solo los errores de red van a la cola; los rechazos del servidor se muestran. Mensaje "guardada en el teléfono; se subirá cuando haya conexión" y sincronización inmediata al volver la red. |
| C-02 | Corregido | Todo el flujo va en `intentar`. Perfil, biometría, patrón semanal y último registro se guardan en el teléfono y se usan sin red; sin copia local, mensaje claro. |
| C-03 | Corregido | `Procesando` y bandera atómica **antes** de capturar; toques extra se ignoran. Backend: trigger `asistencias_validar` (dos registros a menos de 1 min se rechazan, con lock por becario). |
| C-04 | Corregido | Siguiente tipo decidido por día local; `horas_trabajadas` y `horasPorDia` emparejan solo dentro del mismo día local. RLS permite corregir al ingeniero asignado; `ConsultaBecarioViewModel.agregarRegistroManual()` / `eliminarRegistro()` listos. UI: en "Asistencias" del becario (vista del ingeniero), botón flotante "Agregar registro" con tipo, fecha (calendario), hora (reloj) y modalidad, validando que no sea futuro; ícono de basura por registro con confirmación destructiva. |
| C-05 | Corregido | Diálogo con resumen (`vista_previa_cierre`), hay que escribir el nombre del periodo, se muestra el resultado antes de salir, y `p_periodo_actual` evita cerrar dos periodos por doble envío. UI: botón principal rojo sólido "Cerrar semestre y abrir el nuevo" (`BotonDestructivo`) fijo abajo, aviso "Acción irreversible" y diálogo destructivo con ícono de advertencia. |
| C-06 | Corregido | Tarjeta con becario (nombre y matrícula), "De → A", fecha; diálogo de confirmación; botones de la tarjeta bloqueados mientras procesa; RPC `resolver_transferencia` transaccional con bloqueo de fila; errores en Snackbar. |
| A-01 | Corregido | Trigger `reportes_siase_proteger` + políticas de Storage: el becario no puede confirmarse ni re-subir un mes revisado. La app deshabilita "Subir" y explica el motivo. |
| A-02 | Corregido | Se guarda la ruta del objeto; URL firmada de 10 min al abrir. Botón "Ver reporte" en ingeniero y admin (y "Ver archivo subido" en el becario). |
| A-03 | Corregido | Selector de mes y sección "Pendientes de meses anteriores" (ingeniero y admin). |
| A-04 | Corregido | Sin pg_cron: `reportes_siase_mes()` calcula el estado efectivo (con o sin fila). Decisión documentada en el README de migraciones. |
| A-05 | Corregido | RPC `enrolar_becario` (desactiva e inserta en una transacción). Probado en vivo el re-enrolamiento. |
| A-06 | Corregido | SQL con `hoy_local()`/`inicio_dia_local()`; app con `FechaUi` (consulta, filtros, exportación, ventana, mes). |
| A-07 | Corregido | `RecargarAlReanudar` en Home, Dashboard, Mis Becarios, Panel y demás listas. |
| A-08 | Corregido | Todas las acciones listadas informan éxito/error (Snackbar o texto). La tarjeta "Hoy" muestra su error con "Reintentar". |
| A-09 | Corregido | Todos los formularios con `verticalScroll` + `imePadding` (y `consumeWindowInsets`), acción principal en `BarraAccionFija` que sube con el teclado, `ImeAction.Next/Done` con salto de foco y `windowSoftInputMode=adjustResize`. Ingeniero destino como `Desplegable` (Solicitar transferencia) y lista de radio en `LazyColumn` (Asignar ingeniero). |
| A-10 | Corregido | Muestra "Asignado actualmente", tocar solo selecciona, botón Guardar, confirmación si ya tenía ingeniero, RPC `asignar_ingeniero` atómica. |
| A-11 | Corregido | Login, Mi cuenta, cámara, lectura de archivo (ahora en `Dispatchers.IO`) y `FaceMatcher` ya no lanzan sin atrapar. Cerrar sesión limpia la sesión local aunque no haya red. |
| A-12 | Corregido | "Cerrar sesión" visible en cualquier estado; antes intenta subir la cola y, si quedan registros, pide confirmación. El worker procesa cada registro aparte, solo los del usuario con sesión, cuenta `intentos` y marca los rechazos permanentes (columna `error`, Room v2) que Home avisa. |
| A-13 | Corregido / Pendiente (backend) | Login bloquea cuentas no activas; RLS de asistencias exige cuenta activa; `es_ingeniero_de` exige ingeniero activo. Dar de baja / Reactivar con confirmación (RPC `cambiar_estado_usuario`, no deja dar de baja a un ingeniero con becarios). Filtro Activos/Inactivos/Todos. UI: diálogo "Editar datos" (nombre, matrícula, coordinación, con validación) en Becarios e Ingenieros; búsqueda, filtro Activos/Inactivos/Todos y filtro por ingeniero asesor (incluye "Sin asignar"). **Pendiente:** filtro por semestre (no hay relación becario–periodo en el esquema). |
| A-14 | Corregido | `filtrarPorRango()` funciona en fecha local (atajos "Esta semana" / "Semana pasada"), se incluyen los registros sin subir y las fechas salen legibles. UI: chips "Recientes / Esta semana / Semana pasada / Elegir fechas" (`DateRangePicker`), lista agrupada por día con total de horas, badge Entrada (verde) / Salida (ámbar), ícono de modalidad y "Sin subir"/rechazo. |
| A-15 | Corregido | Segmentado Semana/Mes/Semestre, cuadrícula L–D (hoy resaltado, días futuros atenuados, ícono de modalidad), tarjeta de total con ritmo esperado y tarjeta de meta con lo que falta. |
| A-16 | Corregido | RPC `exportar_asistencias` paginada, RFC 4180 + BOM, incluye inactivos, fecha/hora local, "hasta" inclusivo, archivo escrito fuera del hilo principal y conteo de registros. |
| A-17 | Corregido | Botón "Conceder permiso" / "Abrir Ajustes" y explicación de que la foto no se guarda. |
| M-01 | Corregido | `mensajeAmigable()` en todos los ViewModels; la edge function valida y responde en español (matrícula y correo repetidos). |
| M-02 | Corregido | `EstadoError` con "Reintentar" en todas las pantallas con carga. UI: `EstadoError` centrado con ícono (nube tachada si falta la red) y "Reintentar"; pull-to-refresh (`ContenedorRefrescable`) en listas y paneles. |
| M-03 | Corregido | `ui/theme/EstadosVisuales.kt` centraliza etiqueta + tono + ícono por enum; todos los estados se muestran con `BadgeEstado` tonal. |
| M-04 | Corregido | Una sola regla de estado (backend) para los tres perfiles. |
| M-05 | Corregido | `indicadores_admin()`: "SIASE por firmar", "SIASE sin entregar", "Sin asignar", periodo actual y ventana. |
| M-06 | Corregido | Nombre del becario en el header, solo ingenieros activos, aviso de solicitud pendiente con fecha (formulario deshabilitado) y tarjetas con becario, destino y fecha. |
| M-07 | Corregido | Día sin fila = ningún chip de modalidad seleccionado, opción "No aplica" (borra la fila), actualización sin carreras y Snackbar "Lunes: Home office guardado". |
| M-08 | Corregido | Contador hasta 5, "Reintentar guardado" separado, nombre del becario, diálogo de reemplazo, captura bloqueada durante el proceso. UI: puntos 1–5 animados, "Foto X de 5", aviso de reemplazo, guía del rostro y botón para cambiar de cámara. |
| M-09 | Corregido | RPC `progreso_equipo` (una llamada); el riesgo usa días laborales configurados ya terminados; solo becarios activos. UI: cuadrícula 2x2 (activos, asistieron hoy, debajo de su meta, ventana SIASE), "Requieren atención" con barra y ritmo esperado, y "Actividad reciente" (últimos 7 días). |
| M-10 | Corregido | Validación por campo (1 ≤ apertura ≤ cierre ≤ 31, metas ≥ 0), coma decimal, RPC `guardar_configuracion` atómica y mensaje de éxito distinto al de error. UI: tarjetas con errores por campo, sufijo "h", teclado decimal y vista previa de la ventana. **Pendiente:** tarjeta "Plantillas de periodo" (no hay datos ni RPC para plantillas). |
| M-11 | Corregido / Pendiente (decisión) | Selector AD/EJ, validación de fechas, `abrir_periodo` cuando no hay periodo activo y vista previa de cumplimiento. UI: `SelectorFecha` (calendario) para inicio y fin, días restantes del periodo y lista Cumplió/No cumplió. **Pendiente de decisión:** pasar a los becarios a "Finalizado" al cerrar. |
| M-12 | Corregido | Nombre real (`DISPLAY_NAME`), límite de 10 MB, lectura en IO, periodo y mes visibles, historial cargado. UI: header verde estándar, tarjeta de periodo con badge Abierta/Cerrada, stepper Pendiente → Subido → Confirmado, zona de carga punteada e historial con badges. |
| M-13 | Pendiente (decisión) | Ya no se insinúa una validación de ubicación que no existe. El mecanismo (geocerca o IP) sigue sin decidirse. |
| M-14 | Corregido | `awaitInitialization()` antes de leer la sesión y spinner en lugar del formulario mientras tanto. |
| M-15 | Corregido | Avatar con iniciales, badge de rol, detalles por perfil (matrícula / No. de empleado, coordinación, ingeniero asignado, estado, semestre actual) e indicadores para ingeniero (becarios a cargo, ritmo bajo) y admin (becarios activos, supervisores). |
| M-16 | Corregido | "Seleccionar todos (N)", "Firmar N" deshabilitado en 0, aviso si no hay selección, "Excluir" con confirmación (RPC `firmar_reportes_siase`) y estado vacío. UI: fila completa `toggleable`, "Seleccionar todos" tri-estado, filtro "Solo por firmar", banner "Hay N reportes listos" y barra fija "Firmar N". |
| M-17 | Corregido | Nombre del becario en el header y filtros de fecha/tipo en el ViewModel. UI: pestaña "Asistencias" del ingeniero (`ConsultaEquipoScreen`) con filtros de becario, fechas y tipo, y el nombre en cada tarjeta. |
| M-18 | Corregido | `IconButton` con `ArrowBack` (auto-espejo), 48 dp y "Volver" para TalkBack. |
| M-19 | Corregido | Badges tonales (fondo claro + texto oscuro, ≥ 7:1); texto secundario 5.5:1; números de alerta `#9A5B00` (5.4:1); rojo `#C62828`; header más oscuro bajo el texto blanco; nav inactivo con el color de texto secundario. Ver `docs/sistema-diseno.md`. |
| M-20 | Corregido | El correo se recorta y pasa a minúsculas. UI: Next/Done (Done envía), ojo accesible "Mostrar contraseña" y placeholder `nombre@uanl.edu.mx`. |
| B-01 | Corregido | Sin emojis: `material-icons-extended` en toda la app, con `contentDescription` donde el ícono comunica algo. |
| B-02 | Corregido | Stepper (SIASE), segmentado (Horas, Semestres, filtros, corrección), avatar (cuentas y listas) y badges en todas las pantallas. |
| B-03 | Corregido | `NavigationBar` por perfil (becario: Inicio/Horas/Registros/SIASE/Cuenta; ingeniero: Inicio/Becarios/Asistencias/SIASE/Cuenta; admin: Inicio/Becarios/Ingenieros/Traspasos/Más). Un solo botón primario por pantalla. |
| B-04 | Corregido | `nombre` es `StateFlow` y Home expone `ventanaSiase`. UI: tarjeta SIASE con badge de días restantes, saludo con primer nombre y fecha, plurales (`FormatoUi.plural`). |
| B-05 | Corregido | Escala `Espacio` (4/8/12/16/24…), `CargandoCentrado` y esqueletos, botones de ancho completo, etiquetas de día alineadas y tarjetas en todas las listas. |
| B-06 | Corregido | Para el equipo, el ritmo esperado ya está en `ProgresoBecario.horasEsperadasSemana`. UI: `BarraProgresoMeta` compara contra el ritmo esperado (equipo: días laborales; becario: días hábiles transcurridos / días del mes) y marca dónde debería ir. |
| B-07 | Corregido | `volverConAviso`: "Cuenta creada", "Asignado a…", "Solicitud enviada", "Semestre cerrado" en la pantalla anterior. |
| B-08 | Corregido | Se pide confirmación al cerrar sesión cuando hay registros sin subir. |
| B-09 | Corregido | Las fechas se parsean a `Instant` antes de comparar. |
| B-10 | No aplica | Hallazgo especulativo: requiere calibrar con fotos reales tomadas con la cámara frontal. |
| B-11 | Corregido / Pendiente (backend) | Validación de formato de correo. UI: teclado de correo, contraseña visible/oculta, botón "Generar contraseña segura" y errores por campo. **Pendiente:** obligar a cambiar la contraseña en el primer acceso (requiere flujo de backend). |
| B-12 | Corregido | Cada ruta revisa el perfil (`protegida(...)`) y, tras la muerte del proceso, recarga la sesión antes de decidir. Con otro perfil o sin sesión, vuelve al login. |
