-- 0023: Correcciones de seguridad.
--
--  1. asistencias_servidor: la modalidad del cliente se compara con el horario
--     del día (horarios_modalidad) y un registro propio sin puntaje de rostro
--     queda por revisar (motivos 'modalidad_distinta' y 'sin_rostro').
--  2. Se retira el alta automática desde auth.users (Supabase Auth ya no se usa).
--  3. usuarios: clerk_id y correo solo los cambia la sincronización con Clerk;
--     nombre, perfil, estado y matrícula solo un administrador; el autoservicio
--     exige cuenta activa.
--  4. reportes_siase: la API solo escribe el reporte propio; firmar o excluir es
--     exclusivo de firmar_reportes_siase.
--  5. Storage siase: misma ventana y mes que la fila del reporte; tamaño y tipos
--     de archivo limitados en el bucket.
--  6. usuarios_select: un ingeniero inactivo ya no lista a los ingenieros.
--  7. sincronizar_usuario_clerk enlaza por correo solo si Clerk lo verificó.
--
-- Identidad: public.uid_actual() (Clerk), nunca auth.uid().
begin;

-- ---------------------------------------------------------------------------
-- 1) Modalidad y rostro en el registro del becario
-- ---------------------------------------------------------------------------
alter table public.asistencias drop constraint asistencias_motivo_revision_check;
alter table public.asistencias add constraint asistencias_motivo_revision_check
  check (motivo_revision in ('atraso_cola', 'reloj_adelantado', 'sin_ubicacion', 'fuera_de_zona',
                             'sin_rostro', 'modalidad_distinta'));

create or replace function public.asistencias_servidor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := (select public.uid_actual());
  v_tope_min   integer;
  v_atraso_max integer;
  v_atraso     interval;
  v_tol        interval;
  v_modalidad  public.modalidad_trabajo;
begin
  -- Sin usuario (service role, jobs): no se toca nada.
  if v_uid is null then
    return new;
  end if;

  -- Lo que mande el cliente en estas columnas se ignora.
  new.origen := 'en_linea';
  new.revision := 'ok';
  new.motivo_revision := null;

  -- Lo agrega otra persona (ingeniero/administrador): de confianza.
  if v_uid <> new.becario_id then
    new.origen := 'manual';
    return new;
  end if;

  select c.tolerancia_minutos, c.atraso_maximo_minutos
    into v_tope_min, v_atraso_max
  from public.config_asistencia c
  limit 1;
  v_tope_min := coalesce(v_tope_min, 5);
  v_atraso_max := coalesce(v_atraso_max, 60);

  v_tol := make_interval(mins => v_tope_min);
  v_atraso := now() - new.ocurrido_en;

  if v_atraso < -v_tol then
    -- Hora futura: reloj del teléfono adelantado. Se usa la hora del servidor.
    new.ocurrido_en := now();
    new.revision := 'por_revisar';
    new.motivo_revision := 'reloj_adelantado';
  elsif v_atraso > v_tol then
    new.origen := 'cola';
    if v_atraso > make_interval(mins => v_atraso_max) then
      new.revision := 'por_revisar';
      new.motivo_revision := 'atraso_cola';
    end if;
  end if;

  -- Modalidad esperada: la del horario para el día local del registro. Sin
  -- horario ese día es presencial, igual que la app (modalidadDeHoy).
  select h.modalidad into v_modalidad
  from public.horarios_modalidad h
  where h.becario_id = new.becario_id
    and h.dia_semana = extract(dow from new.ocurrido_en at time zone 'America/Monterrey');
  v_modalidad := coalesce(v_modalidad, 'presencial');

  -- La app siempre verifica el rostro antes de registrar; sin puntaje no hubo verificación.
  if new.revision = 'ok' and new.puntaje_rostro is null then
    new.revision := 'por_revisar';
    new.motivo_revision := 'sin_rostro';
  elsif new.revision = 'ok' and new.modalidad <> v_modalidad then
    new.revision := 'por_revisar';
    new.motivo_revision := 'modalidad_distinta';
  end if;

  -- Geocerca: solo si hay zonas activas, es presencial y todavía está ok.
  if new.revision = 'ok'
     and new.modalidad = 'presencial'
     and exists (select 1 from public.geocercas g where g.activa) then
    if new.latitud is null or new.longitud is null then
      new.revision := 'por_revisar';
      new.motivo_revision := 'sin_ubicacion';
    elsif not exists (
      select 1 from public.geocercas g
      where g.activa
        and public._distancia_m(
              new.latitud::double precision, new.longitud::double precision,
              g.latitud::double precision, g.longitud::double precision
            ) <= g.radio_m
    ) then
      new.revision := 'por_revisar';
      new.motivo_revision := 'fuera_de_zona';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.asistencias_servidor() from public, anon, authenticated;

