# Guía de frontend — DocenCheck (igual al PDF de mockups)

El frontend actual se ve genérico. Esta guía define paleta, tipografía y estilo de componentes para que la app Android se vea idéntica a los mockups del PDF de avance (headers verdes, tarjetas blancas, badges de estado, navegación inferior).

## Paleta de colores

| Uso | Color | Hex aprox. |
| --- | --- | --- |
| Header / barra superior (gradiente) | Verde oscuro → verde medio | `#1B5E3A` → `#2E8B57` |
| Color primario (botones principales) | Verde institucional | `#1E7145` |
| Botón primario (hover/pressed) | Verde más oscuro | `#155534` |
| Fondo general de pantallas | Blanco / gris muy claro | `#FFFFFF` / `#F5F7F6` |
| Tarjetas (cards) | Blanco con sombra suave | `#FFFFFF` |
| Borde de tarjeta / divisores | Gris claro | `#E0E0E0` |
| Texto principal | Gris casi negro | `#1A1A1A` |
| Texto secundario | Gris medio | `#6B7280` |
| Estado "Activo" / positivo | Verde | `#2E8B57` |
| Estado "Pendiente" / alerta | Ámbar | `#F5A623` |
| Estado "Rechazada" / error | Rojo | `#E53935` |
| Botón "Cerrar sesión" | Rojo suave (fondo) + texto rojo | fondo `#FDEAEA`, texto `#E53935` |
| Barra de navegación inferior (ítem activo) | Verde institucional | `#1E7145` |
| Barra de navegación inferior (ítem inactivo) | Gris | `#9CA3AF` |

## Tipografía

- Familia: Roboto (default de Android) o Inter si está disponible.
- Título de pantalla (en el header): 18–20sp, bold, blanco.
- Subtítulo del header (ej. "Coordinación de Sistemas"): 12–13sp, regular, blanco con 80% opacidad.
- Texto de tarjeta / labels: 14sp regular, color texto principal.
- Números grandes (horas, contadores del dashboard): 24–28sp, bold.
- Badges de estado: 11–12sp, bold, texto blanco sobre el color del estado, en cápsula con `border-radius: 999`.

## Componentes

**Header superior:** gradiente verde de esquina a esquina, esquinas inferiores redondeadas (8–12dp), ícono de menú hamburguesa a la izquierda en blanco, nombre de usuario/pantalla en blanco.

**Tarjetas (cards):** fondo blanco, `border-radius: 12dp`, sombra ligera (`elevation: 2dp`), padding interno de 16dp, separación entre tarjetas de 12dp.

**Barras de progreso** (horas semana/mes/semestre): fondo gris claro `#E0E0E0`, relleno verde `#2E8B57` cuando va bien, ámbar `#F5A623` cuando está por debajo de la meta.

**Botones primarios:** fondo verde `#1E7145`, texto blanco, `border-radius: 24dp` (píldora), altura 48dp.

**Botones secundarios / de icono** (Editar, Modalidad, Enrolar, Transferir): fondo blanco, borde gris `#E0E0E0`, texto/ícono en gris oscuro, mismo `border-radius` en píldora pero más pequeños.

**Badges de estado** (Activo, Pendiente, Aprobada, Rechazada, Confirmado): cápsula pequeña con el color correspondiente de la tabla de arriba, texto blanco en mayúscula inicial.

**Barra de navegación inferior:** fondo blanco, 4 íconos con label debajo, el ítem activo en verde institucional con el ícono relleno, los demás en gris.

**Scanner facial (pantalla de asistencia y enrolamiento):** fondo negro, círculo punteado blanco centrado, texto de instrucción en blanco debajo del círculo.

## Aplicación por pantalla

Aplica esta paleta a las pantallas que ya están montadas, respetando la jerarquía visual del PDF: el header siempre verde con el nombre/rol, el cuerpo siempre sobre fondo claro con tarjetas blancas, y los estados (activo/pendiente/vencido) siempre con el color de badge correspondiente, nunca con texto plano.

Revisa especialmente:
- Login: fondo blanco, logo circular verde con las iniciales "DC", botón "Iniciar sesión" en verde píldora.
- Home de becario: tarjeta de "Progreso de horas" con las 3 barras (semana/mes/semestre) y tarjeta de "Reporte mensual SIASE" con badge de días restantes en ámbar.
- Dashboard de ingeniero y administrador: tarjetas de indicadores en grid 2x2 con el número grande en verde o ámbar según si hay alertas.

## Instrucción final

Una vez que el frontend quede igual al del PDF y compile sin errores, coloca el archivo `.apk` generado directamente en el **escritorio (Desktop)** del usuario, no solo en la carpeta `build/outputs/apk/` del proyecto.
