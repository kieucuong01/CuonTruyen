$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $root "docker-compose.local.yml"
$envFile = Join-Path $root ".env.local"

$dbUser = if ($env:LOCAL_POSTGRES_USER) { $env:LOCAL_POSTGRES_USER } else { "comic_user" }
$dbPassword = if ($env:LOCAL_POSTGRES_PASSWORD) { $env:LOCAL_POSTGRES_PASSWORD } else { "comic_local_password" }
$dbName = if ($env:LOCAL_POSTGRES_DB) { $env:LOCAL_POSTGRES_DB } else { "comic_reader_local" }
$dbPort = if ($env:LOCAL_POSTGRES_PORT) { $env:LOCAL_POSTGRES_PORT } else { "5432" }

function Invoke-Checked {
  param(
    [string] $Command,
    [string[]] $Arguments
  )
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Set-EnvFileValues {
  param(
    [string] $Path,
    [hashtable] $Values
  )

  if (-not (Test-Path $Path)) {
    New-Item -ItemType File -Path $Path -Force | Out-Null
  }

  $lines = @(Get-Content $Path)
  foreach ($key in $Values.Keys) {
    $pattern = "^\s*$([regex]::Escape($key))\s*="
    $replacement = "$key=$($Values[$key])"
    $matched = $false
    $lines = @($lines | ForEach-Object {
      if ($_ -match $pattern) {
        $matched = $true
        $replacement
      } else {
        $_
      }
    })
    if (-not $matched) {
      $lines += $replacement
    }
  }

  Set-Content -Path $Path -Value $lines -Encoding UTF8
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required for local Postgres setup. Install/start Docker Desktop, then rerun npm run db:local:setup."
}

& docker info --format "{{.ServerVersion}}" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop is installed but the daemon is not running. Start Docker Desktop, wait until it is ready, then rerun npm run db:local:setup."
}

Push-Location $root
try {
  Invoke-Checked "docker" @("compose", "-f", $composeFile, "up", "-d", "postgres")

  $ready = $false
  for ($attempt = 1; $attempt -le 40; $attempt += 1) {
    & docker compose -f $composeFile exec -T postgres pg_isready -U $dbUser -d $dbName | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }

  if (-not $ready) {
    throw "Local Postgres did not become ready on 127.0.0.1:$dbPort."
  }

  $dbUrl = "postgres://$([uri]::EscapeDataString($dbUser)):$([uri]::EscapeDataString($dbPassword))@127.0.0.1:$dbPort/$dbName"
  Set-EnvFileValues $envFile @{
    CATALOG_STORAGE = "postgres"
    CATALOG_DATABASE_URL = $dbUrl
    POSTGRES_SSL = "false"
  }

  $env:CATALOG_STORAGE = "postgres"
  $env:CATALOG_DATABASE_URL = $dbUrl
  $env:POSTGRES_SSL = "false"

  Write-Host "[local-postgres] .env.local points catalog storage to 127.0.0.1:$dbPort/$dbName"
  Invoke-Checked "npm" @("run", "db:migrate:catalog")
  Write-Host "[local-postgres] setup complete"
} finally {
  Pop-Location
}