-- Igual que en 0021, con el detalle de los dos motivos nuevos.
create or replace function public.anomalias_asistencia(
  p_becario uuid default null,
  p_desde   date default null,
  p_hasta   date default null
)
returns table (
  tipo           text,
  becario_id     uuid,
  becario_nombre text,
  asistencia_id  uuid,
  entrada_id     uuid,
  ocurrido_en    timestamptz,
  fecha          date,
  horas          numeric,
  atraso_minutos integer,
  detalle        text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid    uuid := (select public.uid_actual());
  v_perfil public.perfil_usuario;
  v_estado public.estado_usuario;
  v_desde  date;
  v_hasta  date;
  v_tope   numeric;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para ver los registros por revisar.';
  end if;
  select u.perfil, u.estado into v_perfil, v_estado from public.usuarios u where u.id = v_uid;
  if v_estado is distinct from 'activo' then
    raise exception 'Tu cuenta no está activa.';
  end if;

  v_desde := coalesce(p_desde, public.hoy_local() - 30);
  v_hasta := coalesce(p_hasta, public.hoy_local());
  select coalesce((select c.jornada_maxima_horas from public.config_asistencia c limit 1), 10) into v_tope;

  if p_becario is not null and not exists (
    select 1 from public.usuarios u
    where u.id = p_becario and u.perfil = 'becario' and u.estado = 'activo'
      and (v_perfil = 'administrador'
           or (v_perfil = 'ingeniero' and public.es_ingeniero_de(u.id))
           or u.id = v_uid)
  ) then
    raise exception 'No tienes acceso a los registros de ese becario.';
  end if;

  return query
  with visibles as (
    select u.id, u.nombre
    from public.usuarios u
    where u.perfil = 'becario'
      and u.estado = 'activo'
      and (p_becario is null or u.id = p_becario)
      and (v_perfil = 'administrador'
           or (v_perfil = 'ingeniero' and public.es_ingeniero_de(u.id))
           or u.id = v_uid)
  ),
  ev as (
    select
      a.id, a.becario_id, v.nombre, a.tipo, a.ocurrido_en, a.revision, a.origen,
      a.motivo_revision, a.created_at,
      (a.ocurrido_en at time zone 'America/Monterrey')::date as dia,
      lead(a.id)          over w as sig_id,
      lead(a.tipo)        over w as sig_tipo,
      lead(a.ocurrido_en) over w as sig_en,
      lead(a.revision)    over w as sig_revision,
      lead(a.origen)      over w as sig_origen
    from public.asistencias a
    join visibles v on v.id = a.becario_id
    where (a.ocurrido_en at time zone 'America/Monterrey')::date between v_desde and v_hasta
    window w as (partition by a.becario_id order by a.ocurrido_en)
  ),
  filas as (
    -- Entrada sin salida el mismo día local.
    select 'turno_abierto'::text as tipo, e.becario_id, e.nombre as becario_nombre,
           e.id as asistencia_id, null::uuid as entrada_id, e.ocurrido_en, e.dia as fecha,
           case when e.dia = public.hoy_local()
                then round((extract(epoch from (now() - e.ocurrido_en)) / 3600.0)::numeric, 2) end as horas,
           null::integer as atraso_minutos,
           case when e.dia = public.hoy_local()
                then 'Entrada sin salida; lleva más de ' || trim(to_char(v_tope, 'FM990.9')) || ' horas abierta.'
                else 'Entrada sin salida el mismo día.' end as detalle
    from ev e
    where e.tipo = 'entrada'
      and e.revision <> 'aprobada'
      and not coalesce(
            e.sig_tipo = 'salida'
            and (e.sig_en at time zone 'America/Monterrey')::date = e.dia,
            false)
      and (e.dia < public.hoy_local()
           or (e.dia = public.hoy_local()
               and extract(epoch from (now() - e.ocurrido_en)) / 3600.0 > v_tope))

    union all
    -- Jornada que pasa el tope sin salida aprobada ni manual.
    select 'jornada_larga', e.becario_id, e.nombre,
           e.sig_id, e.id, e.sig_en, (e.sig_en at time zone 'America/Monterrey')::date,
           round((extract(epoch from (e.sig_en - e.ocurrido_en)) / 3600.0)::numeric, 2),
           null::integer,
           'Jornada de ' || trim(to_char(extract(epoch from (e.sig_en - e.ocurrido_en)) / 3600.0, 'FM990.9'))
             || ' horas; pasa el tope de ' || trim(to_char(v_tope, 'FM990.9')) || ' y no suma hasta aprobarla.'
    from ev e
    where e.tipo = 'entrada'
      and e.sig_tipo = 'salida'
      and (e.sig_en at time zone 'America/Monterrey')::date = e.dia
      and extract(epoch from (e.sig_en - e.ocurrido_en)) / 3600.0 > v_tope
      and e.sig_revision <> 'aprobada'
      and e.sig_origen <> 'manual'

    union all
    -- Registros marcados por el servidor.
    select case e.motivo_revision when 'atraso_cola' then 'atraso' else e.motivo_revision end,
           e.becario_id, e.nombre, e.id, null::uuid, e.ocurrido_en, e.dia, null::numeric,
           case when e.motivo_revision = 'atraso_cola'
                then floor(extract(epoch from (e.created_at - e.ocurrido_en)) / 60.0)::integer end,
           case e.motivo_revision
             when 'atraso_cola' then 'Registro enviado con mucho atraso (sin red); no suma hasta aprobarlo.'
             when 'reloj_adelantado' then 'El reloj del teléfono estaba adelantado; se usó la hora del servidor.'
             when 'sin_ubicacion' then 'Registro presencial sin ubicación.'
             when 'sin_rostro' then 'Registro sin verificación facial.'
             when 'modalidad_distinta' then 'La modalidad no coincide con el horario de ese día.'
             else 'Registro presencial fuera de las zonas permitidas.'
           end
    from ev e
    where e.revision = 'por_revisar'
      and e.motivo_revision is not null
  )
  select f.tipo, f.becario_id, f.becario_nombre, f.asistencia_id, f.entrada_id, f.ocurrido_en,
         f.fecha, f.horas, f.atraso_minutos, f.detalle
  from filas f
  order by f.fecha desc, f.becario_nombre, f.ocurrido_en desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Alta automática desde Supabase Auth (0003): las cuentas nacen en Clerk.
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.manejar_nuevo_usuario();

-- ---------------------------------------------------------------------------
-- 3) Campos protegidos de usuarios. Sin SECURITY DEFINER a propósito:
--    current_user es quien escribe. La API llega como authenticated; las RPC
--    SECURITY DEFINER (sincronizar_usuario_clerk, cambiar_estado_usuario...),
--    service_role y las migraciones no, y pasan. Ya no depende del ajuste
--    docencheck.sincronizando_clerk.
-- ---------------------------------------------------------------------------
create or replace function public.proteger_campos_usuario()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.clerk_id is distinct from old.clerk_id or new.email is distinct from old.email then
    raise exception 'El correo y la cuenta de acceso solo se cambian desde Clerk.';
  end if;
  if not public.es_admin()
     and (new.nombre is distinct from old.nombre
          or new.perfil is distinct from old.perfil
          or new.estado is distinct from old.estado
          or new.matricula is distinct from old.matricula) then
    raise exception 'Solo un administrador puede cambiar nombre, perfil, estado o matrícula.';
  end if;
  return new;
