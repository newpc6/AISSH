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
- Go core 托管前端 Web，网页访问默认需要登录
- 桌面客户端启动后会尝试自动拉起内置 Go core，浏览器也可以访问同一服务
- `local-demo` 演示主机的终端输入输出链路
- 临时 SSH 主机密码认证连接
- 左侧加号弹窗新增 SSH 连接
- 服务器卡片右上角菜单，支持编辑、连接、复制配置和删除
- 文件菜单中的导入导出入口，可区分服务器列表和软件配置
- SSH 分组独立配置，可新建空分组、管理分组，并在新增连接时选择已有分组
- 服务器基础配置本地持久化
- 密码 / SSH Key 系统安全存储
- 工具菜单中的运行日志面板，可查看前端请求、Go core 请求和保存失败详情
- 顶部下拉菜单、分栏设置弹窗、会话 tab 关闭确认和断开后重连
- 每个 SSH 标签保留独立终端输出缓存，默认保留最新 1000 行
- 真实命令历史记录，基于用户键盘输入和回车提交，已过滤路径跟踪内部探测命令、终端控制序列和全屏程序输入
- 会话 tab 连接状态圆点、关闭后自动切换剩余会话、无会话空状态和最近服务器快捷连接；没有打开会话时不会显示“未连接”伪 tab
- SFTP 文件浏览、路径输入进入、上级目录、目录进入、上传、下载和基础传输进度
- 当前服务器 CPU 当前使用率、内存已用 / 总量、CPU / 内存带坐标折线趋势、悬浮点位详情和放大查看、卡片折叠、磁盘列表、网络实时上下行带宽展示；指标由 Go core 解析远端 `/proc` 与 `df` 原始数据
- AI 大模型地址、Key、模型设置入口和 OpenAI 兼容命令预测

当前还未完成：

- agent 认证
- known\_hosts 严格校验
- 桌面原生级拖出下载体验

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

如果希望使用“带登录的完整 Web 服务”，优先使用 `方式二`。本节是开发调试模式，Vite 会代理到 Go core。

### 步骤 1：启动 Go core

在项目根目录打开一个终端窗口，执行：

```powershell
npm run dev:core
```

说明：

- `npm run dev:core` 会先编译 Go core 到固定路径 `apps/core-go/bin/ai-ssh-core.exe`
- 随后从这个固定路径启动服务，不再使用 `go run` 的临时目录可执行文件
- 默认会把 `AI_SSH_HOME` 设置为项目根目录，因此会读取项目下的 `data/hosts.json` 和 `data/web-auth.json`

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

- <http://127.0.0.1:1420>

### 预期效果

你应该能看到：

- 左侧是 SSH 服务器列表与文件模式切换，默认宽度更大，并可拖动调整
- 中间是终端会话主区域和会话标签栏
- 右侧是当前服务器信息、AI 工具和历史命令
- 选择 `Local Demo` 后点击中间会话栏的 `+`，终端区域会进入演示 shell

如果 Go core 已正常启动，页面会显示：

- `core 已连接`

如果 Go core 没启动或端口异常，页面会显示：

- `core 未连接`

### 终端演示

当前可以用 `Local Demo` 主机验证终端输入输出：

1. 在左侧主机列表选择 `Local Demo`
2. 点击中间会话栏的 `+`
3. 在终端区域输入任意文本并按回车

预期效果：

- 终端会回显输入内容
- 输入 `clear` 并回车会清屏

说明：

- `Local Demo` 不会连接真实服务器
- 它用于验证前端 xterm、Go core 会话注册、SSE 输出流和 input 写入接口

### 新增 SSH 连接

当前可以通过左侧服务器列表上方的 `+` 添加真实服务器：

1. 点击左侧 `SSH` 面板中的 `+`
2. 填写名称、分组、地址、端口、用户和认证方式
3. 如果需要保存密码或 SSH Key，勾选对应保存选项后填写内容
4. SSH Key 可以直接粘贴，也可以点击 `选择文件` 读取本地私钥文件
5. 点击 `保存`
6. 保存成功后对话框会自动关闭，新服务器会出现在左侧列表并自动选中
7. 双击服务器列表中的服务器可直接创建 SSH 会话，也可以点击中间会话栏的 `+`
8. 在顶部 `文件` 菜单中可以选择导出服务器列表、导出服务器列表（含加密凭据）、导出软件配置、导入服务器列表或导入软件配置
9. 点击服务器卡片右上角 `⋯` 可打开菜单，执行编辑、连接、复制配置和删除

