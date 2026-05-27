param(
  [switch]$Help
)

if ($Help -or $args -contains "-Help" -or $args -contains "--help" -or $args -contains "/?") {
  Write-Host "AI SSH Tauri desktop launcher"
  Write-Host ""
  Write-Host "Usage:"
  Write-Host "  npm run dev:tauri"
  Write-Host ""
  Write-Host "This starts only the Tauri desktop side and sets AI_SSH_DESKTOP_NO_CORE=1."
  Write-Host "Start Go core separately with: npm run dev:core"
  exit 0
}

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $repoRoot
try {
  $env:AI_SSH_DESKTOP_NO_CORE = "1"
  npm run tauri:dev -w apps/desktop
} finally {
  Pop-Location
}
