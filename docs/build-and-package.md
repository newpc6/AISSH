# 打包与发布说明

本文档用于本地打包 AI SSH 桌面客户端和 Web 访问版。

## 1. 前置环境

需要已安装：

- Node.js / npm
- Go
- Rust / Cargo
- Tauri 依赖环境

Windows 上如果首次打 Tauri 安装包，需要确保 WebView2、Rust MSVC 工具链和系统打包依赖已安装。

## 2. 一键打包

在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Clean
```

Windows 也可以直接双击项目根目录的：

```text
build-release.bat
```

如果只想生成可拷贝运行的绿色版，可以双击：

```text
build-portable.bat
```

脚本会依次执行：

1. 构建前端静态资源：`apps/desktop/dist`
2. 构建 Go core：`apps/core-go/bin/ai-ssh-core.exe`
3. 生成 Web 发布目录：`release/web`
4. 生成 Web 压缩包：`release/ai-ssh-web-windows-x64.zip`
5. 准备 Tauri 内置资源
6. 生成桌面客户端安装包：`release/desktop`
7. 生成桌面绿色便携版：`release/portable`
8. 生成桌面绿色便携版压缩包：`release/ai-ssh-portable-windows-x64.zip`

## 3. 只打 Web 包

如果只想测试网页登录版：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Clean -SkipDesktop
```

生成目录：

```text
release/web
```

启动：

```powershell
cd release/web
.\start-web.ps1
```

访问：

```text
http://127.0.0.1:18555
http://本机或服务器IP:18555
```

首次启动会进入初始化页面，需要设置网页登录用户名和密码。

## 4. 局域网访问 Web 版

Web 发布包默认监听 `0.0.0.0`。部署到服务器或局域网电脑后，其他电脑可以直接通过浏览器访问：

```powershell
cd release/web
.\start-web.ps1
```

然后访问：

```text
http://服务器IP:18555
```

如只想限制为本机访问，可以在启动前设置：

```powershell
$env:AI_SSH_BIND_HOST = "127.0.0.1"
.\start-web.ps1
```

如需修改端口：

```powershell
$env:AI_SSH_CORE_PORT = "18080"
.\start-web.ps1
```

## 5. 桌面客户端产物

桌面安装包会复制到：

```text
release/desktop
```

Tauri 原始产物仍保留在：

```text
apps/desktop/src-tauri/target/release/bundle
```

Windows 常见产物包括 `.msi` 和 `.exe` 安装包，具体取决于当前 Tauri bundle 配置和本机工具链。

安装包安装的主要内容包括：

- Tauri 桌面客户端主程序
- 内置 Go core 可执行文件
- 前端 Web 静态资源
- 应用图标、卸载信息和系统安装元数据

安装版桌面客户端启动后会自动拉起内置 Go core。Go core 默认使用自身可执行文件所在目录下的 `data` 保存运行数据，包括服务器列表、网页登录配置和日志。客户端本身可直接进入；浏览器访问同一个 core 时仍需要网页登录。

## 6. 桌面绿色便携版

完整打包会同时生成可拷贝运行的绿色版：

```text
release/portable
release/ai-ssh-portable-windows-x64.zip
```

绿色版目录包含：

```text
AI SSH Portable.bat
start-portable.ps1
ai-ssh-desktop.exe
ai-ssh-core.exe
resources/web
data
README.md
```

使用方式：

1. 拷贝整个 `release/portable` 目录，或者解压 `release/ai-ssh-portable-windows-x64.zip`
2. 双击 `AI SSH Portable.bat`
3. 桌面客户端会启动，浏览器也可访问 `http://127.0.0.1:18555` 或 `http://服务器IP:18555`

便携版默认把运行数据写入同目录的 `data` 文件夹。拷贝整个便携目录可以带走主机列表、网页登录配置和日志等文件；密码和 SSH Key 如果保存到系统安全存储，跨电脑迁移时建议使用软件里的“导出服务器列表（含加密凭据）”再导入。

## 7. 重测首次初始化

Web 发布包默认数据目录：

```text
release/web/data
```

删除以下文件后重启 Web 包，可以重新测试首次初始化：

```text
release/web/data/web-auth.json
```

桌面安装版随内置 Go core 使用 core 可执行文件所在目录下的 `data` 保存运行数据。

桌面绿色版默认数据目录：

```text
release/portable/data
```

删除以下文件后重启绿色版，可以重新测试首次初始化：

```text
release/portable/data/web-auth.json
```

## 8. 常用脚本参数

```powershell
# 清理 release 后完整打包桌面和 Web
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Clean

# Windows 双击完整打包入口
build-release.bat

# Windows 双击绿色便携版打包入口
build-portable.bat

# 只打 Web 包
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Clean -SkipDesktop

# 跳过 Web zip 压缩
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -SkipWebArchive

# 跳过绿色便携版
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -SkipPortable

# 只生成 Web 包和绿色便携版，跳过安装包 bundler
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Clean -SkipDesktopInstaller

# 打包前运行前端类型检查和 Go 测试
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Clean -RunTests
```
