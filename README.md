# DocenCheck v2 — Control de Becarios FIME

App de control de asistencia con reconocimiento facial para becarios FIME, con tres perfiles: **Becario**, **Ingeniero** y **Administrador**.

Este repositorio consolida las tres propuestas del avance de Proyecto Integrador 2:

- **Propuesta 1** — Migración de Supabase Cloud a Supabase self-hosted en un VPS propio (Hostinger + Docker + Nginx).
- **Propuesta 2** — Nueva versión de la app enfocada en Servicio Social, con pantallas rediseñadas para los tres perfiles.
- **Propuesta 3** — Integración de APIs (CameraX, ML Kit, TensorFlow Lite, WorkManager, entre otras).

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | **Webapp instalable (PWA)**: React + TypeScript, en Vercel — ver `web/README.md` |
| Reconocimiento facial | Cámara del navegador + MediaPipe + el mismo modelo TFLite (LiteRT.js), todo en el teléfono |
| Persistencia local | IndexedDB (cola de asistencias sin red) |
| Login | Clerk (Supabase Third-Party Auth) |
| Backend / API | Supabase (Postgres + PostgREST + Storage + Edge Functions); hoy en Supabase Cloud, self-hosted pendiente |
| Infraestructura | VPS Hostinger + Docker + Nginx (reverse proxy) |

## Estructura del repo

```
becarios/
├── web/               # Webapp/PWA (React + TypeScript) — la app actual
├── app/               # App Android anterior (Kotlin + Jetpack Compose), reemplazada por web/
├── backend/
│   ├── supabase/      # Config y docker-compose de Supabase self-hosted
│   └── sql/           # Migraciones y esquema de la base de datos
└── docs/              # Plan de construcción y documentación del proyecto
```

Ver `docs/plan-construccion-becarios.md` para el plan completo por fases (base de datos, backend, frontend por perfil y roadmap).

## Estado actual

- **Backend:** Supabase Cloud (proyecto `rcvpowylehewvsxquhip`) con login de Clerk. Las migraciones van de `backend/sql/0001` a `0026` y se aplican en orden (`backend/sql/README.md`). La migración a self-hosted (Fase 1) sigue pendiente.
- **Revisión:** todo registro hecho por el becario queda por revisar hasta que lo aprueba su ingeniero asignado; el administrador solo consulta (`docs/integridad-horas.md`).
- **CI:** `.github/workflows/ci.yml` corre lint, pruebas (incluidas las migraciones sobre PGlite) y build en cada PR.
- **App:** pantallas de los tres perfiles completas, con el rediseño UX/UI descrito en `docs/sistema-diseno.md`.
- **Auditoría:** `docs/auditoria-ux.md` lista los 55 hallazgos de UX y lógica, y en "Estado de corrección" dice cuáles ya se corrigieron.

## Webapp (actual)

Funciona en Android y iPhone desde el navegador y se instala con "Agregar a pantalla de inicio".
Desarrollo, despliegue en Vercel e instalación: `web/README.md`.

## Compilar la app Android anterior

1. Copia `local.properties.example` a `local.properties` y llena `sdk.dir`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`.
2. Usa JDK 17 y corre `./gradlew assembleDebug testDebugUnitTest` (en Windows, `gradlew.bat`).
3. El APK queda en `app/build/outputs/apk/debug/`.

## Equipo

Proyecto Integrador 2 — FIME-UANL, Equipo 1.
