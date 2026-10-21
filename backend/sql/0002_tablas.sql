-- Fase 2 · 0002 — Esquema de tablas
-- Corresponde a la sección "Base de datos" del plan.

-- ---------------------------------------------------------------------------
-- usuarios: extiende auth.users; el perfil decide a qué pantallas entra.
-- ---------------------------------------------------------------------------
create table public.usuarios (
  id            uuid primary key references auth.users (id) on delete cascade,
  matricula     text unique not null,
  nombre        text not null,
  perfil        public.perfil_usuario not null,
  coordinacion  text,
  estado        public.estado_usuario not null default 'activo',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index usuarios_perfil_idx on public.usuarios (perfil) where estado = 'activo';

create trigger usuarios_touch
  before update on public.usuarios
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- ingenieros_becarios: 1 ingeniero → N becarios. Alimenta "Mis Becarios".
-- ---------------------------------------------------------------------------
create table public.ingenieros_becarios (
  id                uuid primary key default gen_random_uuid(),
  ingeniero_id      uuid not null references public.usuarios (id) on delete restrict,
  becario_id        uuid not null references public.usuarios (id) on delete cascade,
  fecha_asignacion  date not null default current_date,
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint ingenieros_becarios_no_autoasignacion check (ingeniero_id <> becario_id)
);

-- Un becario tiene un solo ingeniero vigente a la vez; el histórico queda con activo = false.
create unique index ingenieros_becarios_becario_activo_idx
  on public.ingenieros_becarios (becario_id) where activo;

create index ingenieros_becarios_ingeniero_idx
  on public.ingenieros_becarios (ingeniero_id) where activo;

-- ---------------------------------------------------------------------------
-- enrolamientos_faciales: guarda el vector calculado en el dispositivo,
-- nunca fotos crudas (plan, "Seguridad y riesgos").
-- ---------------------------------------------------------------------------
create table public.enrolamientos_faciales (
  id                 uuid primary key default gen_random_uuid(),
  becario_id         uuid not null references public.usuarios (id) on delete cascade,
  embedding_vector   bytea not null,
  modelo             text not null,
  dimension          integer not null,
  fecha_captura      timestamptz not null default now(),
  capturado_por      uuid references public.usuarios (id) on delete set null,
  activo             boolean not null default true
);

create unique index enrolamientos_faciales_becario_activo_idx
  on public.enrolamientos_faciales (becario_id) where activo;

comment on column public.enrolamientos_faciales.embedding_vector is
  'Dato biométrico. El acceso se restringe por RLS; el cifrado en reposo con llave propia queda pendiente de decidir (ver README de migraciones).';

-- ---------------------------------------------------------------------------
-- asistencias: alimenta "Consulta de Asistencias" y el reporte semanal.
-- ---------------------------------------------------------------------------
create table public.asistencias (
  id             uuid primary key default gen_random_uuid(),
  becario_id     uuid not null references public.usuarios (id) on delete cascade,
  tipo           public.tipo_asistencia not null,
  ocurrido_en    timestamptz not null default now(),
  modalidad      public.modalidad_trabajo not null,
  latitud        numeric(9, 6),
  longitud       numeric(9, 6),
  verificado_por uuid references public.usuarios (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index asistencias_becario_fecha_idx
  on public.asistencias (becario_id, ocurrido_en desc);

-- ---------------------------------------------------------------------------
-- horarios_modalidad: patrón semanal que configura el ingeniero.
-- ---------------------------------------------------------------------------
create table public.horarios_modalidad (
  id          uuid primary key default gen_random_uuid(),
  becario_id  uuid not null references public.usuarios (id) on delete cascade,
  dia_semana  smallint not null check (dia_semana between 0 and 6), -- 0 = domingo
  modalidad   public.modalidad_trabajo not null,
  updated_at  timestamptz not null default now(),
  unique (becario_id, dia_semana)
);

create trigger horarios_modalidad_touch
  before update on public.horarios_modalidad
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- metas_horas: becario_id null = meta global (Configuración del administrador).
-- ---------------------------------------------------------------------------
create table public.metas_horas (
  id              uuid primary key default gen_random_uuid(),
  becario_id      uuid references public.usuarios (id) on delete cascade,
  meta_semanal    numeric(6, 2) not null check (meta_semanal >= 0),
  meta_mensual    numeric(6, 2) not null check (meta_mensual >= 0),
  meta_semestral  numeric(7, 2) not null check (meta_semestral >= 0),
  updated_at      timestamptz not null default now()
);

create unique index metas_horas_global_idx
  on public.metas_horas ((true)) where becario_id is null;

create unique index metas_horas_becario_idx
  on public.metas_horas (becario_id) where becario_id is not null;

create trigger metas_horas_touch
  before update on public.metas_horas
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- periodos_academicos: controla cierre/apertura de semestre.
-- ---------------------------------------------------------------------------
create table public.periodos_academicos (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  tipo          public.tipo_periodo not null,
  fecha_inicio  date not null,
  fecha_fin     date not null,
  activo        boolean not null default false,
  constraint periodos_academicos_rango check (fecha_fin > fecha_inicio)
);

-- Un solo periodo activo a la vez.
create unique index periodos_academicos_activo_idx
  on public.periodos_academicos ((true)) where activo;

-- ---------------------------------------------------------------------------
-- reportes_siase: el archivo vive en Storage, aquí vive el estatus.
-- ---------------------------------------------------------------------------
create table public.reportes_siase (
  id            uuid primary key default gen_random_uuid(),
  becario_id    uuid not null references public.usuarios (id) on delete cascade,
  periodo_id    uuid not null references public.periodos_academicos (id) on delete restrict,
  mes           date not null, -- primer día del mes reportado
  archivo_url   text,
  estado        public.estado_reporte_siase not null default 'pendiente',
  fecha_firma   timestamptz,
  firmado_por   uuid references public.usuarios (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (becario_id, mes)
);

create index reportes_siase_estado_idx on public.reportes_siase (estado, mes desc);

create trigger reportes_siase_touch
  before update on public.reportes_siase
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- transferencias: flujo "Solicitar Transferencia".
-- ---------------------------------------------------------------------------
create table public.transferencias (
  id                 uuid primary key default gen_random_uuid(),
  becario_id         uuid not null references public.usuarios (id) on delete cascade,
  ingeniero_origen   uuid not null references public.usuarios (id) on delete restrict,
  ingeniero_destino  uuid not null references public.usuarios (id) on delete restrict,
  motivo             text not null,
  estado             public.estado_transferencia not null default 'pendiente',
  resuelta_por       uuid references public.usuarios (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint transferencias_origen_distinto check (ingeniero_origen <> ingeniero_destino)
);

-- Una sola solicitud pendiente por becario.
create unique index transferencias_pendiente_idx
  on public.transferencias (becario_id) where estado = 'pendiente';

create trigger transferencias_touch
  before update on public.transferencias
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- ventana_siase: config global del aviso "quedan 3 días".
-- ---------------------------------------------------------------------------
create table public.ventana_siase (
  id               boolean primary key default true check (id), -- fila única
  dia_apertura     smallint not null check (dia_apertura between 1 and 31),
  dia_cierre       smallint not null check (dia_cierre between 1 and 31),
  dias_habilitados smallint generated always as (dia_cierre - dia_apertura + 1) stored,
  updated_at       timestamptz not null default now()
);

create trigger ventana_siase_touch
  before update on public.ventana_siase
  for each row execute function public.tocar_updated_at();
