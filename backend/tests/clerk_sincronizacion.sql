-- Ejecutar después de 0020. Todo se revierte, incluso si una aserción falla.
begin;
do $$
declare
  v_ingeniero uuid;
  v_becario uuid;
  v_clerk text := 'test_' || gen_random_uuid()::text;
  v_otro text := 'test_' || gen_random_uuid()::text;
begin
  v_ingeniero := public.sincronizar_usuario_clerk(v_clerk, null, 'Prueba', 'ingeniero', null, null, false, null, 100);
  v_becario := public.sincronizar_usuario_clerk(v_otro, null, 'Prueba', 'becario', null, null, false, null, 100);
  insert into public.ingenieros_becarios (ingeniero_id, becario_id) values (v_ingeniero, v_becario);
  perform set_config('request.jwt.claims', json_build_object('sub', v_clerk, 'role', 'authenticated')::text, true);
  if not public.es_ingeniero_de(v_becario) then
    raise exception 'El ingeniero asignado debe tener acceso';
  end if;

  perform public.sincronizar_usuario_clerk(v_clerk, null, 'Prueba', 'becario', null, null, false, null, 200);
  if public.es_ingeniero_de(v_becario) then
    raise exception 'Cambiar el perfil debe quitar acceso al equipo';
  end if;
  perform public.sincronizar_usuario_clerk(v_clerk, null, 'Prueba', 'administrador', null, null, false, null, 150);
  if (select perfil <> 'becario' from public.usuarios where id = v_ingeniero) then
    raise exception 'Un evento atrasado no debe restaurar permisos';
  end if;

  perform public.desactivar_usuario_clerk(v_clerk, 300);
  perform public.sincronizar_usuario_clerk(v_clerk, null, 'Prueba', 'administrador', null, null, false, null, 400);
  if (select estado <> 'inactivo' from public.usuarios where id = v_ingeniero) then
    raise exception 'Un usuario eliminado no debe reactivarse';
  end if;

  v_clerk := 'test_' || gen_random_uuid()::text;
  perform public.desactivar_usuario_clerk(v_clerk, 300);
  perform public.sincronizar_usuario_clerk(v_clerk, null, 'Prueba', 'administrador', null, null, false, null, 100);
  if exists (select 1 from public.usuarios where clerk_id = v_clerk) then
    raise exception 'Una baja anterior al alta debe impedir su recreación';
  end if;

  -- 0023: solo un correo verificado enlaza una cuenta existente sin clerk_id.
  insert into public.usuarios (email, nombre, matricula, perfil, estado)
  values ('legado@prueba.test', 'Legado', 'test_legado', 'becario', 'activo') returning id into v_becario;
  v_clerk := 'test_' || gen_random_uuid()::text;
  if public.sincronizar_usuario_clerk(v_clerk, 'legado@prueba.test', 'X', null, null, null, false, null, 100, false) is not null
     or (select clerk_id from public.usuarios where id = v_becario) is not null then
    raise exception 'Un correo sin verificar no debe enlazar ni duplicar la cuenta';
  end if;
  if public.sincronizar_usuario_clerk(v_clerk, 'legado@prueba.test', 'X', null, null, null, false, null, 200, true) <> v_becario then
    raise exception 'Un correo verificado debe enlazar la cuenta existente';
  end if;

  -- 0023: por la API nadie cambia su clerk_id, ni con el ajuste de la sincronización.
  perform set_config('request.jwt.claims', json_build_object('sub', v_clerk, 'role', 'authenticated')::text, true);
  perform set_config('docencheck.sincronizando_clerk', 'on', true);
  set local role authenticated;
  begin
    update public.usuarios set clerk_id = 'test_robado' where id = v_becario;
    raise exception 'FALLÓ: el usuario cambió su clerk_id';
  exception when others then
    if sqlerrm not like '%desde Clerk%' then
      raise;
    end if;
  end;
  reset role;
end;
$$;
rollback;
