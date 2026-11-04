-- Fixture exclusiva de PostgreSQL desechable, creada por ejecutar-local.ps1.
insert into public.usuarios (id,clerk_id,nombre,matricula,perfil,estado) values
('10000000-0000-4000-8000-000000000001','audit_admin','Admin','audit1','administrador','activo'),
('10000000-0000-4000-8000-000000000002','audit_ing','Ingeniero','audit2','ingeniero','activo'),
('10000000-0000-4000-8000-000000000003','audit_bec','Becario','audit3','becario','activo');
insert into public.ingenieros_becarios (ingeniero_id,becario_id) values
('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003');
update public.ventana_siase set dia_apertura=1,dia_cierre=31;

set request.jwt.claims = '{"sub":"audit_bec","role":"authenticated"}';
set role authenticated;
do $$
declare a public.asistencias; h numeric;
begin
  insert into public.asistencias (becario_id,tipo,modalidad,puntaje_rostro,ocurrido_en,revision,origen)
  values ('10000000-0000-4000-8000-000000000003','entrada','presencial',0,now()-interval '2 minutes','aprobada','manual') returning * into a;
  if a.revision <> 'por_revisar' or a.motivo_revision <> 'revision_humana' then raise exception 'Confianza falsificada'; end if;
  insert into public.asistencias (becario_id,tipo,modalidad,puntaje_rostro)
  values ('10000000-0000-4000-8000-000000000003','salida','presencial',1);
  select public.horas_trabajadas(a.becario_id, now()-interval '1 day',now()+interval '1 day') into h;
  if h <> 0 then raise exception 'Un autorregistro sin aprobar suma horas'; end if;
end $$;
reset role;
set request.jwt.claims = '{"sub":"audit_admin","role":"authenticated"}';
set role authenticated;
select public.cambiar_estado_usuario('10000000-0000-4000-8000-000000000003','inactivo');
reset role;
set request.jwt.claims = '';
select public.sincronizar_usuario_clerk('audit_bec',null,'Actualizado','becario',null,null,false,null,100,true);
do $$ begin
  if (select estado <> 'inactivo' from public.usuarios where clerk_id='audit_bec') then raise exception 'Webhook reactiva baja local'; end if;
end $$;
set request.jwt.claims = '{"sub":"audit_admin","role":"authenticated"}';
set role authenticated;
select public.cambiar_estado_usuario('10000000-0000-4000-8000-000000000003','activo');
reset role;
set request.jwt.claims = '';
select public.sincronizar_usuario_clerk('audit_bec',null,'Actualizado','becario',null,null,true,null,200,true);
select public.sincronizar_usuario_clerk('audit_bec',null,'Actualizado','becario',null,null,false,null,300,true);
do $$ begin
  if (select estado <> 'activo' from public.usuarios where clerk_id='audit_bec') then raise exception 'Unban no restaura acceso'; end if;
end $$;

set request.jwt.claims = '{"sub":"audit_ing","role":"authenticated"}';
set role authenticated;
do $$ begin
  begin
    insert into public.transferencias (becario_id,ingeniero_origen,ingeniero_destino,motivo,estado,resuelta_por)
    values ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Falsa','aprobada','10000000-0000-4000-8000-000000000001');
    raise exception 'Aceptó resolución falsificada';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set request.jwt.claims = '{"sub":"audit_bec","role":"authenticated"}';
set role authenticated;
do $$
declare mes date := date_trunc('month',public.hoy_local())::date; ruta text;
begin
  ruta := '10000000-0000-4000-8000-000000000003/' || mes || '/a.pdf';
  begin
    insert into public.reportes_siase (becario_id,periodo_id,mes,archivo_url,estado)
    select '10000000-0000-4000-8000-000000000003',id,mes,'https://attacker.invalid','subido' from public.periodos_academicos where activo;
    raise exception 'Aceptó URL externa';
  exception when raise_exception then
    if sqlerrm not like '%pertenecer%' then raise; end if;
  end;
  begin
    insert into public.reportes_siase (becario_id,periodo_id,mes,archivo_url,estado)
    select '10000000-0000-4000-8000-000000000003',id,mes,ruta,'subido' from public.periodos_academicos where activo;
    raise exception 'Aceptó objeto ausente';
  exception when raise_exception then
    if sqlerrm not like '%no existe%' then raise; end if;
  end;
  insert into storage.objects (bucket_id,name) values ('siase',ruta),('siase',replace(ruta,'a.pdf','b.pdf'));
  insert into public.reportes_siase (becario_id,periodo_id,mes,archivo_url,estado)
  select '10000000-0000-4000-8000-000000000003',id,mes,ruta,'subido' from public.periodos_academicos where activo;
  update storage.objects set name=name where name=ruta;
  if found then raise exception 'Permitió sobrescribir objeto'; end if;
end $$;
reset role;
set request.jwt.claims = '';
