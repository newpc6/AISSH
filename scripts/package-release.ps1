param(
  [switch]$SkipDesktop,
  [switch]$SkipPortable,
  [switch]$SkipDesktopInstaller,
  [switch]$SkipWebArchive,
  [switch]$Clean,
  [switch]$RunTests
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$releaseRoot = Join-Path $repoRoot "release"
$webPackageDir = Join-Path $releaseRoot "web"
$desktopPackageDir = Join-Path $releaseRoot "desktop"
$portablePackageDir = Join-Path $releaseRoot "portable"
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
$desktopExeName = if ($isWindowsPlatform) { "ai-ssh-desktop.exe" } else { "ai-ssh-desktop" }
$desktopExe = Join-Path $repoRoot "apps\desktop\src-tauri\target\release\$desktopExeName"

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
$dataDir = Join-Path $scriptDir "data"
Remove-Item Env:\AI_SSH_HOME -ErrorAction SilentlyContinue
if (-not $env:AI_SSH_WEB_ROOT) { $env:AI_SSH_WEB_ROOT = Join-Path $scriptDir "web" }
if (-not $env:AI_SSH_BIND_HOST) { $env:AI_SSH_BIND_HOST = "0.0.0.0" }
if (-not $env:AI_SSH_CORE_PORT) { $env:AI_SSH_CORE_PORT = "18555" }
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
Write-Host "AI SSH Web: http://$($env:AI_SSH_BIND_HOST):$($env:AI_SSH_CORE_PORT)"
Write-Host "Data: $dataDir"
Push-Location $scriptDir
try {
  & (Join-Path $scriptDir "__CORE_EXE__")
} finally {
  Pop-Location
}
'@
  $startPs1Content = $startPs1Content.Replace("__CORE_EXE__", $coreExeName)
  $startPs1Content | Set-Content -Encoding utf8 -Path $startPs1

  $startCmdContent = @'
@echo off
set "SCRIPT_DIR=%~dp0"
set "AI_SSH_HOME="
if "%AI_SSH_WEB_ROOT%"=="" set "AI_SSH_WEB_ROOT=%SCRIPT_DIR%web"
if "%AI_SSH_BIND_HOST%"=="" set "AI_SSH_BIND_HOST=0.0.0.0"
if "%AI_SSH_CORE_PORT%"=="" set "AI_SSH_CORE_PORT=18555"
if not exist "%SCRIPT_DIR%data" mkdir "%SCRIPT_DIR%data"
echo AI SSH Web: http://%AI_SSH_BIND_HOST%:%AI_SSH_CORE_PORT%
echo Data: %SCRIPT_DIR%data
pushd "%SCRIPT_DIR%"
"%SCRIPT_DIR%__CORE_EXE__"
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
'@
  $startCmdContent = $startCmdContent.Replace("__CORE_EXE__", $coreExeName)
  $startCmdContent | Set-Content -Encoding ascii -Path $startCmd

  $startShContent = @'
#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
unset AI_SSH_HOME
DATA_DIR="$SCRIPT_DIR/data"
export AI_SSH_WEB_ROOT="${AI_SSH_WEB_ROOT:-$SCRIPT_DIR/web}"
export AI_SSH_BIND_HOST="${AI_SSH_BIND_HOST:-0.0.0.0}"
export AI_SSH_CORE_PORT="${AI_SSH_CORE_PORT:-18555}"
mkdir -p "$DATA_DIR"
echo "AI SSH Web: http://$AI_SSH_BIND_HOST:$AI_SSH_CORE_PORT"
echo "Data: $DATA_DIR"
cd "$SCRIPT_DIR"
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
    '发布包默认监听 `0.0.0.0`，同一局域网或公网机器可以直接访问：',
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

function Write-PortableLauncher {
  $startCmd = Join-Path $portablePackageDir "AI SSH Portable.bat"
  $startPs1 = Join-Path $portablePackageDir "start-portable.ps1"

  $startCmdContent = @'
@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "AI_SSH_HOME="
set "AI_SSH_CORE_PATH=%SCRIPT_DIR%__CORE_EXE__"
set "AI_SSH_WEB_ROOT=%SCRIPT_DIR%resources\web"
set "AI_SSH_BIND_HOST=0.0.0.0"
if not exist "%SCRIPT_DIR%data" mkdir "%SCRIPT_DIR%data"
start "" "%SCRIPT_DIR%__DESKTOP_EXE__"
'@
  $startCmdContent = $startCmdContent.Replace("__CORE_EXE__", $coreExeName).Replace("__DESKTOP_EXE__", $desktopExeName)
  $startCmdContent | Set-Content -Encoding ascii -Path $startCmd

  $startPs1Content = @'
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $scriptDir "data"
Remove-Item Env:\AI_SSH_HOME -ErrorAction SilentlyContinue
$env:AI_SSH_CORE_PATH = Join-Path $scriptDir "__CORE_EXE__"
$env:AI_SSH_WEB_ROOT = Join-Path $scriptDir "resources\web"
$env:AI_SSH_BIND_HOST = "0.0.0.0"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
Start-Process -FilePath (Join-Path $scriptDir "__DESKTOP_EXE__")
'@
  $startPs1Content = $startPs1Content.Replace("__CORE_EXE__", $coreExeName).Replace("__DESKTOP_EXE__", $desktopExeName)
  $startPs1Content | Set-Content -Encoding utf8 -Path $startPs1
}

function Write-PortableReadme {
  $readme = Join-Path $portablePackageDir "README.md"
  $readmeContent = @(
    '# AI SSH 绿色便携版',
    '',
    '## 包含内容',
    '',
    "- ``$desktopExeName``：桌面客户端主程序",
    "- ``$coreExeName``：内置 Go core 服务，运行数据默认保存在同级 `data` 目录",
    '- `resources/web`：前端 Web 静态资源，客户端启动后浏览器也可访问同一个服务',
    '- `data`：便携版运行数据目录，主机列表、网页登录配置、日志等数据默认保存在这里',
    '- `AI SSH Portable.bat`：Windows 双击启动入口',
    '- `start-portable.ps1`：PowerShell 启动入口',
    '',
    '## 启动',
    '',
    'Windows 下优先双击：',
    '',
    '````text',
    'AI SSH Portable.bat',
    '````',
    '',
    '也可以运行：',
    '',
    '````powershell',
    '.\start-portable.ps1',
    '````',
    '',
    '## 访问',
    '',
    '桌面客户端会自动启动内置 Go core，默认监听 `0.0.0.0:18555`。浏览器可访问：',
    '',
    '````text',
    'http://127.0.0.1:18555',
    'http://本机或服务器IP:18555',
    '````',
    '',
    '浏览器访问需要登录。首次启动会进入初始化页面，需要先设置网页登录用户名和密码。',
    '',
    '## 迁移',
    '',
    '拷贝整个 portable 文件夹即可迁移程序和便携数据。密码和 SSH Key 如果保存到系统安全存储，跨电脑迁移时建议使用软件里的“导出服务器列表（含加密凭据）”再在新电脑导入。'
  ) -join [Environment]::NewLine
  $readmeContent | Set-Content -Encoding utf8 -Path $readme
}

function Build-PortablePackage {
  if (-not (Test-Path -LiteralPath $desktopExe)) {
    throw "Desktop executable not found: $desktopExe"
  }
  Reset-ReleaseDirectory $portablePackageDir
  $portableResourcesDir = Join-Path $portablePackageDir "resources"
  $portableWebDir = Join-Path $portableResourcesDir "web"
  $portableDataDir = Join-Path $portablePackageDir "data"
  New-Item -ItemType Directory -Force -Path $portableResourcesDir | Out-Null
  New-Item -ItemType Directory -Force -Path $portableWebDir | Out-Null
  New-Item -ItemType Directory -Force -Path $portableDataDir | Out-Null
  Copy-Item -Force $desktopExe (Join-Path $portablePackageDir $desktopExeName)
  Copy-Item -Force $coreExe (Join-Path $portablePackageDir $coreExeName)
  Copy-Item -Recurse -Force (Join-Path $distDir "*") $portableWebDir
  Write-PortableLauncher
  Write-PortableReadme
}

Push-Location $repoRoot
try {
  if ($Clean) {
    Invoke-Step "准备 release 目录" {
      New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
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

    if ($SkipDesktopInstaller) {
      Invoke-Step "构建 Tauri 桌面 exe" {
        cargo build --release --manifest-path (Join-Path $repoRoot "apps\desktop\src-tauri\Cargo.toml")
      }
    } else {
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

    if (-not $SkipPortable) {
      Invoke-Step "整理桌面绿色便携版" {
        Build-PortablePackage
        Write-Host "Portable package: $portablePackageDir"
      }

      if (-not $SkipWebArchive) {
        Invoke-Step "压缩桌面绿色便携版" {
          $portableZip = Join-Path $releaseRoot "ai-ssh-portable-$platform-$arch.zip"
          if (Test-Path -LiteralPath $portableZip) {
            Remove-Item -LiteralPath $portableZip -Force
          }
          Compress-Archive -Path (Join-Path $portablePackageDir "*") -DestinationPath $portableZip
          Write-Host "Portable zip: $portableZip"
        }
      }
    }
  }

  Write-Host ""
  Write-Host "打包完成" -ForegroundColor Green
  Write-Host "Web 发布目录: $webPackageDir"
  if (-not $SkipDesktop) {
    if (-not $SkipDesktopInstaller) {
      Write-Host "桌面安装包目录: $desktopPackageDir"
    }
    if (-not $SkipPortable) {
      Write-Host "桌面绿色版目录: $portablePackageDir"
    }
  }
} finally {
  Pop-Location
}
