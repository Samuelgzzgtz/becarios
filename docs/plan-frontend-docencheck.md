# Plan de frontend — DocenCheck igual a los mockups del PDF

Este plan describe, pantalla por pantalla, cómo debe quedar el frontend para que coincida con las imágenes del PDF de avance. Es la referencia para reconstruir la UI actual (que hoy se ve genérica) usando el mismo layout, jerarquía y colores del diseño original.

## Paleta y estilo base

| Uso | Hex aprox. |
| --- | --- |
| Header (gradiente) | `#1B5E3A` → `#2E8B57` |
| Botón primario | `#1E7145` (pressed `#155534`) |
| Fondo de pantalla | `#FFFFFF` / `#F5F7F6` |
| Tarjetas | `#FFFFFF`, `border-radius: 12dp`, `elevation: 2dp` |
| Texto principal / secundario | `#1A1A1A` / `#6B7280` |
| Estado positivo (Activo, Confirmado, Aprobada) | `#2E8B57` |
| Estado alerta (Pendiente, ventana por cerrar) | `#F5A623` |
| Estado negativo (Rechazada, Sin reporte, Excluido) | `#E53935` |
| Botón "Cerrar sesión" | fondo `#FDEAEA`, texto `#E53935` |
| Nav inferior activo / inactivo | `#1E7145` / `#9CA3AF` |

Tipografía: Roboto o Inter. Título de header 18–20sp bold blanco; subtítulo de header 12–13sp blanco 80%; texto de tarjeta 14sp; números grandes de dashboard 24–28sp bold; badges 11–12sp bold en cápsula.

## Pantallas — perfil Becario

**Login:** fondo blanco. Logo circular verde con iniciales "DC" centrado arriba, debajo "DocenCheck / Control de Becarios FIME" en gris. Campo "Usuario", campo "Contraseña" con link "Mostrar" a la derecha del label. Botón "Iniciar sesión" verde en píldora, ancho completo. Texto pequeño gris debajo: "Redirección automática según tu rol (Admin / Ingeniero / Becario)".

**Home:** header verde con menú hamburguesa, nombre del becario y su coordinación/ingeniero asignado debajo en texto más claro. Tarjeta "Hoy" con la modalidad del día (ícono + texto, ej. "Home Office · Sin registrar entrada"). Tarjeta "Progreso de horas" con tres filas (Semana / Mes / Semestre), cada una con label, cifra "X/Y hrs" a la derecha y barra de progreso debajo. Tarjeta "Reporte mensual (SIASE)" con badge ámbar "Ventana abierta — quedan N días" y texto gris con el rango de fechas. Botón grande verde "Registrar asistencia" al final, ancho completo.

**Registrar Asistencia:** header verde con flecha de regreso y título. Control segmentado "Entrada / Salida" (píldora, mitad seleccionada en verde). Debajo, recuadro negro grande con círculo punteado blanco centrado y texto "Centra tu rostro dentro del círculo". Chip informativo con el ícono de la modalidad ("Modalidad remota — sin validación de ubicación"). Botón verde "Registrar asistencia" ancho completo, con texto gris pequeño debajo explicando la validación automática.

**Mi Reporte de Horas:** header verde con título "Mi Reporte de Horas". Control segmentado de tres opciones: Semana / Mes / Semestre. Grid de 7 columnas (L a D) cada una con horas del día e ícono de modalidad. Tarjeta "Total semanal" con cifra y barra de progreso. Tarjeta "Meta semanal: N hrs" con ícono de medalla. Nav inferior con 4 íconos: Horas, SIASE, Asistencia, Cuenta.

**Reporte Mensual SIASE:** header verde. Tarjeta de "Periodo: [Mes Año]" con badge de estado (Abierto/Cerrado) y texto de días restantes. Stepper horizontal (Pendiente → Subido por mí → Confirmado). Dropzone punteado con ícono de subir archivo, texto "Subir captura de pantalla / PDF SIASE" y formatos aceptados. Botón verde "Marcar como subido a SIASE". Lista "Historial de reportes" con badges de estado por mes (Confirmado en verde, Excluido en gris).

**Consulta de Asistencias:** header verde. Selector de rango de fechas con botón "Filtrar" a la derecha. Lista de tarjetas "Registros de la semana": cada una con día/fecha, hora, ícono + texto de modalidad, badge Entrada (verde) o Salida (ámbar), y una línea de verificación ("Auto-validado" / "Verificado por IP").

**Mi Cuenta:** header verde. Avatar circular con iniciales, nombre en negrita, badge de rol debajo. Tarjeta "Detalles de Becario" con filas: Matrícula, Coordinación, Ingeniero Asignado, Estado del periodo (badge verde "Activo"), Semestre actual. Botón "Cerrar sesión" en rojo suave, ancho completo, al fondo.

## Pantallas — perfil Ingeniero

**Dashboard:** header verde con "Hola, Ing. [Nombre]". Grid 2x2 de tarjetas de indicadores (Becarios activos, Asistencias hoy, Por debajo de su meta, Ventana reporte mensual con badge de color). Tarjeta "Actividad reciente" con lista de eventos, cada uno con punto de color (verde/ámbar/rojo) según el tipo de evento.

**Mis Becarios:** header con título y aviso informativo ("El alta y baja de becarios la gestiona la administración escolar"). Lista de tarjetas por becario: nombre, matrícula, badge "Activo", barra de progreso de horas del mes, y fila de 4 botones pequeños en píldora (Editar / Modalidad / Enrolar / Transferir).