### 管理 SSH 分组

当前可以通过左侧 `SSH` 面板中的 `分组` 按钮管理服务器分组：

1. 点击左侧服务器列表上方的 `分组`
2. 点击 `新增分组` 可以创建空分组
3. 修改输入框可以重命名分组，保存后该分组下的服务器会一起迁移到新分组名
4. 未被服务器使用的分组可以删除；已有服务器使用中的分组会禁用删除按钮
5. 点击 `保存` 后，分组会写入本地配置文件

新增或编辑 SSH 连接时，分组输入框会提供已有分组选项，也可以直接输入新分组名称。

说明：

- 当前服务器基础配置默认保存在 Go core 当前工作目录下的 `data/hosts.json`
- 调试模式下，当前工作目录通常是项目或 `apps/core-go` 目录；打包后应由启动器把 Go core 工作目录设置为程序数据目录，这样配置会跟随该运行目录
- 如果需要指定程序数据目录，可以在启动 Go core 前设置 `AI_SSH_HOME`，此时默认配置路径为 `%AI_SSH_HOME%\data\hosts.json`
- 如果需要精确指定配置文件，可以设置 `AI_SSH_HOSTS_PATH`；它的优先级高于 `AI_SSH_HOME`
- 密码和 SSH Key 默认会写入操作系统安全存储，不会明文写入本地 `hosts.json`
- 普通导出不会携带密码和 SSH Key；选择“导出服务器列表（含加密凭据）”时，会生成一个带 `exportKey` 的加密 JSON，导入到其他电脑后会解密并写入目标电脑的系统安全存储
- SSH Key 会分片写入系统安全存储，以兼容较长私钥内容
- 带 `exportKey` 的导出文件可以恢复凭据，请只在可信设备和可信人员之间传递
- 如果系统安全存储不可用或保存失败，新增对话框会显示具体错误
- 当前为了先打通连接链路，host key 使用临时宽松校验；后续会补 known\_hosts 校验和 agent 认证

### 文件浏览与传输

真实 SSH 会话连接后，可以点击左侧 `文件` 进入文件浏览：

1. 文件面板会通过 SFTP 加载当前路径
2. 可以在路径输入框输入远程路径并按回车进入目录
3. 点击 `上级` 进入当前目录的父级目录
4. 双击文件夹进入目录
5. 右键或双击文件可以下载
6. 点击 `上传` 或把本地文件拖进文件面板可以上传，支持多个文件
7. 面板底部会展示最近上传/下载任务的基础进度
8. 勾选 `跟踪终端路径` 后，系统会被动识别常见 shell prompt 中的当前目录并尝试刷新文件面板路径；切换到文件页时也会读取当前会话最后识别到的路径兜底刷新

说明：

- SFTP 文件能力需要真实 SSH 主机支持 SFTP 子系统
- 路径跟踪不再向远端自动注入 `printf` 命令，因此不会污染终端历史；如果远端自定义 prompt 不包含 `user@host:/path$` 这类路径信息，文件面板可能需要手动进入目录
- 浏览器/WebView 对拖出到桌面的文件下载有限制，当前先提供下载链接/右键下载和拖动下载数据；后续会用 Tauri 原生能力增强拖出下载

### 查看运行日志

当前可以通过顶部菜单中的 `工具` 下拉菜单打开运行日志面板：

1. 点击顶部菜单栏 `工具`
2. 点击 `日志`
3. 在弹窗中查看最近的前端请求、Go core 请求和错误信息
4. 通过右上角日志级别下拉框切换 `debug`、`info`、`warn`、`error`
5. 点击 `刷新` 可以重新从 Go core 拉取最新日志

### 设置与 AI 预测

当前可以通过顶部 `设置` 下拉菜单打开偏好设置：

- 设置弹窗分为 `通用`、`安全`、`服务器指标`、`AI` 四个菜单
- 在 `服务器指标` 中设置服务器信息刷新频率，默认 2 秒
- 设置 CPU / 内存折线图的时间范围，默认 5 分钟
- 设置 CPU / 内存图表圆点数量，小图默认 5 个，放大图默认 20 个
- 在 `通用` 中设置每个 SSH 标签保留的终端行数，默认 1000 行
- 在 `AI` 中设置 AI 大模型地址、API Key、模型名、系统提示词、预测命令数量、终端上下文字符数和历史命令条数，预测数量默认 3 条。AI 地址按 OpenAI 兼容接口的 base URL 填写，例如 `https://api.openai.com/v1` 或本地兼容服务 `http://127.0.0.1:11434/v1`
- 开启或关闭 AI 命令预测
- 修改后点击 `保存`，弹窗内会显示保存成功提示