end;
$$;

revoke execute on function public.proteger_campos_usuario() from public, anon, authenticated;

drop policy usuarios_update on public.usuarios;
create policy usuarios_update on public.usuarios
  for update to authenticated
  using ((id = (select public.uid_actual()) and (select public.usuario_activo())) or public.es_admin())
  with check ((id = (select public.uid_actual()) and (select public.usuario_activo())) or public.es_admin());

-- ---------------------------------------------------------------------------
-- 4) reportes_siase: solo el becario escribe su fila (el trigger de 0014 limita
--    estado, mes y ventana). Firmar o excluir: firmar_reportes_siase.
-- ---------------------------------------------------------------------------
drop policy reportes_insert_propio on public.reportes_siase;
create policy reportes_insert_propio on public.reportes_siase
  for insert to authenticated
  with check (becario_id = (select public.uid_actual()));

drop policy reportes_update on public.reportes_siase;
create policy reportes_update on public.reportes_siase
  for update to authenticated
  using (becario_id = (select public.uid_actual()))
  with check (becario_id = (select public.uid_actual()));

-- ---------------------------------------------------------------------------
-- 5) Storage siase: carpeta <becario>/<mes en curso>/, ventana abierta, mes no
--    revisado. Límites del bucket iguales a los de la app (10 MB, PDF o imagen).
-- ---------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = array['application/pdf', 'image/*']
where id = 'siase';

