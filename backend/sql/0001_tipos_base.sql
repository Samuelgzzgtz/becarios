-- Fase 2 · 0001 — Tipos base y utilidades
-- DocenCheck v2 (Servicio Social FIME)

create extension if not exists pgcrypto;

-- Perfiles: definen la redirección del login (plan, "Alcance y stack").
create type public.perfil_usuario as enum ('becario', 'ingeniero', 'administrador');

create type public.estado_usuario as enum ('activo', 'inactivo', 'egresado');

create type public.tipo_asistencia as enum ('entrada', 'salida');

create type public.modalidad_trabajo as enum ('presencial', 'home_office');

create type public.tipo_periodo as enum ('AD', 'EJ');

create type public.estado_reporte_siase as enum (
  'pendiente',
  'subido',
  'confirmado',
  'excluido',
  'sin_reporte'
);

create type public.estado_transferencia as enum ('pendiente', 'aprobada', 'rechazada');

-- Mantiene updated_at sin que la app tenga que acordarse.
create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
