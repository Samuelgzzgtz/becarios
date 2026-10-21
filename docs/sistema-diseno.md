# Sistema de diseño — DocenCheck

Versión 1 · 2026-10-21 · Kotlin + Jetpack Compose + Material 3 (1.4) · paquete `com.fime.docencheck`

Este documento describe los tokens, los componentes y los patrones de pantalla de la app. Todo vive en `app/src/main/java/com/fime/docencheck/ui/theme/` (más los estados en `core/ui/ComponentesEstado.kt` y los formatos en `core/util/FormatoUi.kt`). **Regla general:** una pantalla nueva no define colores, tamaños ni componentes propios; usa los de aquí.

---

## 1. Principios

1. **Verde institucional, siempre.** No se usa color dinámico (Material You). El header verde identifica la app en cualquier teléfono, en claro y en oscuro.
2. **Una acción principal por pantalla.** Es el único `BotonPrimario` visible. Las demás acciones son secundarias, de texto o están en la barra inferior.
3. **El estado nunca es texto plano.** Todo estado (Pendiente, Confirmado, Entrada, Inactivo…) es un `BadgeEstado` con su tono.
4. **Ninguna pantalla sin salida.** Cada pantalla tiene barra inferior (destinos principales) o "Volver" en el header. Cada error tiene "Reintentar".
5. **Accesible por defecto.** Contraste AA, objetivos táctiles de 48 dp o más, íconos con `contentDescription` cuando comunican algo, encabezados marcados con `heading()`.

---

## 2. Tokens

### 2.1 Color (`Color.kt`, `Theme.kt`)

Hay dos capas: la **paleta base** (valores crudos, no se usan directo en pantallas) y los **tokens semánticos** (`DocenCheckTema.colores.*` y `MaterialTheme.colorScheme.*`), que cambian solos con el modo oscuro.

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `colorScheme.primary` | `#1E7145` | `#7FD3A2` | Botón primario, indicador del segmentado, selección |
| `colorScheme.primaryContainer` | `#DCEFE3` | `#1E5136` | Fila o día seleccionado, indicador de la barra inferior |
| `colores.headerInicio → headerFin` | `#154A2E → #1E7145` | `#0B2E1C → #165C38` | Degradado del header |
| `colores.fondo` | `#F5F7F6` | `#0F1412` | Fondo de pantalla |
| `colores.superficie` | `#FFFFFF` | `#18201C` | Tarjetas, barra inferior, barra de acción |
| `colores.borde` | `#E0E4E2` | `#34403A` | Borde de tarjetas y divisores |
| `colores.texto` | `#1A1A1A` | `#E3E8E5` | Texto principal |
| `colores.textoSecundario` | `#5F6B66` | `#A9B4AE` | Texto de apoyo, íconos inactivos |
| `colores.exito / exitoContenedor / sobreExitoContenedor` | `#1E7145 / #DCEFE3 / #14532D` | `#7FD3A2 / #1D3B2A / #B6E8C9` | Activo, Confirmado, Entrada, al ritmo |
| `colores.alerta / alertaContenedor / sobreAlertaContenedor` | `#9A5B00 / #FFEFCF / #6E4200` | `#FFC266 / #3D2E10 / #FFD99A` | Pendiente, Salida, ritmo bajo, ventana abierta |
| `colores.peligro / peligroContenedor / sobrePeligroContenedor` | `#C62828 / #FDECEC / #8C1D1D` | `#FF8A80 / #4A1C1C / #FFC9C4` | Rechazada, Sin reporte, errores, acciones destructivas |
| `colores.info / infoContenedor / sobreInfoContenedor` | `#1D4ED8 / #E3EEFB / #1E3A8A` | `#9DBBF5 / #1C2A44 / #C9D8F7` | En revisión, Sin subir, avisos informativos |
| `colores.neutroContenedor / sobreNeutroContenedor` | `#ECEFF1 / #374151` | `#2A3230 / #C9D1CD` | Exento, Inactivo, Cerrada |
| `colores.pistaProgreso` | `#E0E4E2` | `#2E3833` | Fondo de barras de progreso |
| `colores.escanerFondo` | `#0B0F0D` | `#050706` | Fondo del visor de cámara |

**Contrastes medidos (WCAG 2.1)** — resuelven la auditoría M-19:

