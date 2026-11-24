# Sistema de diseño de Pasalista

La web (`web/`) usa React, Tailwind v4 y shadcn/ui. Los tokens viven en `web/src/ui/estilos.css` y los componentes en `web/src/ui/componentes.tsx`. Las pantallas solo usan esos componentes: no definen colores, tamaños ni estilos propios.

## Reglas

- Fondo salvia y superficies blancas sin borde ni sombra; un paso de tono separa niveles.
- Un solo botón principal (casi negro) por pantalla. Los demás son secundarios (gris) o acciones de texto subrayadas.
- Títulos de texto sobre el fondo. Sin tarjetas ni pastillas decorativas, sin líneas grises de subtítulo encima de las secciones.
- Las pastillas solo marcan un estado dentro de una fila.
- Las listas van en un solo panel blanco con una regla de 1 px entre filas (`border-t border-regla`), no una tarjeta por elemento.
- Íconos sueltos en gris, nunca dentro de círculos de color. Solo llevan color si piden acción o algo falló.
- El único color de datos es el verde (horas trabajadas). Ámbar: atraso o algo pendiente. Rojo: fuera de zona y errores.
- Copy en español y breve. Sin guiones largos; un dato faltante se muestra como "–".

## Tokens

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `fondo` | `#f1f4f1` | `#0e0e0e` | Fondo de la página |
| `superficie` | `#ffffff` | `#1a1a1a` | Paneles, barra inferior |
| `elevado` | `#e9ece9` | `#2a2a2a` | Botón secundario, segmentado |
| `regla` | `#eef0ee` | `#2a2a2a` | Reglas entre filas, pista de barras |
| `control` | `#d4d8d4` | `#404040` | Borde de campos |
| `texto` / `texto-2` | `#0a0a0a` / `#626862` | `#ededed` / `#a3a3a3` | Texto principal y de apoyo |
| `tinta` | `#141414` | `#ededed` | Botón principal, chip activo |
| `dato` / `dato-c` | `#1e7145` / `#e1efe5` | `#7fd3a2` / `#183324` | Horas trabajadas, pastilla de éxito |
| `alerta` / `alerta-c` | `#92400e` / `#fdf3e1` | `#f2b866` / `#3a2a12` | Atraso, pendiente |
| `peligro` / `peligro-c` | `#b91c1c` / `#fdecea` | `#f87171` / `#3d1a1a` | Errores, fuera de zona |

El modo oscuro sigue a `prefers-color-scheme`. Radios: 8 px en paneles y 6 px en controles. Letra IBM Plex Sans empaquetada con la app, con cifras tabulares.

## Medidas y accesibilidad

- Áreas táctiles de 44 px. Los botones chicos y los chips miden 36 px a la vista y un `::after` completa los 44 px.
- Los campos van a 16 px de letra para que iPhone no haga zoom; el resto del texto, a 14 px.
- Foco visible en más de 3:1 en claro y oscuro: contorno sólido de 2 px del color del texto (regla base `:focus-visible`) y, en los campos, borde de 2 px del mismo color.
- Movimiento con los tokens de `estilos.css`; con movimiento reducido solo queda el giro de carga.
- Escritorio: el administrador tiene barra lateral desde 1024 px y el contenido llega a 720 px, salvo las tablas (`Pantalla ancha`).
