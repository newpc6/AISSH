# AI SSH 启动与查看效果说明

## 1. 文档目的

本文档用于说明当前阶段如何在本地启动 AI SSH，并查看已经完成的前端界面、Go core 服务和 Tauri 桌面壳效果。

当前适用于：

- Windows 开发环境
- 已安装 Node.js、npm、Go、Rust、Cargo

## 2. 当前可查看的内容

目前项目还处于 Milestone 0 到 Milestone 1 的过渡阶段，可以看到的效果主要包括：

- React 前端工作台界面
- 前端对 Go core 健康检查接口的状态展示
- Tauri 桌面壳启动能力

当前还未完成：

- 真实 SSH 连接
- 真实终端交互
- 文件管理
- AI 助手面板的实际能力

所以当前看到的是“工程骨架 + 联调基础界面”，不是最终成品。

## 3. 依赖检查

在项目根目录执行以下命令，确认环境可用：

```powershell
node -v
npm -v
go version
rustc --version
cargo --version
```

## 4. 首次安装依赖

在项目根目录执行：

```powershell
npm install
```

说明：

- 这会安装前端依赖和 Tauri CLI 的本地依赖
- Go 依赖会在第一次运行或测试时自动处理

## 5. 方式一：启动浏览器版前端界面

这个方式最适合快速看当前页面效果。

### 步骤 1：启动 Go core

在项目根目录打开一个终端窗口，执行：

```powershell
npm run dev:core
```

启动后预期输出类似：

```text
AI SSH core listening on http://127.0.0.1:18555
```

### 步骤 2：启动前端开发服务器

在项目根目录再打开一个终端窗口，执行：

```powershell
npm run dev:desktop
```

启动后 Vite 会输出本地地址，默认通常是：

```text
http://127.0.0.1:1420
```

### 步骤 3：浏览器访问

打开浏览器访问：

- [http://127.0.0.1:1420](http://127.0.0.1:1420)

### 预期效果

你应该能看到：

- 左侧是产品定位和当前重点能力
- 主区域有 Milestone 0 的说明
- 右侧或上方能看到 Core Health 状态

如果 Go core 已正常启动，页面会显示：

- `core 已连接`

如果 Go core 没启动或端口异常，页面会显示：

- `core 未连接`

## 6. 方式二：启动 Tauri 桌面版

这个方式用于查看当前桌面壳效果。

### 步骤 1：确保 Go core 已启动

在项目根目录执行：

```powershell
npm run dev:core
```

### 步骤 2：启动 Tauri

在另一个终端窗口执行：

```powershell
npm run dev:tauri
```

说明：

- 这个命令会先启动前端开发服务器
- 然后由 Tauri 打开桌面窗口

### 预期效果

你应该会看到：

- 一个标题为 `AI SSH` 的桌面窗口
- 窗口内显示和浏览器版一致的当前工作台界面

## 7. 构建检查

如果你只想验证工程是否能编译通过，可以在项目根目录执行：

```powershell
npm run build:desktop
npm run test:core
```

如果你要验证 Tauri Rust 工程是否正常：

```powershell
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## 8. 常见问题

### 8.1 页面显示 core 未连接

排查顺序：

1. 确认 `npm run dev:core` 是否仍在运行
2. 确认 18555 端口未被其他进程占用
3. 确认前端开发服务是否正常启动

可直接访问以下地址检查：

- [http://127.0.0.1:18555/api/health](http://127.0.0.1:18555/api/health)

如果正常，应返回一段 JSON。

### 8.2 Tauri 启动失败

先检查：

```powershell
rustc --version
cargo --version
npm run tauri -- info -w apps/desktop
```

常见原因：

- Rust / Cargo 未加入 PATH
- WebView2 缺失
- 本机代理导致 Cargo 拉取 crates 失败

仓库中已经提供了项目级 Cargo 配置：

- [`.cargo/config.toml`](I:/project/ai/ai-ssh/.cargo/config.toml)

它用于减小代理问题对当前仓库的影响。

### 8.3 命令可用但当前终端找不到 rustc / cargo

通常是因为安装后当前终端没有刷新环境变量。

可尝试：

1. 关闭并重新打开终端
2. 再执行：

```powershell
rustc --version
cargo --version
```

## 9. 当前推荐启动方式

日常开发建议：

1. 一个终端运行 `npm run dev:core`
2. 一个终端运行 `npm run dev:tauri`

如果只是想快速看前端页面：

1. 一个终端运行 `npm run dev:core`
2. 一个终端运行 `npm run dev:desktop`
3. 浏览器打开 [http://127.0.0.1:1420](http://127.0.0.1:1420)
