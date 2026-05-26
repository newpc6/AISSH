param(
  [switch]$SkipDesktop,
  [switch]$SkipWebArchive,
  [switch]$Clean,
  [switch]$RunTests
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$releaseRoot = Join-Path $repoRoot "release"
$webPackageDir = Join-Path $releaseRoot "web"
$desktopPackageDir = Join-Path $releaseRoot "desktop"
$distDir = Join-Path $repoRoot "apps\desktop\dist"
$coreOutDir = Join-Path $repoRoot "apps\core-go\bin"

$isWindowsPlatform = $IsWindows -or $env:OS -eq "Windows_NT"
$platform = if ($isWindowsPlatform) {
  "windows"
} elseif ($IsMacOS) {
  "macos"
} elseif ($IsLinux) {
  "linux"
} else {
  "unknown"
}
$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
$coreExeName = if ($isWindowsPlatform) { "ai-ssh-core.exe" } else { "ai-ssh-core" }
$coreExe = Join-Path $coreOutDir $coreExeName

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
  & $Action
}

function Reset-ReleaseDirectory {
  param([string]$Path)

  $releaseFull = [System.IO.Path]::GetFullPath($releaseRoot)
  $targetFull = [System.IO.Path]::GetFullPath($Path)
  if (-not $targetFull.StartsWith($releaseFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refuse to remove path outside release directory: $targetFull"
  }
  if (Test-Path -LiteralPath $targetFull) {
    Remove-Item -LiteralPath $targetFull -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $targetFull | Out-Null
}

function Write-WebLauncher {
  $startPs1 = Join-Path $webPackageDir "start-web.ps1"
  $startCmd = Join-Path $webPackageDir "start-web.cmd"
  $startSh = Join-Path $webPackageDir "start-web.sh"

  $startPs1Content = @'
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $env:AI_SSH_HOME) { $env:AI_SSH_HOME = Join-Path $scriptDir "data" }
if (-not $env:AI_SSH_WEB_ROOT) { $env:AI_SSH_WEB_ROOT = Join-Path $scriptDir "web" }
if (-not $env:AI_SSH_BIND_HOST) { $env:AI_SSH_BIND_HOST = "127.0.0.1" }
if (-not $env:AI_SSH_CORE_PORT) { $env:AI_SSH_CORE_PORT = "18555" }
New-Item -ItemType Directory -Force -Path $env:AI_SSH_HOME | Out-Null
Write-Host "AI SSH Web: http://$($env:AI_SSH_BIND_HOST):$($env:AI_SSH_CORE_PORT)"
Write-Host "Data: $env:AI_SSH_HOME"
& (Join-Path $scriptDir "__CORE_EXE__")
'@
  $startPs1Content = $startPs1Content.Replace("__CORE_EXE__", $coreExeName)
  $startPs1Content | Set-Content -Encoding utf8 -Path $startPs1

  $startCmdContent = @'
@echo off
set "SCRIPT_DIR=%~dp0"
if "%AI_SSH_HOME%"=="" set "AI_SSH_HOME=%SCRIPT_DIR%data"
if "%AI_SSH_WEB_ROOT%"=="" set "AI_SSH_WEB_ROOT=%SCRIPT_DIR%web"
if "%AI_SSH_BIND_HOST%"=="" set "AI_SSH_BIND_HOST=127.0.0.1"
if "%AI_SSH_CORE_PORT%"=="" set "AI_SSH_CORE_PORT=18555"
if not exist "%AI_SSH_HOME%" mkdir "%AI_SSH_HOME%"
echo AI SSH Web: http://%AI_SSH_BIND_HOST%:%AI_SSH_CORE_PORT%
echo Data: %AI_SSH_HOME%
"%SCRIPT_DIR%__CORE_EXE__"
'@
  $startCmdContent = $startCmdContent.Replace("__CORE_EXE__", $coreExeName)
  $startCmdContent | Set-Content -Encoding ascii -Path $startCmd

  $startShContent = @'
#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export AI_SSH_HOME="${AI_SSH_HOME:-$SCRIPT_DIR/data}"
export AI_SSH_WEB_ROOT="${AI_SSH_WEB_ROOT:-$SCRIPT_DIR/web}"
export AI_SSH_BIND_HOST="${AI_SSH_BIND_HOST:-127.0.0.1}"
export AI_SSH_CORE_PORT="${AI_SSH_CORE_PORT:-18555}"
mkdir -p "$AI_SSH_HOME"
echo "AI SSH Web: http://$AI_SSH_BIND_HOST:$AI_SSH_CORE_PORT"
echo "Data: $AI_SSH_HOME"
exec "$SCRIPT_DIR/__CORE_EXE__"
'@
  $startShContent = $startShContent.Replace("__CORE_EXE__", $coreExeName)
  $startShContent | Set-Content -Encoding utf8 -Path $startSh
}

function Write-WebReadme {
  $readme = Join-Path $webPackageDir "README.md"
  $readmeContent = @(
    '# AI SSH Web 发布包',
    '',
    '## 启动',
    '',
    'Windows PowerShell:',
    '',
    '````powershell',
    'cd release\web',
    '.\start-web.ps1',
    '````',
    '',
    'Windows 双击:',
    '',
    '````text',
    'release\web\start-web.cmd',
    '````',
    '',
    'macOS / Linux:',
    '',
    '````bash',
    'cd release/web',
    'sh ./start-web.sh',
    '````',
    '',
    '启动后访问：',
    '',
    '````text',
    'http://127.0.0.1:18555',
    '````',
    '',
    '首次启动会进入初始化页面，需要先设置网页登录用户名和密码。',
    '',
    '## 局域网访问',
    '',
    '如需让其他机器访问，请在启动前设置：',
    '',
    '````powershell',
    '$env:AI_SSH_BIND_HOST = "0.0.0.0"',
    '.\start-web.ps1',
    '````',
    '',
    '然后从其他电脑访问：',
    '',
    '````text',
    'http://服务器IP:18555',
    '````',
    '',
    '## 数据目录',
    '',
    '默认数据保存在本目录的 data 文件夹，包括登录初始化配置、服务器列表和日志等运行数据。测试首次初始化时，可以删除 data\\web-auth.json 后重启。'
  ) -join [Environment]::NewLine
  $readmeContent | Set-Content -Encoding utf8 -Path $readme
}

Push-Location $repoRoot
try {
  if ($Clean) {
    Invoke-Step "清理 release 目录" {
      Reset-ReleaseDirectory $releaseRoot
    }
  } else {
    New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
  }

  if ($RunTests) {
    Invoke-Step "运行前端类型检查" {
      npm run typecheck:desktop
    }
    Invoke-Step "运行 Go Core 测试" {
      npm run test:core
    }
  }

  Invoke-Step "构建前端 Web 静态资源" {
    npm run build:desktop
  }

  Invoke-Step "构建 Go Core" {
    New-Item -ItemType Directory -Force -Path $coreOutDir | Out-Null
    go build -o $coreExe ./apps/core-go/cmd/server
  }

  Invoke-Step "整理 Web 发布目录" {
    Reset-ReleaseDirectory $webPackageDir
    $webAssetsDir = Join-Path $webPackageDir "web"
    New-Item -ItemType Directory -Force -Path $webAssetsDir | Out-Null
    Copy-Item -Force $coreExe (Join-Path $webPackageDir $coreExeName)
    Copy-Item -Recurse -Force (Join-Path $distDir "*") $webAssetsDir
    Write-WebLauncher
    Write-WebReadme
  }

  if (-not $SkipWebArchive) {
    Invoke-Step "压缩 Web 发布包" {
      $webZip = Join-Path $releaseRoot "ai-ssh-web-$platform-$arch.zip"
      if (Test-Path -LiteralPath $webZip) {
        Remove-Item -LiteralPath $webZip -Force
      }
      Compress-Archive -Path (Join-Path $webPackageDir "*") -DestinationPath $webZip
      Write-Host "Web zip: $webZip"
    }
  }

  if (-not $SkipDesktop) {
    Invoke-Step "准备 Tauri 桌面资源" {
      & (Join-Path $repoRoot "scripts\prepare-tauri-core.ps1")
    }

    Invoke-Step "构建 Tauri 桌面客户端" {
      npm run tauri:build -w apps/desktop
    }

    Invoke-Step "复制桌面安装包" {
      Reset-ReleaseDirectory $desktopPackageDir
      $bundleRoot = Join-Path $repoRoot "apps\desktop\src-tauri\target\release\bundle"
      if (-not (Test-Path -LiteralPath $bundleRoot)) {
        throw "Tauri bundle directory not found: $bundleRoot"
      }
      $bundleItems = Get-ChildItem -LiteralPath $bundleRoot -Force
      if ($bundleItems.Count -eq 0) {
        throw "Tauri bundle directory is empty: $bundleRoot"
      }
      foreach ($item in $bundleItems) {
        Copy-Item -Recurse -Force -LiteralPath $item.FullName -Destination $desktopPackageDir
      }
      Write-Host "Desktop bundles: $desktopPackageDir"
    }
  }

  Write-Host ""
  Write-Host "打包完成" -ForegroundColor Green
  Write-Host "Web 发布目录: $webPackageDir"
  if (-not $SkipDesktop) {
    Write-Host "桌面安装包目录: $desktopPackageDir"
  }
} finally {
  Pop-Location
}
