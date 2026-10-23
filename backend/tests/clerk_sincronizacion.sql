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
end;
$$;
rollback;
