param([Parameter(Mandatory)][string]$Contenedor)
$ErrorActionPreference = 'Stop'
# La firma retiene la fila; el reemplazo concurrente debe esperar y luego fallar.
$firma = Start-Job -ArgumentList $Contenedor -ScriptBlock {
    param($Nombre)
    @'
begin;
set application_name='audit_firma';
set request.jwt.claims='{"sub":"audit_ing","role":"authenticated"}';
set role authenticated;
select public.firmar_reportes_siase(array(select id from public.reportes_siase where becario_id='10000000-0000-4000-8000-000000000003'));
select pg_sleep(5);
commit;
'@ | docker exec -i $Nombre psql -U postgres -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) { throw 'Falló la firma concurrente.' }
}
try {
    $lista = $false
    for ($i=0; $i -lt 60; $i++) {
        $esperando = docker exec $Contenedor psql -U postgres -Atq -c "select count(*) from pg_stat_activity where application_name='audit_firma' and wait_event='PgSleep';"
        if ($esperando -eq '1') { $lista=$true; break }
        Start-Sleep -Milliseconds 100
    }
    if (!$lista) { throw 'No se observó el bloqueo de firma.' }
    $ErrorActionPreference = 'Continue'
    $resultado = @'
set request.jwt.claims='{"sub":"audit_bec","role":"authenticated"}';
set role authenticated;
update public.reportes_siase set archivo_url=replace(archivo_url,'a.pdf','b.pdf') where becario_id='10000000-0000-4000-8000-000000000003';
'@ | docker exec -i $Contenedor psql -U postgres -v ON_ERROR_STOP=1 -q 2>&1
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -eq 0 -or ($resultado -join '') -notmatch 'revisado|confirmar un reporte') { throw "Reemplazo concurrente inesperado: $resultado" }
    Receive-Job $firma -Wait -ErrorAction Stop | Out-Null
    $correcto = docker exec $Contenedor psql -U postgres -Atq -c "select count(*) from public.reportes_siase where becario_id='10000000-0000-4000-8000-000000000003' and estado='confirmado' and archivo_url like '%/a.pdf';"
    if ($correcto -ne '1') { throw 'La firma no conservó el archivo original.' }
    Write-Output 'Firma concurrente: reemplazo rechazado; archivo original conservado.'
} finally {
    Remove-Job $firma -Force
}
