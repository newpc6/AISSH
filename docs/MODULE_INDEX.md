# AI SSH 模块索引

本文档登记项目所有模块，提供模块路径、职责摘要、维护文档路径和验证方式，供 AI 和开发者快速定位。

## 模块总览

| 模块 | 路径 | 职责 | 维护文档 |
|------|------|------|----------|
| core-go | `apps/core-go/` | Go 核心引擎：SSH/SFTP 连接管理、HTTP API 服务、AI 对话处理、数据持久化 | `apps/core-go/MODULE.md` |
| desktop | `apps/desktop/` | React 前端界面 + Tauri 2 桌面壳 | `apps/desktop/MODULE.md` |
| shared-contracts | `packages/shared-contracts/` | 前后端共享 TypeScript 接口、类型定义 | `packages/shared-contracts/MODULE.md` |
| docs | `docs/` | 项目文档：产品设计、开发计划、使用说明、打包说明 | `docs/MODULE.md` |

---

## core-go — `apps/core-go/`

**职责**：Go 编写的核心引擎，提供 HTTP API 服务，负责 SSH/SFTP 连接管理、终端流处理、AI 对话、命令执行和本地数据持久化。

**入口**：`apps/core-go/cmd/server/main.go`

**内部结构**：`apps/core-go/internal/server/` 包含路由、中间件、SSH/SFTP handler、AI handler、数据存储等。

**验证方式**：
```powershell
npm run test:core                # 运行 Go 测试
npm run build:core               # 构建可执行文件
npm run dev:core                 # 开发模式启动（含日志输出）
```

**依赖**：无内部模块依赖；提供 HTTP API 供 `desktop` 前端调用。

**关键约定**：
- 可执行文件输出到 `apps/core-go/bin/ai-ssh-core.exe`
- 运行时数据目录为可执行文件所在目录下的 `data/`
- 服务默认监听 `0.0.0.0:18555`（可通过环境变量覆盖）
- Shared contracts 定义的接口类型在前端以 TypeScript 使用，Go core 独立维护对应数据结构

---

## desktop — `apps/desktop/`

**职责**：React + TypeScript 前端应用，运行在 Tauri 2 桌面壳内。提供 SSH 管理、文件浏览、AI 助手、服务器指标等完整工作台界面。

**前端源码**：`apps/desktop/src/`
- `components/` — 可复用 UI 组件
- `hooks/` — 自定义 React hooks
- `locales/` — 国际化（`zh/`、`en/`）
- `ai/` — AI 助手面板、对话、命令预测
- `commands/` — 收藏命令、历史命令
- `files/` — 远程文件浏览
- `servers/` — 服务器列表、分组管理
- `sessions/` — SSH 会话终端
- `right-rail/` — 右侧面板（服务器信息、指标）
- `modals/` — 弹窗组件
- `styles/` — 样式
- `common/` — 通用工具

**Tauri 桌面壳**：`apps/desktop/src-tauri/`（Rust）

**验证方式**：
```powershell
npm run typecheck:desktop         # TypeScript 类型检查
npm run build:desktop             # 构建前端静态资源
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml  # 检查 Tauri Rust 工程
npm run dev:desktop               # 启动 Vite 开发服务器（浏览器访问 127.0.0.1:1420）
npm run dev:tauri                 # 启动 Tauri 桌面窗口
```

**依赖**：
- `core-go` — 所有数据操作通过 HTTP API 调用 Go core
- `shared-contracts` — 引用共享接口和类型定义

---

## shared-contracts — `packages/shared-contracts/`

**职责**：定义前后端共享的 TypeScript 接口、类型和常量，确保 API 契约一致。

**入口**：`packages/shared-contracts/src/index.ts`

**验证方式**：
```powershell
npm run typecheck:desktop         # 作为 desktop 类型检查的一部分验证
```

**依赖**：无内部模块依赖；被 `desktop` 前端引用。

---

## docs — `docs/`

**职责**：集中管理项目级文档，包括产品设计、开发计划、使用说明和模块索引。

**主要文档**：
- `product-design.md` — 产品愿景、架构决策、技术选型
- `development-plan.md` — 开发计划、里程碑状态、风险
- `run-and-preview.md` — 本地启动、调试方式
- `build-and-package.md` — 打包与发布流程
- `MODULE_INDEX.md` — 本文档，模块清单
- `MODULE.md` — docs 模块自身维护文档

**验证方式**：文档与代码一致性通过代码审核保证；无自动化验证。

---

## 模块文档规范

每个模块目录下应维护 `MODULE.md`，至少包含：
- 职责边界
- 目录/文件说明
- 核心流程与公开接口
- 依赖关系
- 验证方式
- 常见改动点
- 改动记录

修改模块代码、接口、配置或行为时，必须同步更新对应 `MODULE.md`。
