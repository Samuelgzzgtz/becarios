-- Ejecutar después de 0026 como dueño de las tablas (postgres). Todo se revierte,
-- incluso si una aserción falla.
begin;

-- Ejecuta p_sql con la sesión de Clerk p_clerk y el rol de la API. Devuelve null
-- si funcionó, o el HINT (si hay) o el mensaje del error. Lo que hace persiste.
create function pg_temp.como(p_clerk text, p_sql text)
returns text
language plpgsql
as $$
declare
  v_msg text;
  v_hint text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_clerk, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    execute 'reset role';
    return coalesce(nullif(v_hint, ''), v_msg);
  end;
  execute 'reset role';
  return null;
end;
$$;

-- Cuántas filas ve p_clerk con RLS en la consulta p_sql (un select count(*)).
create function pg_temp.cuenta_como(p_clerk text, p_sql text)
returns bigint
language plpgsql
as $$
declare
  v bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_clerk, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute p_sql into v;
  execute 'reset role';
  return v;
end;
$$;

create function pg_temp.exige(p_ok boolean, p_mensaje text)
returns void
language plpgsql
as $$
begin
  if p_ok is not true then
    raise exception 'FALLÓ: %', p_mensaje;
  end if;
end;
$$;

-- Afirma que la llamada falló (y, si se da, con ese HINT o un mensaje que lo contenga).
create function pg_temp.falla(p_clerk text, p_sql text, p_esperado text, p_mensaje text)
returns void
language plpgsql
as $$
declare
  v_error text := pg_temp.como(p_clerk, p_sql);
begin
  perform pg_temp.exige(v_error is not null and (p_esperado is null or v_error ilike '%' || p_esperado || '%'),
    p_mensaje || ' (obtuvo: ' || coalesce(v_error, 'sin error') || ')');
end;
$$;

create function pg_temp.funciona(p_clerk text, p_sql text, p_mensaje text)
returns void
language plpgsql
as $$
declare
  v_error text := pg_temp.como(p_clerk, p_sql);
begin
  perform pg_temp.exige(v_error is null, p_mensaje || ' (error: ' || coalesce(v_error, '') || ')');
end;
$$;

do $$
declare
  k_ing text := 'test_' || gen_random_uuid();
  k_ing2 text := 'test_' || gen_random_uuid();
  k_admin text := 'test_' || gen_random_uuid();
  k_bec text := 'test_' || gen_random_uuid();
  k_bec2 text := 'test_' || gen_random_uuid();
  v_ing uuid;
  v_ing2 uuid;
  v_admin uuid;
  v_bec uuid;
  v_bec2 uuid;
  v_entrada uuid;
  v_salida uuid;
  v_otra uuid;
  v_ajena uuid;
  v_sol uuid;
  v_sol2 uuid;
  v_auditoria bigint;
  v_snapshot jsonb;
  v_conflicto uuid;
  t0 timestamptz := date_trunc('minute', now()) - interval '3 days';
