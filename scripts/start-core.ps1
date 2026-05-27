param(
  [string]$WebRoot = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$coreOutDir = Join-Path $repoRoot "apps\core-go\bin"
$isWindowsPlatform = $IsWindows -or $env:OS -eq "Windows_NT"
$coreExeName = if ($isWindowsPlatform) { "ai-ssh-core.exe" } else { "ai-ssh-core" }
$coreExe = Join-Path $coreOutDir $coreExeName

New-Item -ItemType Directory -Force -Path $coreOutDir | Out-Null

Push-Location $repoRoot
try {
  if (-not $SkipBuild -or -not (Test-Path $coreExe)) {
    go build -o $coreExe ./apps/core-go/cmd/server
  }

  if ([string]::IsNullOrWhiteSpace($env:AI_SSH_HOME)) {
    $env:AI_SSH_HOME = $repoRoot
  }

  if (-not [string]::IsNullOrWhiteSpace($WebRoot)) {
    $webRootPath = $WebRoot
    if (-not [System.IO.Path]::IsPathRooted($webRootPath)) {
      $webRootPath = Join-Path $repoRoot $webRootPath
    }
    $env:AI_SSH_WEB_ROOT = (Resolve-Path $webRootPath).Path
  }

  & $coreExe
} finally {
  Pop-Location
}
