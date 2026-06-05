# AI SSH Startup and Preview Guide

## 1. Document Purpose

This document explains how to start AI SSH locally during the current phase and view the completed frontend interface, Go core service, and Tauri desktop shell effects.

Currently applicable to:

- Windows development environment
- Node.js, npm, Go, Rust, Cargo installed

## 2. Current Preview Content

The project is currently in transition from Milestone 0 to Milestone 1. What you can see includes:

- React frontend workbench interface
- Frontend status display for Go core health check interface
- Tauri desktop shell startup capability
- Go core hosting frontend web, web access requires login by default
- Packaged desktop client will attempt to automatically start built-in Go core; browser can also access the same service; development debugging mode recommends manually running `npm run dev:core` to view backend logs
- `local-demo` demo host terminal input/output link
- Temporary SSH host password authentication connection
- Left panel add SSH connection popup
- Server card top-right menu with edit, connect, copy config, and delete options
- File menu import/export entries, distinguishable between server list and software config
- SSH group independent configuration, can create empty groups, manage groups, and select existing groups when adding connections
- Server basic config local persistence
- Password / SSH Key system secure storage
- Tool menu runtime log panel, can view frontend requests, Go core requests, and save failure details
- Top dropdown menu, split pane settings popup, session tab close confirmation, and reconnect after disconnect
- Each SSH tab retains independent terminal output cache, default latest 1000 lines
- Real command history based on user keyboard input and enter submission, filtered path tracking internal probe commands, terminal control sequences, and full-screen program input
- Session tab connection status dot, auto-switch remaining sessions after close, no session empty state, and recent server quick connect; no "disconnected" pseudo tab when no open sessions
- SFTP file browsing, path input entry, parent directory, directory entry, upload, download, and basic transfer progress
- Current server CPU current usage, memory used/total, CPU/memory coordinate trend, hover point details and zoom view, card collapse, disk list, network real-time uplink/downlink bandwidth display; metrics parsed by Go core from remote `/proc` and `df` raw data
- AI large model address, Key, model settings entry, and OpenAI compatible command prediction

Not yet completed:

- agent authentication
- known_hosts strict verification
- Desktop native drag-out download experience

So what you see now is "engineering skeleton + integration basic interface", not the final product.

## 3. Dependency Check

Execute the following commands in the project root directory to confirm environment availability:

```powershell
node -v
npm -v
go version
rustc --version
cargo --version
```

## 4. First-time Dependency Installation

Execute in project root directory:

```powershell
npm install
```

Explanation:

- This will install frontend dependencies and Tauri CLI local dependencies
- Go dependencies will be automatically handled during first run or test

## 5. Method 1: Start Browser Frontend Interface

This method is best for quickly viewing current page effects.

If you want to use "complete web service with login", prefer `Method 2`. This section is development debugging mode, Vite will proxy to Go core.

### Step 1: Start Go core

Open a terminal window in the project root directory and execute:

```powershell
npm run dev:core
```

Explanation:

- `npm run dev:core` will first compile Go core to fixed path `apps/core-go/bin/ai-ssh-core.exe`
- Then start service from this fixed path, no longer using `go run` temporary directory executable
- Runtime working directory will switch to `apps/core-go/bin`, default read `apps/core-go/bin/data/hosts.json` and `apps/core-go/bin/data/web-auth.json`
- Script will read or generate `%APPDATA%\ai-ssh\desktop-token`, and inject the same token into Go core; Tauri desktop will also read this token, so two-window debugging can still auto-login and read host list

Expected output after startup:

```text
AI SSH core listening on http://127.0.0.1:18555
```

### Step 2: Start Frontend Development Server

Open another terminal window in the project root directory and execute:

```powershell
npm run dev:desktop
```

After startup, Vite will output local address, default usually:

```text
http://127.0.0.1:1420
```

### Step 3: Browser Access

Open browser and visit:

- <http://127.0.0.1:1420>

### Expected Effect

You should see:

- Left side is SSH server list and file mode switch, default width larger, and can drag to adjust
- Center is terminal session main area and session tab bar
- Right side is current server info, AI tools, and command history
- After selecting `Local Demo`, click `+` in the middle session bar, terminal area will enter demo shell

If Go core has started normally, page will display:

- `core connected`

If Go core not started or port abnormal, page will display:

- `core not connected`

## 6. Method 2: Start Tauri Desktop Version

This method is for viewing current desktop shell effects.

### Step 1: Start Go core and View Backend Logs

During development debugging, recommend manually starting Go core so backend logs display directly in current terminal. Execute in project root directory:

```powershell
npm run dev:core
```

### Step 2: Start Tauri Desktop Window

Open another terminal and execute in project root directory:

```powershell
npm run dev:tauri
```

Explanation:

- `npm run dev:tauri` now only starts desktop, no longer compiles or automatically starts Go core
- This command internally sets `AI_SSH_DESKTOP_NO_CORE=1`, avoiding Tauri starting second core
- This command will first start frontend development server, then Tauri opens desktop window

### One-click Dual Window Startup

If you want to type fewer commands, you can also double-click root directory:

```powershell
start-dev.bat
```

Explanation:

- It will automatically open a new window to run `npm run dev:core`
- Current window continues to run `npm run dev:tauri`

### Expected Effect

You should see:

- A desktop window titled `AI SSH`
- Window displays current workbench interface consistent with browser version
- Can also access in browser <http://127.0.0.1:18555>, LAN or public network can access `http://serverIP:18555`
- Browser access requires login; default user is `admin`

## 7. Method 3: Only Start Web Service

This method is suitable for deploying on servers, only providing browser access.

### Local Development Startup

Execute in project root directory:

```powershell
$env:AI_SSH_WEB_USER = "admin"
$env:AI_SSH_WEB_PASSWORD = "your_password"
npm run serve:web
```

Then visit:

- Local: <http://127.0.0.1:18555>
- LAN or server: `http://serverIP:18555`

### Start with Compiled Core

First build frontend and Go core:

```powershell
npm run build:desktop
npm run build:core
```

Then start:

```powershell
$env:AI_SSH_WEB_ROOT = "apps/desktop/dist"
$env:AI_SSH_WEB_USER = "admin"
$env:AI_SSH_WEB_PASSWORD = "your_password"
apps/core-go/bin/ai-ssh-core.exe
```

Common Environment Variables:

- `AI_SSH_CORE_PORT`: Service port, default `18555`
- `AI_SSH_BIND_HOST`: Listen address, default `0.0.0.0`; if only allowing local access, can set to `127.0.0.1`
- `AI_SSH_WEB_ROOT`: Frontend static resource directory, usually `apps/desktop/dist`
- `AI_SSH_WEB_USER`: Web login username, default `admin`
- `AI_SSH_WEB_PASSWORD`: Web login password; if not set, will auto-generate and save to `data/web-auth.json`
- `AI_SSH_WEB_AUTH=0`: Disable web login authentication, only for local temporary debugging
- `AI_SSH_HOSTS_PATH`: Precisely specify server list config file path, usually not needed
- `AI_SSH_WEB_AUTH_PATH`: Precisely specify web login config file path, usually not needed

## 8. Build Check

If you only want to verify whether the project can compile, you can execute in project root directory:

```powershell
npm run build:desktop
npm run test:core
```

If you want to verify Tauri Rust project is normal:

```powershell
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## 9. Common Issues

### 9.1 Page Shows Core Not Connected

Troubleshooting sequence:

1. Confirm `npm run dev:core` is still running
2. Confirm 18555 port not occupied by other processes
3. Confirm frontend development service started normally

Can directly visit the following address to check:

- <http://127.0.0.1:18555/api/health>

If normal, should return a JSON.

### 9.2 New SSH Connection Save Failure or HTTP 405

Troubleshooting sequence:

1. Confirm `npm run dev:core` is running
2. Open top `Tools` menu to view runtime logs
3. Check if `/api/hosts` 405 record appears, and whether it automatically falls back to `http://127.0.0.1:18555/api/hosts`
4. If fallback request also fails, view Go core terminal output request logs and error logs
5. If using SSH Key authentication, confirm private key content complete; longer SSH Keys will automatically be saved in fragments to system secure storage

### 9.3 Tauri Startup Failure

First check:

```powershell
rustc --version
cargo --version
npm run tauri -- info -w apps/desktop
```

Common reasons:

- Rust / Cargo not in PATH
- WebView2 missing
- Local proxy causing Cargo to fail pulling crates

## 10. Current Recommended Startup Method

Daily development recommendation:

1. One terminal runs `npm run dev:core`, for compiling and starting latest Go core, while viewing backend logs
2. Another terminal runs `npm run dev:tauri`, only starting Tauri desktop window
3. Can also double-click `start-dev.bat` to automatically complete above two steps

If just want to quickly view browser frontend page:

1. One terminal runs `npm run dev:core`
2. One terminal runs `npm run dev:desktop`
3. Browser opens <http://127.0.0.1:1420>

`npm run dev:core` started process path should be `apps/core-go/bin/ai-ssh-core.exe`; if you see `go-build...server.exe` in task manager, it means there's still old `go run` process not closed.

If want to simulate server web deployment:

1. Set `AI_SSH_WEB_USER`, `AI_SSH_WEB_PASSWORD`, `AI_SSH_BIND_HOST`
2. Run `npm run serve:web`
3. Browser opens <http://127.0.0.1:18555>