说明：

- 当前右侧 AI 是统一输入入口，会自动判断用户是在问答、解释、总结日志、生成命令，还是要驱动终端完成任务；审核 / 自动模式在同一个面板中切换
- 当前 AI 预测和统一 AI 助手都会通过 Go core 调用 OpenAI 兼容 `/chat/completions`，流式接口会实时展示 thinking / content，结束后再展示正式命令候选或助手结果
- 地址填写 base URL，不需要填写到 `/chat/completions`；Go core 会在 base URL 后拼接对应接口路径
- 预测返回多条命令，第一条会作为 Tab 默认候选，并在终端区域用浅灰色提示；按 Tab 会填入命令，仍需按回车执行
- 在终端里框选文本后，终端区域会出现“加入 AI”按钮，点击后会把选中文本追加到右侧 AI 输入框
- 当前偏好设置保存在浏览器前端本地存储 `localStorage` 的 `ai-ssh-settings` 中；导出软件配置会包含这些设置，后续会迁移到统一的软件配置存储

### 会话切换与重连

- 打开多个 SSH 会话后，切换标签会恢复该标签自己的终端输出缓存，不再只显示“已切换到某服务器”
- 每个标签默认保留最新 1000 行终端输出，可以在 `设置` -> `偏好设置` 中调整
- 会话断开或输出流失败后，终端头部会显示 `重连` 按钮，也可以从顶部 `会话` 菜单点击 `重连当前`
- 重连会在当前标签上创建新的后端会话，并保留原标签中的历史输出
- CPU / 内存卡片为顶部信息、下方图表的上下布局，图表右上侧可点击无边框放大图标查看大图
- 鼠标放到 CPU / 内存图表上时，会吸附最近采样点并显示具体时间和使用率；内存还会显示已用 / 总量
- 小图和放大图都会保留完整折线趋势，圆点按偏好设置控制数量，避免图表显得拥挤
- 紧凑图标按钮均补充了悬浮文字提示，例如新增、导出、更多、关闭、刷新、放大等

说明：

- 如果新增 SSH 连接保存失败，先查看弹窗内错误提示，再打开 `工具` 的运行日志确认具体接口、状态码和后端错误
- 如果前端访问同源 `/api` 返回 HTTP 405，当前会自动重试直连 `http://127.0.0.1:18555/api`，并在运行日志中记录主请求和回退请求
- Go core 控制台也会输出请求日志，方便调试接口是否被正确调用
- 如果会话输出流连接失败，终端区域会显示错误信息，会话状态会从 `connecting` 切换到 `error`
- 终端尺寸会跟随窗口和 xterm 实际行列同步到后端 PTY；如果刚打开的 vim 仍显示错位，可以先刷新前端并重启当前 SSH 会话确认 Go core 已更新

## 6. 方式二：启动 Tauri 桌面版

这个方式用于查看当前桌面壳效果。

### 步骤 1：开发模式先准备 core 可执行文件

Tauri 窗口启动时会尝试自动拉起 Go core。开发模式首次运行前，在项目根目录执行：

```powershell
npm run build:desktop
powershell -ExecutionPolicy Bypass -File scripts/prepare-tauri-core.ps1
```

说明：

- 脚本会编译 `ai-ssh-core.exe`
- 脚本会把前端 `dist` 复制到 Tauri resources，用于客户端启动后的浏览器 Web 访问
- 现在 `npm run dev:tauri` 也会先执行 `npm run build:core`，并优先使用 `apps/core-go/bin/ai-ssh-core.exe`

如果你不想让 Tauri 自动启动 core，可以设置：

```powershell
$env:AI_SSH_DESKTOP_NO_CORE = "1"
```

然后手动启动 core：

```powershell
npm run dev:core
```

### 步骤 2：启动 Tauri

在项目根目录执行：

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
- 同时可以在浏览器访问 <http://127.0.0.1:18555>，局域网或公网可访问 `http://服务器IP:18555`
- 浏览器访问需要登录；默认用户是 `admin`

说明：

- 如果未配置 `AI_SSH_WEB_PASSWORD`，Go core 首次启动会自动生成初始密码并写入 `%AI_SSH_HOME%\data\web-auth.json`
- 桌面客户端会用本机一次性令牌自动登录内置窗口；普通浏览器仍需要输入账号密码
- 打包版会把 `ai-ssh-core.exe` 和 Web 前端资源一起放进安装包，客户端启动后自动拉起 `0.0.0.0:18555` 服务；浏览器访问仍需要登录
- 绿色便携版位于 `release/portable`，拷贝整个目录后双击 `AI SSH Portable.bat` 即可运行，数据默认保存在便携目录下的 `data`

