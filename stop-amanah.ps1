$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$emulatorDataPath = Join-Path $projectRoot '.emulator-data'

Write-Host 'Guardando datos de emuladores...' -ForegroundColor Yellow

if (-not (Test-Path $emulatorDataPath)) {
  New-Item -ItemType Directory -Path $emulatorDataPath | Out-Null
}

Set-Location $projectRoot
firebase emulators:export $emulatorDataPath

Write-Host 'Exportación completada en .emulator-data' -ForegroundColor Green
Write-Host 'Ahora puedes cerrar las ventanas de emuladores con seguridad.' -ForegroundColor Cyan