| Combinación | Contraste | Requisito |
| --- | --- | --- |
| Blanco sobre primario `#1E7145` | 6.0:1 | 4.5:1 ✔ |
| Texto principal sobre fondo | 16.9:1 | 4.5:1 ✔ |
| Texto secundario `#5F6B66` sobre blanco / fondo | 5.5:1 / 5.3:1 | 4.5:1 ✔ |
| Badge éxito `#14532D` sobre `#DCEFE3` | 8.9:1 | 4.5:1 ✔ |
| Badge alerta `#6E4200` sobre `#FFEFCF` | 7.6:1 | 4.5:1 ✔ (antes 2.0:1 blanco sobre ámbar) |
| Badge peligro `#8C1D1D` sobre `#FDECEC` | 8.1:1 | 4.5:1 ✔ |
| Número de alerta `#9A5B00` sobre blanco | 5.4:1 | 4.5:1 ✔ (antes 2.0:1) |
| Rojo `#C62828` sobre blanco | 5.6:1 | 4.5:1 ✔ |

Reglas: nunca texto blanco sobre ámbar; los badges son **siempre tonales** (fondo claro + texto oscuro). En código se pide el tono, no el color: `TonoEstado.ALERTA.colores()`.

### 2.2 Tipografía (`Type.kt`)

Roboto del sistema. Los estilos **no fijan color** (lo toman de `LocalContentColor`), por eso funcionan igual sobre el header verde, en tarjetas y en oscuro.

| Estilo | Tamaño / peso | Uso |
| --- | --- | --- |
| `headlineMedium` | 26 sp bold | Marca en login |
| `titleLarge` | 20 sp bold | Título del header, nombre en Mi cuenta |
| `titleMedium` | 16 sp semibold | Títulos de tarjeta y de sección |
| `titleSmall` | 14 sp semibold | Nombres en filas de lista |
| `bodyLarge / bodyMedium / bodySmall` | 16 / 14 / 12 sp | Texto corrido, apoyo, pies |
| `labelLarge / labelMedium / labelSmall` | 14 / 12 / 11 sp semibold | Botones, chips, etiqueta "ADMINISTRADOR" |
| `NumeroGrande` | 28 sp bold, cifras tabulares | Indicadores (horas, contadores) |
| `NumeroMediano` | 20 sp bold, tabulares | Hora en tarjetas de asistencia, totales |
| `TextoBadge` | 12 sp semibold | Badges y stepper |

### 2.3 Espaciado (`Dimensiones.kt` → `Espacio`)

Múltiplos de 4 dp: `xxs 2 · xs 4 · s 8 · m 12 · l 16 · xl 24 · xxl 32 · xxxl 48`. Alias semánticos: `pantalla = 16` (margen lateral), `entreTarjetas = 12`, `tactilMinimo = 48`.

### 2.4 Forma y elevación

- `FormasApp`: extraSmall 4, small 8, medium 12 (campos, banners, snackbars), large 16 (tarjetas), extraLarge 28 (diálogos, visor de cámara).
- `FormaPildora` para botones, badges, segmentados y búsqueda. `FormaTarjeta` = 16 dp. `FormaCampo` = 12 dp.
- Elevación (`Elevacion`): las tarjetas son planas con borde de 1 dp (se ven igual de bien en oscuro). Solo la barra de acción fija lleva sombra (`nivel3`).

### 2.5 Iconografía

`material-icons-extended` 1.7.8 (agregado a `gradle/libs.versions.toml`). Estilo **Rounded** en toda la app; en la barra inferior, **Outlined** sin seleccionar y **Rounded** seleccionado. Íconos decorativos con `contentDescription = null` (el texto al lado ya lo dice); íconos que son la única etiqueta de un botón llevan descripción ("Volver", "Mes anterior", "Mostrar contraseña", "Eliminar registro de las 9:03", "Cambiar cámara"…). Sin emojis (auditoría B-01).

### 2.6 Movimiento

Sutil y funcional: `AnimatedContent`/`Crossfade` (220 ms) entre cargando/error/listo; barras de progreso que se llenan (700 ms); indicador del segmentado que se desliza (250 ms); barra inferior que entra/sale deslizándose; esqueletos con pulso; en la cámara, óvalo que "respira" (buscando) y arco que gira (verificando).

---

## 3. Componentes

### Estructura