## 7. 方式三：只启动 Web 服务

这个方式适合部署在服务器上，只提供浏览器访问。

### 本地开发启动

在项目根目录执行：

```powershell
$env:AI_SSH_WEB_USER = "admin"
$env:AI_SSH_WEB_PASSWORD = "你的密码"
npm run serve:web
```

然后访问：

- 本机：<http://127.0.0.1:18555>
- 局域网或服务器：`http://服务器IP:18555`

### 使用已编译 core 启动

先构建前端和 Go core：

```powershell
npm run build:desktop
npm run build:core
```

然后启动：

```powershell
$env:AI_SSH_WEB_ROOT = "apps/desktop/dist"
$env:AI_SSH_WEB_USER = "admin"
$env:AI_SSH_WEB_PASSWORD = "你的密码"
apps/core-go/bin/ai-ssh-core.exe
```

常用环境变量：

- `AI_SSH_CORE_PORT`：服务端口，默认 `18555`
- `AI_SSH_BIND_HOST`：监听地址，默认 `0.0.0.0`；如只允许本机访问可设为 `127.0.0.1`
- `AI_SSH_WEB_ROOT`：前端静态资源目录，通常是 `apps/desktop/dist`
- `AI_SSH_WEB_USER`：网页登录用户名，默认 `admin`
- `AI_SSH_WEB_PASSWORD`：网页登录密码；未设置时会自动生成并保存到 `data/web-auth.json`
- `AI_SSH_WEB_AUTH=0`：关闭网页登录认证，仅限本机临时调试使用
- `AI_SSH_HOME`：数据目录，影响 `data/hosts.json` 和 `data/web-auth.json`

## 8. 构建检查

如果你只想验证工程是否能编译通过，可以在项目根目录执行：

```powershell
npm run build:desktop
npm run test:core
```

如果你要验证 Tauri Rust 工程是否正常：

```powershell
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## 9. 常见问题

### 9.1 页面显示 core 未连接

排查顺序：

1. 确认 `npm run dev:core` 是否仍在运行
2. 确认 18555 端口未被其他进程占用
3. 确认前端开发服务是否正常启动

可直接访问以下地址检查：

- <http://127.0.0.1:18555/api/health>

如果正常，应返回一段 JSON。

### 9.2 新增 SSH 连接保存失败或出现 HTTP 405

排查顺序：

1. 确认 `npm run dev:core` 正在运行
2. 打开顶部 `工具` 菜单查看运行日志
3. 检查是否出现 `/api/hosts` 的 405 记录，以及后续是否自动回退到 `http://127.0.0.1:18555/api/hosts`
4. 如果回退请求也失败，查看 Go core 终端输出的请求日志和错误日志
5. 如果使用 SSH Key 认证，确认私钥内容完整；较长 SSH Key 会自动分片保存到系统安全存储

当前保存主机成功后，对话框会自动关闭，新主机会插入左侧服务器列表并自动选中。

### 9.3 Tauri 启动失败

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

### 9.4 命令可用但当前终端找不到 rustc / cargo

通常是因为安装后当前终端没有刷新环境变量。

可尝试：

1. 关闭并重新打开终端
2. 再执行：

```powershell
rustc --version
cargo --version
```

## 10. 当前推荐启动方式

日常开发建议：

1. 直接运行 `npm run dev:tauri`
2. 如果 resources 中的 core 或 Web 资源需要刷新，再运行 `powershell -ExecutionPolicy Bypass -File scripts/prepare-tauri-core.ps1`
3. 重启 `npm run dev:tauri`

如果只是想快速看前端页面：

1. 一个终端运行 `npm run dev:core`
2. 一个终端运行 `npm run dev:desktop`
3. 浏览器打开 <http://127.0.0.1:1420>

`npm run dev:core` 启动的进程路径应为 `apps/core-go/bin/ai-ssh-core.exe`；如果任务管理器里看到 `go-build...server.exe`，说明还有旧的 `go run` 进程没关。

如果要模拟服务器 Web 部署：

1. 设置 `AI_SSH_WEB_USER`、`AI_SSH_WEB_PASSWORD`、`AI_SSH_BIND_HOST`
2. 运行 `npm run serve:web`
3. 浏览器打开 <http://127.0.0.1:18555>
