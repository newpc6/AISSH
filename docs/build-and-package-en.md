# Build and Package Instructions

This document is for locally packaging AI SSH desktop client and web access version.

## 1. Prerequisites

Need to have installed:

- Node.js / npm
- Go
- Rust / Cargo
- Tauri dependency environment

On Windows, if packaging Tauri installer for the first time, need to ensure WebView2, Rust MSVC toolchain, and system packaging dependencies are installed.

## 2. One-click Packaging

Execute in project root directory:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Clean
```

On Windows, can also directly double-click in project root directory:

```text
build-release.bat
```

If only want to generate copy-and-run portable version, can double-click:

```text
build-portable.bat
```

The script will execute in sequence:

1. Build frontend static resources: `apps/desktop/dist`
2. Build Go core: `apps/core-go/bin/ai-ssh-core.exe`
3. Generate web release directory: `release/web`
4. Generate web zip package: `release/ai-ssh-web-windows-x64.zip`
5. Prepare Tauri built-in resources
6. Generate desktop client installer: `release/desktop`
7. Generate desktop portable version: `release/portable`
8. Generate desktop portable zip package: `release/ai-ssh-portable-windows-x64.zip`

## 3. Only Build Web Package

If only want to test web login version:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Clean -SkipDesktop
```

Generated directory:

```text
release/web
```

Start:

```powershell
cd release/web
.\start-web.ps1
```

Access:

```text
http://127.0.0.1:18555
http://local-or-server-IP:18555
```

First startup will enter initialization page, need to set web login username and password.

## 4. LAN Access Web Version

Web release package defaults to listening on `0.0.0.0`. After deploying to server or LAN computer, other computers can directly access via browser:

```powershell
cd release/web
.\start-web.ps1
```

Then access:

```text
http://serverIP:18555
```

If only want to restrict to local access, can set before starting:

```powershell
$env:AI_SSH_BIND_HOST = "127.0.0.1"
.\start-web.ps1
```

If need to modify port:

```powershell
$env:AI_SSH_CORE_PORT = "18080"
.\start-web.ps1
```

## 5. Desktop Client Artifacts

Desktop installer will be copied to:

```text
release/desktop
```

Tauri original artifacts still retained in:

```text
apps/desktop/src-tauri/target/release/bundle
```

Windows common artifacts include `.msi` and `.exe` installers, depending on current Tauri bundle configuration and local toolchain.

Installer main contents include:

- Tauri desktop client main program
- Built-in Go core executable
- Frontend web static resources
- Application icon, uninstall information, and system installation metadata

Installed desktop client will automatically start built-in Go core after startup. Go core defaults to using `data` in its executable directory to save runtime data, including server list, web login config, and logs. Client itself can directly enter; browser accessing same core still requires web login.

## 6. Desktop Portable Version

Complete packaging will also generate copy-and-run portable version:

```text
release/portable
release/ai-ssh-portable-windows-x64.zip
```

Portable version directory contains:

```text
AI SSH Portable.bat
start-portable.ps1
ai-ssh-desktop.exe
ai-ssh-core.exe
resources/web
data
README.md
```

Usage:

1. Copy entire `release/portable` directory, or extract `release/ai-ssh-portable-windows-x64.zip`
2. Double-click `AI SSH Portable.bat`
3. Desktop client will start, browser can also access `http://127.0.0.1:18555` or `http://serverIP:18555`

Portable version defaults to writing runtime data to `data` folder in same directory. Copying entire portable directory can take away host list, web login config, and log files; if passwords and SSH Keys are saved to system secure storage, cross-computer migration recommends using software's "Export server list (with encrypted credentials)" then import.

## 7. Retest First Initialization

Web release package default data directory:

```text
release/web/data
```

Delete the following file and restart web package to retest first initialization:

```text
release/web/data/web-auth.json
```

Desktop installed version uses `data` in core executable directory to save runtime data with built-in Go core.

Desktop portable version default data directory:

```text
release/portable/data
```

Delete the following file and restart portable version to retest first initialization:

```text
release/portable/data/web-auth.json
```

## 8. Common Script Parameters

```powershell
# Clean release then complete package desktop and web
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Clean

# Windows double-click complete packaging entry
build-release.bat

# Windows double-click portable version packaging entry
build-portable.bat

# Only build web package
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Clean -SkipDesktop

# Skip web zip compression
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -SkipWebArchive

# Skip portable version
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -SkipPortable

# Only generate web package and portable version, skip installer bundler
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Clean -SkipDesktopInstaller

# Run frontend type check and Go tests before packaging
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Clean -RunTests
```

`-SkipDesktopInstaller` will still use `tauri build --no-bundle` to generate production desktop exe; don't directly replace with `cargo build --release`, otherwise exe will try to access development server `127.0.0.1:1420`, portable version startup will show "cannot access this page".

## 9. Build Verification

After packaging completes, verify:

1. Desktop installer runs correctly
2. Portable version starts without errors
3. Web package serves correctly
4. All features work as expected

## 10. Release Checklist

Before release:

- [ ] All tests passing
- [ ] Documentation updated
- [ ] Changelog prepared
- [ ] Version number updated
- [ ] Installers tested on clean systems
- [ ] Web package tested in different browsers
- [ ] Portable version tested on different machines
