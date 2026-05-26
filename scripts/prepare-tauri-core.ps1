$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$coreOutDir = Join-Path $repoRoot "apps\core-go\bin"
$resourceDir = Join-Path $repoRoot "apps\desktop\src-tauri\resources"
$webResourceDir = Join-Path $resourceDir "web"
$coreExe = Join-Path $coreOutDir "ai-ssh-core.exe"

New-Item -ItemType Directory -Force -Path $coreOutDir | Out-Null
New-Item -ItemType Directory -Force -Path $resourceDir | Out-Null

Push-Location $repoRoot
try {
  go build -o $coreExe ./apps/core-go/cmd/server
  Copy-Item -Force $coreExe (Join-Path $resourceDir "ai-ssh-core.exe")
  if (Test-Path $webResourceDir) {
    Remove-Item -Recurse -Force $webResourceDir
  }
  Copy-Item -Recurse -Force (Join-Path $repoRoot "apps\desktop\dist") $webResourceDir
} finally {
  Pop-Location
}