**Enrolamiento Facial:** header con flecha de regreso. Dropdown "Seleccionar becario...". Recuadro negro con círculo punteado e ícono de cámara centrado, texto "Captura foto X de 5" y puntos indicadores debajo. Botón verde "Capturar foto". Nota pequeña gris explicando el mínimo de capturas requeridas.

**Configurar Modalidad:** header con nombre del becario. Control segmentado "Patrón semanal / Excepciones". Fila de 7 chips (Lun–Dom) con ícono de presencial/home office/no aplica por día. Leyenda con los 3 íconos y su significado. Botón verde "Guardar patrón semanal".

**Solicitar Transferencia:** header con título. Dropdown "Becario", dropdown "Transferir a (Ingeniero)", dropdown "Motivo del traslado", textarea "Detalles adicionales (opcional)". Botón verde "Enviar solicitud". Lista "Mis solicitudes de cambio" con badges Pendiente (ámbar) / Aprobada (verde) / Rechazada (rojo).

**Reportes Mensuales SIASE:** header. Aviso de cuándo se habilita la subida. Switch "Confirmar a todos mis becarios". Lista "Estado de entrega" con checkbox por becario, horas registradas y estado (Subió a SIASE / Sin reporte, este último deshabilitado/gris). Botón verde "Guardar selección".

**Consulta de Asistencias (equipo):** header. Tres filtros en fila (becario, rango de fechas, tipo de pase). Lista "Registros recientes" igual que la vista de becario pero con el nombre de cada becario visible.

## Pantallas — perfil Administrador

**Panel de Administración:** header verde "DocenCheck / Coordinación General de Becarios" con etiqueta "ADMINISTRADOR". Grid 2x2 de indicadores (Becarios activos, Sin asignar, Ingenieros, Transferencias pendientes). Tarjeta de "Periodo actual" con estado de la ventana SIASE. Acción de control "Habilitar Reporte SIASE" como fila clickeable con flecha. Nav inferior: Inicio, Ingenieros, Becarios, Traspasos, Más.

**Gestión de Semestres:** tarjeta con periodo actual, fechas reales y días restantes para el cierre. Botón "Cerrar semestre actual y abrir nuevo" (destacar en rojo/naranja como acción crítica). Lista de becarios activos del periodo con horas acumuladas y badge Cumplió/No cumplió servicio. Aviso de que al confirmar se archivan como "Finalizado".

**Ingenieros:** botón verde "+ Nuevo Ingeniero" arriba. Lista de tarjetas: nombre del ingeniero, matrícula/ID, coordinación, cantidad de becarios asignados, acciones "Editar" / "Eliminar".

**Becarios:** tres dropdowns de filtro (Semestre, Ingeniero, Estado). Botón verde "+ Nuevo Becario". Tarjetas por becario con matrícula, ingeniero asesor, badge de estado (Activo/Sin asignar) y acciones rápidas (Asignar / Dar de Baja / Eliminar).

**Transferencias:** switch "Ver solo pendientes". Tarjetas con origen/destino de ingeniero, motivo, fecha y badge de estado; para las pendientes, botones "Aprobar" (verde) y "Rechazar" (rojo suave) lado a lado.

**Reporte de Horas (vista global):** control segmentado Semana/Mes/Semestre. Total de becarios bajo supervisión. Tarjetas agrupadas por ingeniero, cada becario con horas y barra de progreso; aviso "Ritmo bajo" en ámbar cuando aplica.

**Reportes SIASE (firmas):** selector de mes + filtro "Ver pendientes de firmar". Banner verde "Hay N reportes listos para firmar" con botón "Firmar todos". Lista agrupada por ingeniero/becario con badge de estado y botón "Firmar SIASE" individual.

**Configuración:** tarjetas de: Plantillas de Periodo (fechas de AD y EJ), Metas Requeridas (semanal/mensual/semestral en campos numéricos), Ventana Abierta SIASE (días habilitados). Botón verde "Guardar cambios".

**Generación Excel:** filtros de exportación (fecha inicio/fin, supervisor, becario específico). Tabla de previsualización rápida (3 filas de muestra). Botón verde ancho completo "Generar y Descargar (.xlsx)" con ícono de descarga.

**Mi Cuenta (admin):** avatar con iniciales, nombre y badge "Administrador General". Par de indicadores personales (becarios activos, supervisores FIME). Tarjeta "Información Institucional" (No. de Empleado, Coordinación, Semestre Actual). Botón "Cerrar sesión" en rojo suave.

Nav inferior del administrador (segunda mitad de pantallas): Horas, Firmas, Config, Excel, Transf, Cuenta.

## Prioridad de implementación sugerida

1. Login + Home Becario + Registrar Asistencia (flujo crítico, el que más se usa).
2. Resto de pantallas de Becario.
3. Dashboard e Mis Becarios de Ingeniero (segundo perfil más usado).
4. Resto de pantallas de Ingeniero.
5. Panel y pantallas de Administrador (uso menos frecuente, se puede dejar al final).

## Instrucción final

Una vez que el frontend quede igual al del PDF y compile sin errores, coloca el archivo `.apk` generado directamente en el **escritorio (Desktop)** del usuario, no solo en la carpeta `build/outputs/apk/` del proyecto.