drop policy siase_insert on storage.objects;
drop policy siase_update on storage.objects;

create policy siase_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'siase'
    and (storage.foldername(name))[1] = (select public.uid_actual())::text
    and (storage.foldername(name))[2] = date_trunc('month', public.hoy_local())::date::text
    and (select public.usuario_activo())
    and coalesce((select e.abierta from public.estado_ventana_siase(public.hoy_local()) e), false)
    and not exists (
      select 1 from public.reportes_siase r
      where r.becario_id = (select public.uid_actual())
        and r.mes::text = (storage.foldername(name))[2]
        and r.estado in ('confirmado', 'excluido', 'sin_reporte')
    )
  );

create policy siase_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'siase'
    and (storage.foldername(name))[1] = (select public.uid_actual())::text
  )
  with check (
    bucket_id = 'siase'
    and (storage.foldername(name))[1] = (select public.uid_actual())::text
    and (storage.foldername(name))[2] = date_trunc('month', public.hoy_local())::date::text
    and (select public.usuario_activo())
    and coalesce((select e.abierta from public.estado_ventana_siase(public.hoy_local()) e), false)
    and not exists (
      select 1 from public.reportes_siase r
      where r.becario_id = (select public.uid_actual())
        and r.mes::text = (storage.foldername(name))[2]
        and r.estado in ('confirmado', 'excluido', 'sin_reporte')
    )
  );

-- ---------------------------------------------------------------------------
-- 6) Solo un ingeniero activo ve a los demás ingenieros (destino de traspaso).
-- ---------------------------------------------------------------------------
drop policy usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios
  for select to authenticated
  using (
    id = (select public.uid_actual())
    or public.es_admin()
    or public.es_ingeniero_de(id)
    or (perfil = 'ingeniero' and public.perfil_actual() = 'ingeniero' and (select public.usuario_activo()))
    or (perfil = 'ingeniero' and public.es_mi_ingeniero(id))
  );