| Componente | Archivo | Descripción |
| --- | --- | --- |
| `PantallaConEncabezado` | `Componentes.kt` | Scaffold estándar: header, avisos coloreados, `barraAccion` opcional (acción principal fija abajo que sube con el teclado), `botonFlotante` opcional. |
| `EncabezadoApp` | `Componentes.kt` | Degradado verde, esquinas inferiores de 24 dp, `statusBarsPadding`, back como `IconButton` 48 dp ("Volver"), `etiqueta` opcional, acciones a la derecha. |
| `BarraAccionFija` | `Componentes.kt` | Superficie con sombra, `navigationBarsPadding` + `imePadding`. |
| `HostAvisos` | `Componentes.kt` | Snackbar verde (éxito), rojo (error) o neutro (info) según `VisualesAviso`, con ícono y "Cerrar aviso". |
| `BarraNavegacion` + `DestinoNav` | `Componentes.kt` | `NavigationBar` M3, ícono relleno + indicador tonal en el activo, contador opcional. |

### Contenido

| Componente | Descripción |
| --- | --- |
| `Tarjeta(onClick?)` | Superficie, 16 dp, borde sutil, relleno 16 dp. Clicable con ripple si recibe `onClick`. |
| `EncabezadoSeccion` | Título con rol de encabezado, ícono y acción de texto opcionales ("Detalle", "Ver todo"). |
| `FilaInfo` | Etiqueta / valor (o badge) a 48 dp, para detalles de cuenta. |
| `AvisoBanner` | Banner tonal con ícono, título opcional y hasta dos acciones. |
| `BadgeEstado(texto, tono, icono?)` | Cápsula tonal. |
| `IconoCircular` | Ícono en círculo tonal (tarjetas, filas, estados vacíos). |
| `AvatarIniciales`, `LogoDC` | Identidad. |
| `TarjetaIndicador` + `CuadriculaDos` | Indicador con ícono, número grande (verde o ámbar), etiqueta y detalle; cuadrícula 2 columnas. Clicable para ir al detalle. |
| `BarraProgresoMeta(progreso, ritmoEsperado?)` | Verde si va al ritmo (≥ 80 % de lo esperado) o cumplió, ámbar si no; marca vertical donde "debería ir". Expone `progressBarRangeInfo`. |
| `FilaProgreso` | Etiqueta + "x / y h" + barra; anuncia "Al ritmo esperado" / "Por debajo…" / "Meta cumplida". |
| `SegmentadoControl` / `SegmentadoInformativo` | Píldora con indicador animado, 48 dp, opciones como `Role.Tab` dentro de `selectableGroup`. La versión informativa no es interactiva y se anuncia como decidida por la app. |
| `StepperEtapas` | Etapas con palomita al completarse y tono configurable para la etapa actual. |

### Botones (todos ≥ 48 dp)

| Componente | Uso |
| --- | --- |
| `BotonPrimario(texto, icono?, cargando)` | La acción principal. Con `cargando` muestra spinner + texto (no cambia de tamaño). |
| `BotonSecundario` | Acciones de tarjeta (Ver reporte, Editar, Modalidad…). Borde gris, texto oscuro. |
| `BotonDestructivo(relleno)` | Rojo sólido para la acción crítica principal (cerrar semestre, confirmar en diálogos destructivos); rojo tonal para secundarias (Dar de baja, Rechazar). |
| `BotonCerrarSesion` | Rojo tonal con ícono de salida. |

### Formularios (`ComponentesFormulario.kt`)

| Componente | Descripción |
| --- | --- |
| `CampoTexto` | `OutlinedTextField` con ícono, `error` (rojo con ícono, debajo) o `ayuda`, tipo de teclado e `ImeAction` con acción. |
| `CampoContrasena` | Con botón de ojo accesible. |
| `CampoBusqueda` | Píldora con lupa y botón para borrar. |
| `SelectorFecha` / `DialogoFecha` | Campo de solo lectura que abre `DatePickerDialog`; límites mínimo/máximo. |
| `DialogoRangoFechas` | `DateRangePicker` con "Filtrar". |
| `SelectorHora` | Abre un `TimePicker` de 24 h. |
| `Desplegable<T>` | `ExposedDropdownMenuBox` con detalle por opción. |

Validación: los errores aparecen **en línea, junto al campo**, al intentar enviar (no mientras se escribe). Los errores del servidor van en un `AvisoBanner` rojo y en Snackbar.

### Estados (`core/ui/ComponentesEstado.kt`)

