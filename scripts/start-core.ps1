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
$dataDir = Join-Path $coreOutDir "data"

New-Item -ItemType Directory -Force -Path $coreOutDir | Out-Null
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

Push-Location $repoRoot
try {
  if (-not $SkipBuild -or -not (Test-Path $coreExe)) {
    go build -o $coreExe ./apps/core-go/cmd/server
    if ($LASTEXITCODE -ne 0) {
      Write-Error "go build failed with exit code $LASTEXITCODE"
      exit $LASTEXITCODE
    }
  }

  if (-not [string]::IsNullOrWhiteSpace($WebRoot)) {
    $webRootPath = $WebRoot
    if (-not [System.IO.Path]::IsPathRooted($webRootPath)) {
      $webRootPath = Join-Path $repoRoot $webRootPath
    }
    $env:AI_SSH_WEB_ROOT = (Resolve-Path $webRootPath).Path
  }

  Pop-Location
  Push-Location $coreOutDir
  Remove-Item Env:\AI_SSH_HOME -ErrorAction SilentlyContinue
  Write-Host "AI SSH core working directory: $coreOutDir"
  Write-Host "AI SSH core data directory: $dataDir"
  & $coreExe
} finally {
  Pop-Location
}