begin
  -- Fixtures: ingeniero con becario, otro ingeniero con otro becario, admin.
  v_ing := public.sincronizar_usuario_clerk(k_ing, null, 'Ing Uno', 'ingeniero', null, null, false, null, 100);
  v_ing2 := public.sincronizar_usuario_clerk(k_ing2, null, 'Ing Dos', 'ingeniero', null, null, false, null, 100);
  v_admin := public.sincronizar_usuario_clerk(k_admin, null, 'Admin', 'administrador', null, null, false, null, 100);
  v_bec := public.sincronizar_usuario_clerk(k_bec, null, 'Becario Uno', 'becario', null, null, false, null, 100);
  v_bec2 := public.sincronizar_usuario_clerk(k_bec2, null, 'Becario Dos', 'becario', null, null, false, null, 100);
  insert into public.ingenieros_becarios (ingeniero_id, becario_id) values (v_ing, v_bec), (v_ing2, v_bec2);

  -- Registros previos insertados sin sesión (sistema): también se auditan.
  perform set_config('request.jwt.claims', '', true);
  insert into public.asistencias (becario_id, tipo, ocurrido_en, modalidad)
  values (v_bec, 'entrada', t0, 'presencial') returning id into v_entrada;
  insert into public.asistencias (becario_id, tipo, ocurrido_en, modalidad)
  values (v_bec, 'salida', t0 + interval '8 hours', 'presencial') returning id into v_salida;
  insert into public.asistencias (becario_id, tipo, ocurrido_en, modalidad)
  values (v_bec, 'entrada', t0 + interval '1 day', 'presencial') returning id into v_otra;
  insert into public.asistencias (becario_id, tipo, ocurrido_en, modalidad)
  values (v_bec2, 'entrada', t0, 'presencial') returning id into v_ajena;
  perform pg_temp.exige(
    (select hecho_por is null and accion = 'agregar' and motivo is null
     from public.bitacora_asistencias where asistencia_id = v_entrada),
    'El insert de sistema se audita sin actor');

  -- ------------------------------------------------------------------ registro automático
  perform pg_temp.funciona(k_bec, format(
    'insert into public.asistencias (becario_id, tipo, ocurrido_en, modalidad) values (%L, ''entrada'', now(), ''presencial'')', v_bec),
    'El becario registra su asistencia');
  perform pg_temp.exige(
    (select count(*) = 1 from public.bitacora_asistencias a
     where a.becario_id = v_bec and a.accion = 'agregar' and a.hecho_por = v_bec
       and a.actor_nombre = 'Becario Uno' and a.motivo is null and a.antes is null and a.despues is not null),
    'El registro automático queda auditado con el becario como actor');
  perform pg_temp.falla(k_bec, format(
    'insert into public.asistencias (becario_id, tipo, ocurrido_en, modalidad, verificado_por) values (%L, ''salida'', now() - interval ''2 hours'', ''presencial'', %L)', v_bec, v_ing),
    null, 'El becario no puede falsificar verificado_por');
  perform pg_temp.falla(k_bec, format(
    'insert into public.asistencias (becario_id, tipo, ocurrido_en, modalidad) values (%L, ''entrada'', now() - interval ''2 hours'', ''presencial'')', v_bec2),
    null, 'El becario no registra por otro');

  -- ------------------------------------------------------------------ bypass de supervisores
  perform pg_temp.falla(k_ing, format(
    'insert into public.asistencias (becario_id, tipo, ocurrido_en, modalidad, verificado_por) values (%L, ''salida'', now() - interval ''3 hours'', ''presencial'', %L)', v_bec, v_ing),
    null, 'El ingeniero ya no inserta directo');
  perform pg_temp.falla(k_ing, format('update public.asistencias set modalidad = ''home_office'' where id = %L', v_entrada),
    'permission denied', 'El ingeniero ya no modifica directo');
  perform pg_temp.falla(k_admin, format('delete from public.asistencias where id = %L', v_entrada),
    'permission denied', 'El admin ya no borra directo');

  -- ------------------------------------------------------------------ corregir_asistencia
  perform pg_temp.falla(k_ing, format(
    'select public.corregir_asistencia(%L, ''modificar'', %L, null, null, ''home_office'', ''   '')', v_bec, v_entrada),
    'motivo', 'Corregir exige motivo');
  perform pg_temp.falla(k_ing, format(
    'select public.corregir_asistencia(%L, ''modificar'', %L, null, null, ''home_office'', %L)', v_bec, v_entrada, repeat('x', 501)),
    'motivo', 'El motivo tiene límite de longitud');
  perform pg_temp.falla(k_ing2, format(
    'select public.corregir_asistencia(%L, ''modificar'', %L, null, null, ''home_office'', ''Error'')', v_bec, v_entrada),
    'Solo el ingeniero asignado', 'Un ingeniero no asignado no corrige');
  perform pg_temp.falla(k_bec, format(
    'select public.corregir_asistencia(%L, ''modificar'', %L, null, null, ''home_office'', ''Error'')', v_bec, v_entrada),
    'Solo el ingeniero asignado', 'El becario no se corrige directo');
  perform pg_temp.falla(k_ing, format(
    'select public.corregir_asistencia(%L, ''modificar'', %L, null, null, ''home_office'', ''Error'')', v_bec, v_ajena),
    'no existe', 'No se corrige un registro de otro becario por su id');
  perform pg_temp.falla(k_ing, format(
    'select public.corregir_asistencia(%L, ''agregar'', null, ''salida'', now() + interval ''1 hour'', ''presencial'', ''Olvidó'')', v_bec),
    'futuro', 'No se agregan registros en el futuro');
  perform pg_temp.falla(k_ing, format(
    'select public.corregir_asistencia(%L, ''modificar'', %L, ''entrada'', null, null, ''Nada'')', v_bec, v_entrada),
    'no cambia', 'Una corrección sin cambios se rechaza');
  perform pg_temp.falla(k_ing, format(
    'select public.corregir_asistencia(%L, ''agregar'', null, ''salida'', %L, ''presencial'', ''Duplicada'')', v_bec, t0 + interval '30 seconds'),
    'asistencia_duplicada', 'Agregar respeta el anti-duplicado');
  perform pg_temp.falla(k_ing, format(
    'select public.corregir_asistencia(%L, ''modificar'', %L, null, %L, null, ''Mover'')', v_bec, v_otra, t0 + interval '8 hours 30 seconds'),
    'asistencia_duplicada', 'Modificar respeta el anti-duplicado');

  perform pg_temp.funciona(k_ing, format(
    'select public.corregir_asistencia(%L, ''agregar'', null, ''salida'', %L, ''presencial'', ''Olvidó registrar la salida'')',
    v_bec, t0 + interval '1 day 6 hours'),
    'El ingeniero agrega una salida con motivo');
  perform pg_temp.exige(
    (select verificado_por = v_ing from public.asistencias where becario_id = v_bec and ocurrido_en = t0 + interval '1 day 6 hours'),
    'La corrección marca verificado_por con el supervisor real');
  perform pg_temp.exige(
    (select count(*) = 1 from public.bitacora_asistencias a
     where a.becario_id = v_bec and a.accion = 'agregar' and a.hecho_por = v_ing
       and a.actor_nombre = 'Ing Uno' and a.motivo = 'Olvidó registrar la salida' and a.solicitud_id is null),
    'La corrección directa queda auditada con actor y motivo');

  -- ------------------------------------------------------------------ solicitar
  perform pg_temp.falla(k_ing, format(
    'select public.solicitar_correccion_asistencia(''eliminar'', %L, p_motivo => ''x'')', v_entrada),
    'becario activo', 'Un ingeniero no solicita');
  perform pg_temp.falla(k_bec2, format(
    'select public.solicitar_correccion_asistencia(''eliminar'', %L, p_motivo => ''x'')', v_entrada),
    'no existe', 'Un becario no solicita sobre registros ajenos');
  perform pg_temp.falla(k_bec, format(
    'select public.solicitar_correccion_asistencia(''modificar'', %L, p_modalidad => ''home_office'')', v_entrada),
    'motivo', 'Solicitar exige motivo');
  perform pg_temp.falla(k_bec,
    'select public.solicitar_correccion_asistencia(''agregar'', null, ''salida'', now() + interval ''1 day'', ''presencial'', ''x'')',
    'futuro', 'No se solicita un registro futuro');
  perform pg_temp.falla(k_bec,
    'select public.solicitar_correccion_asistencia(''borrar'', p_motivo => ''x'')',
    'agregar, modificar o eliminar', 'Acción inválida');

  perform pg_temp.funciona(k_bec, format(
    'select public.solicitar_correccion_asistencia(''modificar'', %L, p_modalidad => ''home_office'', p_motivo => ''Trabajé desde casa'')', v_entrada),
    'El becario solicita modificar');
  select id into v_sol from public.solicitudes_correccion where asistencia_id = v_entrada;
  perform pg_temp.exige(
    (select estado = 'pendiente' and tipo = 'entrada' and ocurrido_en = t0 and modalidad = 'home_office'
       and antes ->> 'modalidad' = 'presencial'
     from public.solicitudes_correccion where id = v_sol),
    'La solicitud guarda los valores finales y el snapshot');
  perform pg_temp.falla(k_bec, format(
    'select public.solicitar_correccion_asistencia(''eliminar'', %L, p_motivo => ''Otra vez'')', v_entrada),
    'solicitud_duplicada', 'Una sola solicitud pendiente por registro');
  perform pg_temp.funciona(k_bec, format(
    'select public.solicitar_correccion_asistencia(''agregar'', null, ''salida'', %L, ''presencial'', ''Olvidé la salida'')', t0 + interval '1 day 9 hours'),
    'El becario solicita agregar');
  perform pg_temp.falla(k_bec, format(
    'select public.solicitar_correccion_asistencia(''agregar'', null, ''salida'', %L, ''presencial'', ''Olvidé la salida'')', t0 + interval '1 day 9 hours'),
    'solicitud_duplicada', 'No se duplica una solicitud de agregar');

  -- ------------------------------------------------------------------ lectura y escritura por RLS/grants
  perform pg_temp.exige(pg_temp.cuenta_como(k_bec, 'select count(*) from public.solicitudes_correccion') = 2, 'El becario ve sus solicitudes');
  perform pg_temp.exige(pg_temp.cuenta_como(k_ing, 'select count(*) from public.solicitudes_correccion') = 2, 'El ingeniero ve las de su equipo');
  perform pg_temp.exige(pg_temp.cuenta_como(k_admin, 'select count(*) from public.solicitudes_correccion') >= 2, 'El admin ve todas');
  perform pg_temp.exige(pg_temp.cuenta_como(k_ing2, 'select count(*) from public.solicitudes_correccion') = 0, 'Otro ingeniero no las ve');
  perform pg_temp.exige(pg_temp.cuenta_como(k_bec2, 'select count(*) from public.solicitudes_correccion') = 0, 'Otro becario no las ve');
  perform pg_temp.exige(pg_temp.cuenta_como(k_bec2, format('select count(*) from public.bitacora_asistencias where becario_id = %L', v_bec)) = 0,
    'Otro becario no ve la auditoría ajena');
  perform pg_temp.exige(pg_temp.cuenta_como(k_ing, format('select count(*) from public.bitacora_asistencias where becario_id = %L', v_bec)) > 0,
    'El ingeniero ve la auditoría de su equipo');

  perform pg_temp.falla(k_bec, format(
    'insert into public.solicitudes_correccion (becario_id, accion, motivo, tipo, ocurrido_en, modalidad) values (%L, ''agregar'', ''x'', ''entrada'', now(), ''presencial'')', v_bec),
    'permission denied', 'Nadie inserta solicitudes sin la RPC');
  perform pg_temp.falla(k_bec, format('update public.solicitudes_correccion set estado = ''aprobada'' where id = %L', v_sol),
    'permission denied', 'El becario no se autoaprueba');
  perform pg_temp.falla(k_admin, 'delete from public.bitacora_asistencias',
    'permission denied', 'La API no borra la auditoría');
  perform pg_temp.falla(k_admin, 'insert into public.bitacora_asistencias (becario_id, asistencia_id, accion) values (gen_random_uuid(), gen_random_uuid(), ''insertar'')',
    'permission denied', 'La API no inserta auditoría');
  begin
    update public.bitacora_asistencias set motivo = 'alterado' where becario_id = v_bec;
    raise exception 'FALLÓ: el dueño pudo editar la auditoría';
  exception when others then
    perform pg_temp.exige(sqlerrm like '%no se puede modificar%', 'La auditoría es append-only incluso para el dueño: ' || sqlerrm);
  end;

  -- ------------------------------------------------------------------ resolver
  perform pg_temp.falla(k_bec, format('select public.resolver_correccion_asistencia(%L, true, ''ok'')', v_sol),
    'solo su ingeniero asignado', 'El becario no resuelve');
  perform pg_temp.falla(k_ing2, format('select public.resolver_correccion_asistencia(%L, true, ''ok'')', v_sol),
    'solo su ingeniero asignado', 'Un ingeniero no asignado no resuelve');
  perform pg_temp.falla(k_ing, format('select public.resolver_correccion_asistencia(%L, true, '' '')', v_sol),
    'respuesta', 'Resolver exige respuesta');

  v_auditoria := (select count(*) from public.bitacora_asistencias where asistencia_id = v_entrada);
  perform pg_temp.funciona(k_ing, format('select public.resolver_correccion_asistencia(%L, true, ''Aprobado'')', v_sol),
    'El ingeniero aprueba');
  perform pg_temp.exige(
    (select modalidad = 'home_office' and verificado_por = v_ing from public.asistencias where id = v_entrada),
    'Aprobar aplica la corrección');
  perform pg_temp.exige(
    (select estado = 'aprobada' and resuelto_por = v_ing and resuelto_en is not null and respuesta = 'Aprobado'
     from public.solicitudes_correccion where id = v_sol),
    'La solicitud queda aprobada');
  perform pg_temp.exige(
    (select count(*) = v_auditoria + 1 from public.bitacora_asistencias where asistencia_id = v_entrada)
    and exists (
      select 1 from public.bitacora_asistencias
      where asistencia_id = v_entrada and accion = 'editar' and hecho_por = v_ing and solicitud_id = v_sol
        and motivo = 'Trabajé desde casa' and antes ->> 'modalidad' = 'presencial' and despues ->> 'modalidad' = 'home_office'),
    'La aprobación queda auditada una sola vez con solicitud, motivo, antes y después');

  -- Idempotencia secuencial: la segunda resolución no vuelve a aplicar nada.
  perform pg_temp.falla(k_ing, format('select public.resolver_correccion_asistencia(%L, true, ''Otra vez'')', v_sol),
    'solicitud_resuelta', 'No se aprueba dos veces');
  perform pg_temp.falla(k_ing, format('select public.resolver_correccion_asistencia(%L, false, ''Tarde'')', v_sol),
    'solicitud_resuelta', 'No se rechaza una aprobada');
  perform pg_temp.exige(
    (select count(*) = v_auditoria + 1 from public.bitacora_asistencias where asistencia_id = v_entrada),
    'Reintentar no agrega auditoría');

  -- Snapshot obsoleto por modificación directa: se rechaza aprobar, luego se rechaza la solicitud.
  perform pg_temp.funciona(k_bec, format(
    'select public.solicitar_correccion_asistencia(''eliminar'', %L, p_motivo => ''No vine'')', v_salida),
    'El becario solicita eliminar');
  select id into v_sol2 from public.solicitudes_correccion where asistencia_id = v_salida and estado = 'pendiente';
  perform pg_temp.funciona(k_ing, format(
    'select public.corregir_asistencia(%L, ''modificar'', %L, null, %L, null, ''Hora real'')', v_bec, v_salida, t0 + interval '7 hours'),
    'El ingeniero corrige directo mientras hay solicitud');
  perform pg_temp.falla(k_ing, format('select public.resolver_correccion_asistencia(%L, true, ''Ok'')', v_sol2),
    'solicitud_obsoleta', 'Aprobar con snapshot viejo se rechaza');
  perform pg_temp.exige(
    (select estado = 'pendiente' from public.solicitudes_correccion where id = v_sol2)
    and exists (select 1 from public.asistencias where id = v_salida),
    'La aprobación obsoleta no cambia nada');
  perform pg_temp.funciona(k_ing, format('select public.resolver_correccion_asistencia(%L, false, ''Ya la corregí'')', v_sol2),
    'Se puede rechazar la obsoleta');
  perform pg_temp.exige(
    (select estado = 'rechazada' and respuesta = 'Ya la corregí' from public.solicitudes_correccion where id = v_sol2)
    and exists (select 1 from public.asistencias where id = v_salida),
    'Rechazar no toca la asistencia');

  -- Snapshot obsoleto por borrado.
  perform pg_temp.funciona(k_bec, format(
    'select public.solicitar_correccion_asistencia(''modificar'', %L, p_modalidad => ''home_office'', p_motivo => ''Fue en casa'')', v_otra),
    'El becario solicita modificar otro registro');
  select id into v_sol2 from public.solicitudes_correccion where asistencia_id = v_otra and estado = 'pendiente';
  perform pg_temp.falla(k_admin, format(
    'select public.corregir_asistencia(%L, ''eliminar'', %L, null, null, null, ''Registro inválido'')', v_bec, v_otra),
    'Solo el ingeniero asignado', 'El admin ya no corrige (0026)');
  perform pg_temp.funciona(k_ing, format(
    'select public.corregir_asistencia(%L, ''eliminar'', %L, null, null, null, ''Registro inválido'')', v_bec, v_otra),
    'El ingeniero elimina con motivo');
  perform pg_temp.exige(
    exists (select 1 from public.bitacora_asistencias
            where asistencia_id = v_otra and accion = 'eliminar' and hecho_por = v_ing
              and motivo = 'Registro inválido' and antes is not null and despues is null),
    'El borrado queda auditado y la auditoría sobrevive a la asistencia');
  perform pg_temp.falla(k_ing, format('select public.resolver_correccion_asistencia(%L, true, ''Ok'')', v_sol2),
    'solicitud_obsoleta', 'Aprobar sobre un registro borrado se rechaza');

  -- Aprobar un agregar: el admin ya no resuelve (0026); el ingeniero sí.
  select id into v_sol2 from public.solicitudes_correccion where becario_id = v_bec and accion = 'agregar' and estado = 'pendiente';
  perform pg_temp.falla(k_admin, format('select public.resolver_correccion_asistencia(%L, true, ''Confirmado'')', v_sol2),
    'solo su ingeniero asignado', 'El admin ya no resuelve solicitudes (0026)');
  perform pg_temp.funciona(k_ing, format('select public.resolver_correccion_asistencia(%L, true, ''Confirmado'')', v_sol2),
    'El ingeniero aprueba agregar');
  perform pg_temp.exige(
    exists (select 1 from public.asistencias
            where becario_id = v_bec and ocurrido_en = t0 + interval '1 day 9 hours' and verificado_por = v_ing),
    'Aprobar agregar crea el registro verificado por quien aprobó');

  -- Un formulario abierto antes de otra corrección no puede sobrescribirla.
  perform set_config('request.jwt.claims', '', true);
  insert into public.asistencias (becario_id, tipo, ocurrido_en, modalidad)
  values (v_bec, 'entrada', t0 + interval '2 days 42.123 seconds', 'presencial') returning id into v_conflicto;
  select to_jsonb(a) into v_snapshot from public.asistencias a where a.id = v_conflicto;
  perform pg_temp.funciona(k_ing, format(
    'select public.corregir_asistencia(%L, ''modificar'', %L, null, null, ''home_office'', ''Modalidad real'')', v_bec, v_conflicto),
    'El primer supervisor corrige la modalidad');
  perform pg_temp.falla(k_ing, format(
    'select public.corregir_asistencia(%L, ''modificar'', %L, ''salida'', null, ''presencial'', ''Formulario viejo'', %L::jsonb)', v_bec, v_conflicto, v_snapshot),
    'solicitud_obsoleta', 'Una corrección directa detecta el formulario viejo');
  perform pg_temp.falla(k_bec, format(
    'select public.solicitar_correccion_asistencia(''modificar'', %L, ''salida'', null, ''presencial'', ''Formulario viejo'', %L::jsonb)', v_conflicto, v_snapshot),
    'solicitud_obsoleta', 'Solicitar también detecta cambios anteriores al envío');
  perform pg_temp.exige(
    (select modalidad = 'home_office' and ocurrido_en = t0 + interval '2 days 42.123 seconds' from public.asistencias where id = v_conflicto),
    'Los conflictos no sobrescriben valores y cambiar modalidad conserva precisión');
  perform set_config('TimeZone', 'America/Monterrey', true);
  select to_jsonb(a) into v_snapshot from public.asistencias a where a.id = v_conflicto;
  perform set_config('TimeZone', 'UTC', true);
  perform pg_temp.funciona(k_ing, format(
    'select public.corregir_asistencia(%L, ''modificar'', %L, ''salida'', null, null, ''Tipo correcto'', %L::jsonb)', v_bec, v_conflicto, v_snapshot),
    'Una instantánea en otra zona horaria representa la misma fila');

  -- La revisión independiente no invalida una solicitud de modalidad.
  perform set_config('request.jwt.claims', '', true);
  insert into public.asistencias(becario_id,tipo,ocurrido_en,modalidad,revision,motivo_revision)
  values(v_bec,'salida',t0 + interval '2 days 6 hours','presencial','por_revisar','fuera_de_zona') returning id into v_conflicto;
  perform pg_temp.funciona(k_bec, format(
    'select public.solicitar_correccion_asistencia(''modificar'', %L, p_modalidad => ''home_office'', p_motivo => ''Trabajé desde casa'')', v_conflicto),
    'Se solicita una corrección de modalidad');
  select id into v_sol2 from public.solicitudes_correccion where asistencia_id=v_conflicto and estado='pendiente';
  perform pg_temp.falla(k_admin, format('select public.aprobar_asistencia(%L)',v_conflicto),
    'Solo el ingeniero asignado', 'El admin ya no aprueba (0026)');
  perform pg_temp.funciona(k_ing, format('select public.aprobar_asistencia(%L)',v_conflicto),
    'El ingeniero revisa la marcación');
  perform pg_temp.funciona(k_ing, format('select public.resolver_correccion_asistencia(%L,true,''Modalidad confirmada'')',v_sol2),
    'Revisar no vuelve obsoleta una corrección cuyos datos siguen iguales');
  perform pg_temp.exige((select modalidad='home_office' from public.asistencias where id=v_conflicto),
    'La corrección aprobada se aplica después de la revisión');

  -- ------------------------------------------------------------------ permisos vigentes
  perform public.desactivar_usuario_clerk(k_bec, 999);
  perform pg_temp.falla(k_bec, format(
    'select public.solicitar_correccion_asistencia(''eliminar'', %L, p_motivo => ''x'')', v_entrada),
    'becario activo', 'Un becario inactivo no solicita');
  perform pg_temp.exige(pg_temp.cuenta_como(k_bec, 'select count(*) from public.solicitudes_correccion') = 0,
    'Un becario inactivo deja de ver sus solicitudes');
  perform pg_temp.exige(pg_temp.cuenta_como(k_bec, 'select count(*) from public.bitacora_asistencias') = 0,
    'Un becario inactivo deja de ver su auditoría');

  update public.ingenieros_becarios set activo = false where ingeniero_id = v_ing;
  perform pg_temp.falla(k_ing, format(
    'select public.corregir_asistencia(%L, ''modificar'', %L, null, null, ''presencial'', ''x'')', v_bec, v_entrada),
    'Solo el ingeniero asignado', 'Un ingeniero desasignado ya no corrige');

  -- ------------------------------------------------------------------ cascada de usuario
  perform set_config('request.jwt.claims', '', true);
  v_auditoria := (select count(*) from public.bitacora_asistencias where becario_id = v_bec)
    + (select count(*) from public.asistencias where becario_id = v_bec);
  delete from public.usuarios where id = v_bec;
  perform pg_temp.exige(
    (select count(*) from public.bitacora_asistencias where becario_id = v_bec) = v_auditoria,
    'Borrar al usuario conserva la auditoría previa y audita cada borrado en cascada');
  perform pg_temp.exige(
    not exists (select 1 from public.solicitudes_correccion where becario_id = v_bec),
    'Las solicitudes sí se borran con el usuario');

  raise notice 'correcciones_asistencias: todas las pruebas pasaron';
end;
$$;
rollback;