| Componente | Descripción |
| --- | --- |
| `ContenidoSegunEstado(UiState)` | Transición suave entre esqueleto, error y contenido. |
| `EsqueletoLista` / `BloqueEsqueleto` | Esqueletos con pulso para listas y tarjetas. |
| `CargandoCentrado` | Spinner centrado con texto opcional. |
| `EstadoError(mensaje, onReintentar)` | Ícono (nube tachada si falta la red), título, mensaje y "Reintentar". |
| `EstadoVacio` | Ícono, título, explicación y acción opcional. |
| `DialogoConfirmacion` | Ícono, título, mensaje desplazable, contenido extra (campos), confirmar rojo si es destructivo. |
| `ContenedorRefrescable` | Pull-to-refresh M3. Se oculta al llegar un estado nuevo o a los 2 s. |

### Cámara (`ComponentesCamara.kt`)

| Componente | Descripción |
| --- | --- |
| `VistaCamara(selector, captura, onError)` | CameraX; se reenlaza al cambiar de cámara; si falla, avisa en vez de cerrar la app. |
| `GuiaRostro(EstadoGuia)` | Oscurece todo menos un óvalo: punteado blanco (buscando), arco verde girando (verificando), verde (éxito), rojo (error). |
| `ChipEstadoCamara` | Cápsula sobre la cámara, región viva para TalkBack. |
| `PanelPermisoCamara` | Para qué se usa la cámara, que la foto no se guarda, "Conceder permiso"/"Abrir Ajustes" y "Volver". |
| `MarcoCamara` | Contenedor negro redondeado. |

### Enums visibles (`EstadosVisuales.kt`)

`etiqueta()`, `tono()` e `icono()` para `EstadoReporteSiase`, `EstadoTransferencia`, `EstadoUsuario`, `Perfil`, `TipoAsistencia` y `ModalidadTrabajo?` (null = "No aplica"). Es la única fuente: no se escriben estas etiquetas en las pantallas.

### Formatos (`core/util/FormatoUi.kt` + `FechaUi`)

Horas "12.5 h" y "12.5 / 20 h", enteros con separador de miles, plurales ("1 registro", "3 registros"), "Martes 20 de octubre", "20 oct 2026", inicial de día L–D, primer nombre, y el **ritmo esperado** de la semana (días hábiles terminados / 5) y del mes. Todas las fechas en `America/Monterrey` vía `FechaUi`.

---

## 4. Navegación

- La **barra inferior** vive fuera del `NavHost` (`navigation/NavGraph.kt`), así no parpadea al cambiar de pestaña; solo aparece en los destinos principales (`navigation/DestinosPrincipales.kt`).
- `irAPestana(ruta)` conserva el estado de cada pestaña y deja la pila como "raíz del perfil → pestaña". Atrás desde una pestaña regresa a Inicio; desde Inicio sale de la app.
- Las pantallas secundarias se abren encima, sin barra, con "Volver" en el header.
- Avisos entre pantallas con `volverConAviso` / `avisosAlVolver` (Mi cuenta creada, Solicitud enviada, Semestre cerrado…).

| Perfil | Barra inferior | Pantallas secundarias |
| --- | --- | --- |
| Becario | Inicio · Horas · Registros · SIASE · Cuenta | Registrar asistencia |
| Ingeniero | Inicio · Becarios · Asistencias · SIASE · Cuenta | Asistencias de un becario (corrección), Modalidad, Enrolamiento, Solicitar transferencia, Mis transferencias |
| Administrador | Inicio · Becarios · Ingenieros · Traspasos · Más | Firmas SIASE, Semestres, Reporte de horas, Configuración, Exportar, Mi cuenta, Nuevo usuario, Asignar ingeniero |

---

## 5. Patrones por pantalla

**Login.** Franja verde con logo y marca; tarjeta con correo (`Next`) y contraseña (`Done` envía). Error en banner animado. Mientras se verifica la sesión: pantalla verde con logo y "Verificando tu sesión…".

**Becario · Inicio.** Saludo con primer nombre y fecha. Tarjeta "Hoy" (modalidad con ícono, qué toca, y el **botón principal** "Registrar entrada/salida"). Banners de registros sin subir (info) y rechazados (peligro, con "Ver registros" y "Descartar"). Progreso semana/mes/semestre con ritmo esperado. Tarjeta SIASE con días restantes.

**Becario · Registrar asistencia.** Segmentado informativo Entrada/Salida, visor con guía del rostro y chip de estado, modalidad del día (sin insinuar validación de ubicación), botón principal con estado "Verificando…", y panel de resultado (éxito, guardado sin red o error con "Intentar de nuevo"/"Volver").

**Becario · Horas.** Segmentado Semana/Mes/Semestre; cuadrícula L–D; total con ritmo; meta con lo que falta; leyenda de íconos.

