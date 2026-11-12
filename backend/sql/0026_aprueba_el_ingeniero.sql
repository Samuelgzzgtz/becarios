-- 0026: Solo el ingeniero asignado aprueba y corrige asistencias.
--
-- El administrador sigue viendo los registros por revisar, las solicitudes y el
-- historial, pero ya no aprueba, no resuelve solicitudes ni corrige: así cada
-- cambio que afecta horas lo firma quien conoce al becario. Un becario sin
-- ingeniero espera a que el administrador se lo asigne.
--
-- Mismas firmas y cuerpos que 0022/0025; solo cambia el permiso (create or
-- replace conserva los grants).

create or replace function public.aprobar_asistencia(p_asistencia uuid, p_jornada boolean default false)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.asistencias;
begin
  select * into a from public.asistencias where id = p_asistencia for update;
  if not found then
    raise exception 'El registro de asistencia no existe.';
  end if;
  if a.becario_id = (select public.uid_actual()) or not public.es_ingeniero_de(a.becario_id) then
    raise exception 'Solo el ingeniero asignado puede aprobar este registro.';
  end if;
  if p_jornada and a.tipo <> 'salida' then
    raise exception 'La jornada se confirma en su salida.';
  end if;
  update public.asistencias
  set revision = 'aprobada', jornada_aprobada = jornada_aprobada or coalesce(p_jornada, false)
  where id = p_asistencia
    and (revision <> 'aprobada' or (coalesce(p_jornada, false) and not jornada_aprobada));
end;
$$;

create or replace function public.aprobar_asistencias(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select public.uid_actual());
  v_n integer;
begin
  if coalesce(cardinality(p_ids), 0) = 0 then
    return 0;
  end if;
  if cardinality(p_ids) > 1000 then
    raise exception 'Aprueba a lo más 1000 registros a la vez.';
  end if;
  perform 1 from public.asistencias a where a.id = any(p_ids) for update;
  if exists (
    select 1 from public.asistencias a
    where a.id = any(p_ids)
      and (a.becario_id is not distinct from v_uid
           or a.becario_id not in (select public.becarios_a_cargo()))
  ) then
    raise exception 'Solo el ingeniero asignado puede aprobar estos registros.';
  end if;
  if exists (
    select 1 from public.asistencias a
    where a.id = any(p_ids)
      and a.revision <> 'aprobada'
      and a.motivo_revision is distinct from 'revision_humana'
  ) then
    raise exception 'Solo se aprueban juntos los registros en revisión humana; los demás se revisan uno por uno.';
  end if;
  update public.asistencias set revision = 'aprobada'
  where id = any(p_ids) and revision <> 'aprobada';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.resolver_correccion_asistencia(
  p_solicitud uuid,
  p_aprobar boolean,
  p_respuesta text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set timezone to 'UTC'
as $$
declare
  s public.solicitudes_correccion;
  a public.asistencias;
  v_respuesta text := nullif(btrim(p_respuesta), '');
begin
  if p_aprobar is null then
    raise exception 'Indica si apruebas o rechazas la solicitud.';
  end if;
  if v_respuesta is null or char_length(v_respuesta) > 500 then
    raise exception 'Escribe una respuesta (máximo 500 caracteres).';
  end if;

  select * into s from public.solicitudes_correccion where id = p_solicitud for update;
  if not found or not public.es_ingeniero_de(s.becario_id) then
    raise exception 'La solicitud no existe o solo su ingeniero asignado puede resolverla.';
  end if;
  if s.estado <> 'pendiente' then
    raise exception 'Esta solicitud ya fue resuelta.' using hint = 'solicitud_resuelta';
  end if;

  if p_aprobar then
    if s.accion <> 'agregar' then
      select * into a from public.asistencias where id = s.asistencia_id for update;
      if not found or (to_jsonb(a) - 'revision' - 'motivo_revision' - 'jornada_aprobada')
                      <> (s.antes - 'revision' - 'motivo_revision' - 'jornada_aprobada') then
        raise exception 'El registro cambió o se borró desde que se pidió la corrección; recházala.'
          using hint = 'solicitud_obsoleta';
      end if;
    end if;
    perform public._aplicar_correccion(
      s.becario_id, s.accion, s.asistencia_id, s.tipo, s.ocurrido_en, s.modalidad, s.motivo, s.id
    );
  end if;

  update public.solicitudes_correccion
  set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
      resuelto_por = public.uid_actual(),
      resuelto_en = now(),
      respuesta = v_respuesta
  where id = s.id;
end;
$$;

create or replace function public.corregir_asistencia(
  p_becario uuid,
  p_accion text,
  p_asistencia uuid,
  p_tipo public.tipo_asistencia,
  p_ocurrido_en timestamptz,
  p_modalidad public.modalidad_trabajo,
  p_motivo text,
  p_antes jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set timezone to 'UTC'
as $$
declare
  c record;
begin
  if not public.es_ingeniero_de(p_becario)
     or not exists (select 1 from public.usuarios u where u.id = p_becario and u.perfil = 'becario') then
    raise exception 'Solo el ingeniero asignado puede corregir las asistencias de este becario.';
  end if;

  select * into c
  from public._preparar_correccion(p_becario, p_accion, p_asistencia, p_tipo, p_ocurrido_en, p_modalidad, p_motivo, p_antes);

  perform public._aplicar_correccion(
    p_becario, p_accion, p_asistencia, c.v_tipo, c.v_ocurrido_en, c.v_modalidad, c.v_motivo, null
  );
end;
$$;
