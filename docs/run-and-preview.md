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
- `local-demo` 演示主机的终端输入输出链路
- 临时 SSH 主机密码认证连接
- 服务器新增、编辑、删除、导入导出入口
- 服务器基础配置本地持久化

当前还未完成：

- 密码 / SSH Key 系统安全存储
- agent 认证
- known_hosts 严格校验
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
- 选择 `Local Demo` 后点击 `创建会话`，终端区域会进入演示 shell

如果 Go core 已正常启动，页面会显示：

- `core 已连接`

如果 Go core 没启动或端口异常，页面会显示：

- `core 未连接`

### 终端演示

当前可以用 `Local Demo` 主机验证终端输入输出：

1. 在左侧主机列表选择 `Local Demo`
2. 点击 `创建会话`
3. 在终端区域输入任意文本并按回车

预期效果：

- 终端会回显输入内容
- 输入 `clear` 并回车会清屏

说明：

- `Local Demo` 不会连接真实服务器
- 它用于验证前端 xterm、Go core 会话注册、SSE 输出流和 input 写入接口

### 临时 SSH 连接

当前可以在右侧 `临时连接` 区域填写真实服务器信息：

1. 填写地址，例如 `192.168.1.10`
2. 填写端口，默认 `22`
3. 填写用户名
4. 填写密码
5. 点击 `连接临时主机`

说明：

- 密码只用于本次连接请求，不会写入本地文件或持久化存储
- 当前为了先打通连接链路，host key 使用临时宽松校验
- 后续会补 known_hosts 校验、私钥认证、agent 认证和安全存储

### 服务器管理

当前右侧 `服务器管理` 区域可以维护左侧 SSH 服务器列表：

1. 点击左侧服务器，右侧会进入编辑状态
2. 修改名称、分组、地址、端口、用户、认证方式
3. 点击 `保存`
4. 点击顶部 `导出` 可以把当前服务器列表复制到剪贴板
5. 点击顶部 `导入` 会导入一条示例服务器

说明：

- 当前服务器基础配置会保存在用户配置目录下的 `ai-ssh/hosts.json`
- 如果需要临时指定存储位置，可以在启动 Go core 前设置 `AI_SSH_HOSTS_PATH`
- 密码和 SSH Key 当前只在本次运行内存中使用，不会写入本地 JSON，也不会出现在导出结果中
- 后续会接入系统安全存储来保存密码和 SSH Key

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
