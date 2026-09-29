$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$projectRoot = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $projectRoot "local-server-startup.log"
$appLogPath = Join-Path $projectRoot "local-server-app.log"
$appErrorPath = Join-Path $projectRoot "local-server-app-error.log"
$supabaseCli = Join-Path $projectRoot "node_modules\.bin\supabase.cmd"
$nextCli = Join-Path $projectRoot "node_modules\next\dist\bin\next"
$dockerDesktop = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\Docker Desktop.exe"
$dockerCli = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\resources\bin\docker.exe"
$nodeCli = (Get-Command node.exe -ErrorAction Stop).Source

function Write-StartupLog([string] $message) {
  Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) $message"
}

function Test-Http([string] $url) {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Test-DockerReady {
  try {
    & $dockerCli info --format '{{.ServerVersion}}' 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

try {
  if (-not (Test-Path -LiteralPath $supabaseCli) -or -not (Test-Path -LiteralPath $nextCli)) {
    throw "Project dependencies are missing. Run npm.cmd ci in $projectRoot."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot ".next\BUILD_ID"))) {
    throw "Production build is missing. Run npm.cmd run build in $projectRoot."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot ".env.local"))) {
    throw "The local environment file is missing."
  }

  Write-StartupLog "Starting local deployment."
  if (-not (Test-Path -LiteralPath $dockerCli)) {
    throw "Docker Desktop CLI was not found at $dockerCli."
  }
  if (-not (Test-DockerReady)) {
    if (-not (Test-Path -LiteralPath $dockerDesktop)) {
      throw "Docker Desktop was not found at $dockerDesktop."
    }
    Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
    $dockerReady = $false
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
      Start-Sleep -Seconds 3
      if (Test-DockerReady) { $dockerReady = $true; break }
    }
    if (-not $dockerReady) { throw "Docker Desktop did not become ready within 270 seconds." }
  }
  Write-StartupLog "Docker Desktop is ready."

  if (-not (Test-Http "http://127.0.0.1:54321/auth/v1/health")) {
    Push-Location $projectRoot
    try {
      & $supabaseCli start --output json *> $null
      if ($LASTEXITCODE -ne 0) { throw "Supabase failed to start." }
    } finally {
      Pop-Location
    }
  }
  if (-not (Test-Http "http://127.0.0.1:54321/auth/v1/health")) {
    throw "Supabase Auth did not pass its health check."
  }
  Write-StartupLog "Supabase is healthy."

  if (Test-Http "http://127.0.0.1:3000/") {
    Write-StartupLog "The application is already responding on port 3000."
    exit 0
  }

  $appProcess = Start-Process -FilePath $nodeCli `
    -ArgumentList @($nextCli, "start", "-p", "3000", "-H", "0.0.0.0") `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $appLogPath -RedirectStandardError $appErrorPath
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 2
    if (Test-Http "http://127.0.0.1:3000/") {
      Write-StartupLog "Application is ready on port 3000 (PID $($appProcess.Id))."
      exit 0
    }
    if ($appProcess.HasExited) { break }
  }
  throw "Application did not become ready. See $appErrorPath."
} catch {
  Write-StartupLog "ERROR: $($_.Exception.Message)"
  exit 1
}