**Becario · Registros.** Chips de fecha y rango, lista agrupada por día con horas trabajadas, pull-to-refresh, estado vacío explicativo.

**Becario · SIASE.** Periodo y ventana, estado con badge + stepper, zona de carga punteada (deshabilitada con el motivo si no se puede subir), archivo entregado y historial.

**Mi cuenta (tres perfiles).** Avatar, nombre y badge de rol; indicadores por perfil; detalles; "Cerrar sesión" siempre visible (con confirmación si hay registros sin subir).

**Ingeniero · Inicio.** Cuadrícula 2x2 clicable, "Requieren atención" con barras de ritmo, actividad reciente con punto de color, acceso a transferencias.

**Ingeniero · Becarios.** Aviso de alta/baja, búsqueda (si hay más de 4), tarjeta por becario con avatar, badge Activo/Ritmo bajo, barra semanal con ritmo y 4 acciones.

**Ingeniero · Asistencias (equipo) / de un becario.** Filtros becario + fechas + tipo; en la vista de un becario, botón flotante "Agregar registro" (formulario de corrección) y eliminar con confirmación.

**Ingeniero · Modalidad.** Resumen L–D, un segmentado por día que guarda al momento (spinner "Guardando…" por día) y leyenda.

**Ingeniero · Enrolamiento.** Aviso de reemplazo, visor con cambio de cámara, puntos 1–5, "Capturar foto", resultado con "Reintentar guardado" separado de "Tomar la foto de nuevo".

**Ingeniero · SIASE.** Selector de mes, banner con "Confirmar todos", pendientes de meses anteriores, tarjetas con Ver reporte / Confirmar / Excluir.

**Ingeniero · Solicitar transferencia.** Desplegable de ingeniero, motivo frecuente + detalles, aviso si ya hay solicitud, "Enviar solicitud" fijo abajo.

**Admin · Inicio.** Etiqueta ADMINISTRADOR, banner de firmas pendientes, 6 indicadores clicables, periodo actual con ventana SIASE, accesos rápidos; Mi cuenta en el header.

**Admin · Becarios / Ingenieros.** Búsqueda, segmentado de estado, filtro por ingeniero (becarios), conteo de becarios (ingenieros), Asignar/Editar/Dar de baja, botón flotante "Nuevo …".

**Admin · Traspasos.** Tarjeta con De → A, motivo y fecha; Rechazar (rojo tonal) y Aprobar (primario) lado a lado; confirmación.

**Admin · Más.** Accesos agrupados: Seguimiento, Administración, Cuenta.

**Admin · Firmas SIASE.** Selector de mes, banner, "Seleccionar todos" tri-estado, filtro "Solo por firmar", filas completas tocables, barra fija "Firmar N".

**Admin · Semestres.** Periodo con días restantes, cumplimiento con lista Cumplió/No cumplió, formulario con segmentado AD/EJ y calendarios, botón **destructivo** fijo y confirmación escribiendo el nombre.

**Admin · Configuración / Exportar.** Formularios con errores por campo y vista previa; exportación con atajos de rango y columnas del archivo.

---

## 6. Plataforma

- **Edge-to-edge** (`enableEdgeToEdge`, íconos claros en la barra de estado porque toda pantalla empieza en verde). Insets: el header usa `statusBarsPadding`; el `NavHost` consume el alto de la barra inferior; los formularios usan `imePadding`; `adjustResize` en el manifest.
- **Modo oscuro** automático según el sistema (`DocenCheckTheme(oscuro = isSystemInDarkTheme())`), con el mismo verde institucional en el header.
- **Ícono adaptativo** `mipmap-anydpi-v26/ic_launcher.xml`: degradado verde + monograma "DC" vectorial, con capa monocroma (Android 13+). **Splash** de Android 12+ con fondo verde (`values-v31/themes.xml`); fondo de ventana claro/oscuro para evitar destellos.

---

## 7. Pendientes conocidos

- Filtro de becarios por **semestre** (no existe relación becario–periodo en el esquema).
- Tarjeta **"Plantillas de periodo"** en Configuración (no hay datos ni RPC).
- **Excepciones** de modalidad por fecha (el plan las menciona; no hay modelo de datos).
- Forzar **cambio de contraseña** en el primer acceso (requiere backend).
- Contador de pendientes en la barra inferior del admin (el componente lo soporta; falta exponer el dato a nivel de navegación).
- "Buscando rostro" es una guía visual: la detección ocurre al capturar (ML Kit), no en vivo.
