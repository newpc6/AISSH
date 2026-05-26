$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$coreOutDir = Join-Path $repoRoot "apps\core-go\bin"
$resourceDir = Join-Path $repoRoot "apps\desktop\src-tauri\resources"
$webResourceDir = Join-Path $resourceDir "web"
$isWindowsPlatform = $IsWindows -or $env:OS -eq "Windows_NT"
$coreExeName = if ($isWindowsPlatform) { "ai-ssh-core.exe" } else { "ai-ssh-core" }
$coreExe = Join-Path $coreOutDir $coreExeName

New-Item -ItemType Directory -Force -Path $coreOutDir | Out-Null
New-Item -ItemType Directory -Force -Path $resourceDir | Out-Null

Push-Location $repoRoot
try {
  npm run build:desktop
  go build -o $coreExe ./apps/core-go/cmd/server
  Copy-Item -Force $coreExe (Join-Path $resourceDir $coreExeName)
  if (Test-Path $webResourceDir) {
    Remove-Item -Recurse -Force $webResourceDir
  }
  Copy-Item -Recurse -Force (Join-Path $repoRoot "apps\desktop\dist") $webResourceDir
} finally {
  Pop-Location
}
