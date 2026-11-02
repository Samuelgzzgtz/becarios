param([string]$Imagen = 'postgres:17-alpine')
$ErrorActionPreference = 'Stop'
$contenedor = "becarios-pruebas-$PID"
function EjecutarSql([string]$Ruta) {
    Get-Content -Raw -Encoding utf8 -LiteralPath $Ruta | docker exec -i $contenedor psql -U postgres -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) { throw "Falló SQL: $Ruta" }
}
try {
    docker run --rm -d --name $contenedor -e POSTGRES_HOST_AUTH_METHOD=trust $Imagen | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear PostgreSQL de pruebas.' }
    $listo = $false
    for ($intento = 0; $intento -lt 40; $intento++) {
        docker exec $contenedor pg_isready -U postgres 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $listo = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (!$listo) { throw 'PostgreSQL no inició a tiempo.' }
    EjecutarSql (Join-Path $PSScriptRoot 'infra_local.sql')
    # Vault (0019) se valida en Supabase; no está simulado en estas pruebas.
    Get-ChildItem (Join-Path $PSScriptRoot '../sql') -Filter '*.sql' | Sort-Object Name | Where-Object Name -NotLike '0019*' | ForEach-Object { EjecutarSql $_.FullName }
    EjecutarSql (Join-Path $PSScriptRoot 'clerk_sincronizacion.sql')
    EjecutarSql (Join-Path $PSScriptRoot 'correcciones_asistencias.sql')
    Write-Output 'Migraciones y pruebas de permisos/correcciones completadas.'
} finally {
    # Solo se detiene el contenedor creado aquí; --rm lo retira.
    docker stop $contenedor 2>$null | Out-Null
}
