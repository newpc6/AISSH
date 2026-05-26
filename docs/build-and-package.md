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

脚本会依次执行：

1. 构建前端静态资源：`apps/desktop/dist`
2. 构建 Go core：`apps/core-go/bin/ai-ssh-core.exe`
3. 生成 Web 发布目录：`release/web`
4. 生成 Web 压缩包：`release/ai-ssh-web-windows-x64.zip`
5. 准备 Tauri 内置资源
6. 生成桌面客户端安装包：`release/desktop`

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
```

首次启动会进入初始化页面，需要设置网页登录用户名和密码。

## 4. 局域网访问 Web 版

默认只监听本机 `127.0.0.1`。如果部署到服务器，想让其他电脑通过浏览器访问：

```powershell
cd release/web
$env:AI_SSH_BIND_HOST = "0.0.0.0"
.\start-web.ps1
```

然后访问：

```text
http://服务器IP:18555
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

桌面客户端启动后会自动拉起内置 Go core。客户端本身可直接进入；浏览器访问同一个 core 时仍需要网页登录。

## 6. 重测首次初始化

Web 发布包默认数据目录：

```text
release/web/data
```

删除以下文件后重启 Web 包，可以重新测试首次初始化：

```text
release/web/data/web-auth.json
```

桌面客户端打包后使用系统应用数据目录保存运行数据，具体位置由 Tauri 的 app data dir 决定。

## 7. 常用脚本参数

```powershell
# 清理 release 后完整打包桌面和 Web
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Clean

# Windows 双击完整打包入口
build-release.bat

# 只打 Web 包
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Clean -SkipDesktop

# 跳过 Web zip 压缩
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -SkipWebArchive

# 打包前运行前端类型检查和 Go 测试
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Clean -RunTests
```
