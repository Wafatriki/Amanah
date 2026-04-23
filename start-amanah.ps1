$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appPath = Join-Path $projectRoot 'amanah-app'
$emulatorDataPath = Join-Path $projectRoot '.emulator-data'

Write-Host 'Iniciando Amanah...' -ForegroundColor Green

if (-not (Test-Path $appPath)) {
  Write-Host "No se encontró la carpeta de la app: $appPath" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $emulatorDataPath)) {
  New-Item -ItemType Directory -Path $emulatorDataPath | Out-Null
}

$firebaseCommand = "Set-Location '$projectRoot'; firebase emulators:start --only auth,firestore,functions --import='$emulatorDataPath' --export-on-exit='$emulatorDataPath'"
$frontendCommand = "Set-Location '$appPath'; npx ng serve --port 4200"

Write-Host 'Abriendo emuladores Firebase...' -ForegroundColor Yellow
Start-Process powershell -ArgumentList '-NoExit', '-Command', $firebaseCommand

Write-Host 'Abriendo frontend Angular...' -ForegroundColor Yellow
Start-Process powershell -ArgumentList '-NoExit', '-Command', $frontendCommand

Write-Host ''
Write-Host 'Amanah está arrancando en dos ventanas separadas.' -ForegroundColor Green
Write-Host 'Frontend: http://localhost:4200/' -ForegroundColor Cyan
Write-Host 'Modo Firebase REAL (cuentas de Firebase Console): http://localhost:4200/' -ForegroundColor Cyan
Write-Host 'Modo EMULADOR (datos locales): http://localhost:4200/?firebase=emulator' -ForegroundColor Cyan
Write-Host 'Emuladores: http://127.0.0.1:4000/' -ForegroundColor Cyan
Write-Host 'Los datos de emulador se guardan en .emulator-data' -ForegroundColor Cyan