-- ---------------------------------------------------------------------------
-- 7) Sincronización con Clerk. Un correo sin verificar no enlaza una cuenta
--    existente ni se guarda (evita tomar la cuenta de otro con su correo).
-- ---------------------------------------------------------------------------
drop function public.sincronizar_usuario_clerk(text, text, text, text, text, text, boolean, text, bigint);

create function public.sincronizar_usuario_clerk(
  p_clerk_id text,
  p_email text,
  p_nombre text,
  p_perfil text,
  p_matricula text,
  p_coordinacion text,
  p_bloqueado boolean,
  p_estado text default null,
  p_actualizado_en bigint default 0,
  p_correo_verificado boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_perfil public.perfil_usuario;
  v_estado public.estado_usuario;
  v_email text := case when p_correo_verificado then nullif(lower(trim(p_email)), '') end;
begin
  -- La fila serializa entregas concurrentes; un evento viejo no restaura acceso.
  insert into public.clerk_sincronizacion as actual (clerk_id, actualizado_en, eliminado)
  values (p_clerk_id, p_actualizado_en, false)
  on conflict (clerk_id) do update set actualizado_en = excluded.actualizado_en
  where not actual.eliminado and actual.actualizado_en < excluded.actualizado_en;
  if not found then
    select id into v_id from public.usuarios where clerk_id = p_clerk_id;
    return v_id;
  end if;

  begin
    v_perfil := nullif(trim(p_perfil), '')::public.perfil_usuario;
  exception when invalid_text_representation then
    v_perfil := null;
  end;

  select id into v_id from public.usuarios where clerk_id = p_clerk_id;
  if v_id is null and v_email is not null then
    select id into v_id from public.usuarios where lower(email) = v_email and clerk_id is null;
  end if;

  -- Correo sin verificar que coincide con una cuenta sin enlazar: no se crea un
  -- duplicado; se enlaza cuando llegue el evento con el correo verificado.
  if v_id is null and not p_correo_verificado and exists (
    select 1 from public.usuarios
    where lower(email) = nullif(lower(trim(p_email)), '') and clerk_id is null
  ) then
    return null;
  end if;

  if v_id is null then
    v_estado := case
      when p_bloqueado or v_perfil is null then 'inactivo'
      when p_estado = 'egresado' then 'egresado'
      else 'activo'
    end;
    insert into public.usuarios (clerk_id, email, nombre, matricula, perfil, coordinacion, estado)
    values (
      p_clerk_id,
      v_email,
      coalesce(nullif(trim(p_nombre), ''), split_part(coalesce(v_email, p_clerk_id), '@', 1)),
      coalesce(nullif(trim(p_matricula), ''), p_clerk_id),
      coalesce(v_perfil, 'becario'),
      nullif(trim(p_coordinacion), ''),
      v_estado
    )
    returning id into v_id;
  else
    update public.usuarios u
    set clerk_id = p_clerk_id,
        email = coalesce(v_email, u.email),
        nombre = coalesce(nullif(trim(p_nombre), ''), u.nombre),
        matricula = coalesce(nullif(trim(p_matricula), ''), u.matricula),
        coordinacion = coalesce(nullif(trim(p_coordinacion), ''), u.coordinacion),
        perfil = coalesce(v_perfil, u.perfil),
        estado = case
          when p_bloqueado then 'inactivo'::public.estado_usuario
          when p_estado = 'egresado' then 'egresado'::public.estado_usuario
          -- Recibió perfil (acceso) o se desbloqueó: vuelve a estar activo.
          when v_perfil is not null then 'activo'::public.estado_usuario
          else u.estado
        end
    where u.id = v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.sincronizar_usuario_clerk(text, text, text, text, text, text, boolean, text, bigint, boolean) from public, anon, authenticated;
grant execute on function public.sincronizar_usuario_clerk(text, text, text, text, text, text, boolean, text, bigint, boolean) to service_role;

commit;
