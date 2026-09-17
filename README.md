# DocenCheck v2 — Control de Becarios FIME

App de control de asistencia con reconocimiento facial para becarios FIME, con tres perfiles: **Becario**, **Ingeniero** y **Administrador**.

Este repositorio consolida las tres propuestas del avance de Proyecto Integrador 2:

- **Propuesta 1** — Migración de Supabase Cloud a Supabase self-hosted en un VPS propio (Hostinger + Docker + Nginx).
- **Propuesta 2** — Nueva versión de la app enfocada en Servicio Social, con pantallas rediseñadas para los tres perfiles.
- **Propuesta 3** — Integración de APIs (CameraX, ML Kit, TensorFlow Lite, WorkManager, entre otras).

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | Android nativo, Kotlin + Jetpack Compose |
| Reconocimiento facial | CameraX + ML Kit Face Detection + TensorFlow Lite |
| Persistencia local | Room (SQLite) |
| Backend / API | Supabase self-hosted (Postgres + GoTrue Auth + PostgREST + Kong + Storage + Studio) |
| Infraestructura | VPS Hostinger + Docker + Nginx (reverse proxy) |

## Estructura del repo

```
becarios/
├── app/               # App Android (Kotlin + Jetpack Compose)
├── backend/
│   ├── supabase/      # Config y docker-compose de Supabase self-hosted
│   └── sql/           # Migraciones y esquema de la base de datos
└── docs/              # Plan de construcción y documentación del proyecto
```

Ver `docs/plan-construccion-becarios.md` para el plan completo por fases (base de datos, backend, frontend por perfil y roadmap).

## Equipo

Proyecto Integrador 2 — FIME-UANL, Equipo 1.
