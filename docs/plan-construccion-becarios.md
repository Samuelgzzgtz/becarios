# Plan de construcción — DocenCheck v2 (Servicio Social FIME)

2026-09-17 · Equipo 1

Este plan junta las tres propuestas del avance (migración a VPS propio, nueva versión para Servicio Social, e integración de APIs) en una sola ruta de construcción: backend, frontend y base de datos funcionando de punta a punta.

## Alcance y stack

La app es DocenCheck: control de becarios FIME con reconocimiento facial para asistencia, horas y reportes SIASE. El avance ya trae tres decisiones tomadas (migración a VPS, diseño de pantallas por perfil, lista de APIs); este plan las convierte en un solo build.

| Capa | Tecnología | Por qué |
| --- | --- | --- |
| Frontend | Android nativo, Kotlin + Jetpack Compose | Ya es la base del proyecto; Compose declarativo va bien con las pantallas de becario/ingeniero/admin ya diseñadas |
| Reconocimiento facial | CameraX + ML Kit Face Detection + TensorFlow Lite | Captura y detección en el dispositivo; el embedding facial se calcula localmente y solo se sube el vector, no fotos crudas |
| Persistencia local | Room (SQLite) | Cache de horarios y asistencias para que el registro funcione aunque haya un corte de red momentáneo |
| Backend / API | Supabase self-hosted (Docker: Postgres + GoTrue Auth + PostgREST + Kong + Storage + Studio) | Es la misma API que ya usa el equipo, pero corriendo en el VPS propio en vez de Supabase Cloud |
| Base de datos | PostgreSQL (dentro de Supabase) | Motor relacional, con Row Level Security para separar los tres perfiles |
| Infraestructura | VPS Hostinger + Nginx como reverse proxy + dominio propio | Es la ruta que ya definieron en la Propuesta 1 |
| Automatización en segundo plano | WorkManager + Kotlin Coroutines | Sincroniza asistencias pendientes y sube el reporte SIASE aunque la app esté cerrada |

Un detalle importante para el diseño: **el login redirige según el perfil** (admin / ingeniero / becario), así que ese perfil tiene que vivir en la base de datos desde el primer día, no agregarse después.

## Base de datos

Esquema mínimo en Postgres para soportar los tres perfiles y las pantallas ya diseñadas (login, asistencia, horas, SIASE, transferencias, semestres).

| Tabla | Campos clave | Notas |
| --- | --- | --- |
| `usuarios` | id, matricula, nombre, perfil (becario/ingeniero/administrador), coordinacion, estado | Extiende la tabla `auth.users` de Supabase vía trigger; el perfil decide la redirección del login |
| `ingenieros_becarios` | ingeniero\_id, becario\_id, fecha\_asignacion | Relación 1 ingeniero → N becarios; se usa en "Mis Becarios" |
| `enrolamientos_faciales` | becario\_id, embedding\_vector, fecha\_captura | Guarda el vector calculado en el dispositivo, no fotos |
| `asistencias` | id, becario\_id, tipo (entrada/salida), timestamp, modalidad (presencial/home office), ubicacion, verificado\_por | Alimenta "Consulta de Asistencias" y el reporte semanal |
| `horarios_modalidad` | becario\_id, dia\_semana, modalidad | Patrón semanal configurado por el ingeniero |
| `metas_horas` | becario\_id (o global), meta\_semanal, meta\_mensual, meta\_semestral | Editable desde Configuración (administrador) |
| `periodos_academicos` | id, tipo (AD/EJ), fecha\_inicio, fecha\_fin, activo | Controla el cierre/apertura de semestre |
| `reportes_siase` | id, becario\_id, periodo, archivo\_url, estado (pendiente/subido/confirmado/excluido), fecha\_firma | Storage de Supabase guarda el archivo; esta tabla guarda el estatus |
| `transferencias` | id, becario\_id, ingeniero\_origen, ingeniero\_destino, motivo, estado (pendiente/aprobada/rechazada), fecha | Flujo de "Solicitar Transferencia" |
| `ventana_siase` | dias\_habilitados, fecha\_apertura, fecha\_cierre | Config global que se usa para el aviso "quedan 3 días" |

Todas las tablas llevan Row Level Security: un becario solo lee sus propias filas, un ingeniero lee las de sus becarios asignados, y el administrador lee todo. Esto se define con políticas de Postgres, no con lógica en la app.

## Backend

Supabase self-hosted resuelve la mayor parte sin escribir un backend a mano: Auth (GoTrue) para login y sesiones, PostgREST expone la base como API REST automática, y Storage guarda los PDF/imágenes del reporte SIASE. Lo que sí hay que programar aparte:

1. Trigger en Postgres que, al crear un usuario en `auth.users`, cree su fila en `usuarios` con el perfil correcto (esto define a qué pantalla lo manda el login).
2. Función (Edge Function o RPC en Postgres) que calcule el progreso de horas semana/mes/semestre a partir de `asistencias`, para no recalcularlo en la app cada vez.
3. Función que valide la ventana SIASE (día 26 al 30, por ejemplo) y regrese cuántos días quedan.
4. Job programado (cron dentro del contenedor, o Edge Function con trigger de tiempo) que marque como "Sin reporte" a quien no subió su SIASE cuando cierra la ventana.
5. Endpoint de cierre de semestre: archiva el periodo activo, calcula quién cumplió su servicio y abre el siguiente periodo.

Todo esto vive en el mismo VPS que ya se rentó en Hostinger, corriendo con Docker Compose junto a los demás contenedores de Supabase.

## Frontend

Los mockups del avance ya definen las pantallas por perfil; aquí se listan como módulos de la app Android:

**Becario** — Login, Home (progreso de horas + botón de registrar asistencia), Registrar Asistencia (scanner facial con CameraX + ML Kit), Mi Reporte de Horas (semana/mes/semestre), Reporte Mensual SIASE (subir archivo), Consulta de Asistencias, Mi Cuenta.

**Ingeniero** — Dashboard (becarios activos, alertas de meta), Mis Becarios (lista con horas y acciones), Enrolamiento Facial (captura de 5 fotos para dar de alta la biometría de un becario), Configurar Modalidad (patrón semanal presencial/home office), Solicitar Transferencia, Reportes Mensuales SIASE (aprobar/firmar), Consulta de Asistencias de su equipo.

**Administrador** — Panel general (indicadores del sistema), Gestión de Semestres (abrir/cerrar periodo), Ingenieros (alta/edición), Becarios (alta/asignación), Transferencias (aprobar/rechazar), Reporte de Horas global, Reportes SIASE (firmar en lote), Configuración (metas de horas, ventana SIASE), Generación de Excel (exportar asistencias), Mi Cuenta.

Arquitectura recomendada dentro de la app: MVVM con ViewModel + StateFlow por pantalla, un repositorio por tabla que hable con Supabase vía su SDK de Kotlin, y navegación condicionada por el perfil guardado en la sesión (así el login manda a cada quien a su set de pantallas, tal como está en el mockup).

## Roadmap por fases

**Fase 1 — Infraestructura (retoma la Propuesta 1)**

- [ ] Provisionar VPS en Hostinger + dominio apuntando a la IP
- [ ] Instalar Docker y levantar Supabase self-hosted (Postgres, Auth, Kong, Studio)
- [ ] Configurar Nginx como reverse proxy con HTTPS
- [ ] Migrar esquema y datos desde Supabase Cloud (dry-run → validación → cutover)

**Fase 2 — Base de datos y backend**

- [ ] Crear las tablas del esquema y las políticas de Row Level Security por perfil
- [ ] Trigger de creación de usuario con perfil
- [ ] Funciones de cálculo de horas y de ventana SIASE
- [ ] Poblar datos de prueba (usuarios, becarios, ingenieros) para probar el flujo completo

**Fase 3 — Frontend, perfil Becario**

- [ ] Login con redirección por perfil
- [ ] Enrolamiento y verificación facial (CameraX + ML Kit + TensorFlow Lite)
- [ ] Registrar asistencia + Home con progreso de horas
- [ ] Reporte de horas, SIASE y consulta de asistencias

**Fase 4 — Frontend, perfil Ingeniero**

- [ ] Dashboard y Mis Becarios
- [ ] Enrolamiento facial de becarios y configuración de modalidad
- [ ] Transferencias y aprobación de reportes SIASE

**Fase 5 — Frontend, perfil Administrador**

- [ ] Panel general y gestión de semestres
- [ ] Alta de ingenieros/becarios y aprobación de transferencias
- [ ] Configuración global, firma masiva de SIASE y exportación a Excel

**Fase 6 — Cierre**

- [ ] Pruebas end-to-end con los tres perfiles al mismo tiempo
- [ ] Documentar el runbook (cómo subir, reiniciar, respaldar y restaurar el sistema)
- [ ] Backups automáticos de Postgres y prueba de restore

Con 10 personas en el equipo, las fases 3 a 5 pueden avanzar en paralelo por sub-equipos una vez que la Fase 2 esté cerrada, ya que cada perfil consume las mismas tablas pero pantallas distintas.

## Seguridad y riesgos

Esto ya lo tenían identificado en la justificación de migrar, y sigue aplicando al construir sobre el servidor propio: acceso SSH solo con llaves, puertos cerrados salvo los necesarios, secrets fuera del repositorio (variables de entorno), HTTPS con el dominio, y backups automáticos del volumen de Postgres con un procedimiento de restore probado, no solo documentado.

Dos riesgos específicos de esta versión de la app:

- **Datos biométricos.** El embedding facial identifica a una persona; debe guardarse cifrado en la base y nunca exponerse por la API sin control de acceso. Row Level Security tiene que impedir que un becario lea el embedding de otro.
- **Ventana de rollback.** Antes del cutover final de Cloud a VPS, conviene correr ambos backends en paralelo un par de días y comparar resultados, para poder revertir sin perder asistencias registradas durante la prueba.
