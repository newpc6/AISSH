# AGENTS.md — AI SSH 项目协作规则

## 项目简介

AI SSH 是一个桌面优先的智能 SSH 工具，把 SSH 会话、文件管理、服务器状态和 AI 辅助放进同一个工作台。技术栈：**Tauri 2 + React/TypeScript（桌面壳+前端） + Go（核心引擎）**。

详见：
- [README.md](README.md) — 功能总览、快速入口
- [产品设计文档](docs/product-design.md) — 产品愿景、架构决策、技术选型
- [开发计划文档](docs/development-plan.md) — 里程碑、交付物、进度
- [模块索引](docs/MODULE_INDEX.md) — 模块清单、职责、维护文档

## 语言与格式

- 默认使用**中文**回复。
- 代码、命令、文件名、API 名称、日志关键字保持原文。
- 回答优先简洁清楚；复杂任务保留关键上下文和验证结果。

## 必读文档

每次任务开始前，至少读取：
1. 本文档（`AGENTS.md`）
2. [模块索引](docs/MODULE_INDEX.md)
3. 当前任务涉及的模块目录下的 `MODULE.md`

需要理解架构、里程碑或产品方向时，额外读取：
- [产品设计文档](docs/product-design.md)
- [开发计划文档](docs/development-plan.md)

需要本地启动、调试或打包时，参考：
- [启动与查看效果说明](docs/run-and-preview.md)
- [打包与发布说明](docs/build-and-package.md)

如果文档与实际代码冲突，以代码为准，并在本次任务中修正文档或记录缺口。

## 验证命令

| 用途 | 命令 |
|------|------|
| 前端类型检查 | `npm run typecheck:desktop` |
| 前端构建 | `npm run build:desktop` |
| Go core 测试 | `npm run test:core` |
| Go core 构建 | `npm run build:core` |
| Tauri Rust 检查 | `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` |
| 启动 Go core 开发服务 | `npm run dev:core` |
| 启动前端开发服务器 | `npm run dev:desktop` |
| 启动 Tauri 桌面窗口 | `npm run dev:tauri` |
| 一键开发启动 | 双击 `start-dev.bat` |
| 一键打包（完整） | `build-release.bat` |
| 一键打包（绿色便携版） | `build-portable.bat` |
| Web 服务启动 | `npm run serve:web` |

## 模块与文档规则

1. **每个模块目录下必须有 `MODULE.md`**，记录模块职责、接口、数据结构、验证方式、改动记录。
2. 新增、删除、拆分、合并或重命名模块时，必须同步更新 `docs/MODULE_INDEX.md`。
3. 修改模块代码、接口、配置或行为时：
   - 先读取模块的 `MODULE.md`，不存在则先创建。
   - 改动后更新 `MODULE.md` 和（如需要）模块索引、架构文档、README。
4. `MODULE.md` 是项目文档，**必须提交**，不得加入 `.gitignore`。
5. 跨模块改动需同时更新每个受影响模块的 `MODULE.md`。

## 模块清单

| 模块 | 路径 | 职责 |
|------|------|------|
| core-go | `apps/core-go/` | Go 核心引擎：SSH/SFTP 连接管理、HTTP API、AI 对话、数据持久化 |
| desktop | `apps/desktop/` | React 前端 + Tauri 2 桌面壳 |
| shared-contracts | `packages/shared-contracts/` | 前后端共享 TypeScript 接口定义 |
| docs | `docs/` | 项目文档：产品设计、开发计划、使用说明、打包说明、模块索引 |

## 分支与提交约定

- 不要 push，除非用户明确要求。
- 每次完成代码或文档调整后，stage 本次相关文件并提交。
- 提交风格（参考开发计划文档）：
  - `docs:` — 文档变更
  - `chore:` — 工程脚手架、脚本
  - `feat(core):` — Go 核心引擎功能
  - `feat(files):` — 文件管理功能
  - `feat(ai):` — AI 功能
  - `fix:` — 缺陷修复
  - `refactor:` — 重构
- 模块文档 `MODULE.md` 必须随相关改动一同 stage 和提交。

## 工作流

### 简单任务
直接完成，不额外增加流程步骤。

### 复杂任务
1. 明确目标、验证方式、边界条件。
2. 读取必要文档和代码。
3. 拆分风险点（跨模块、耗时、需独立验证的部分）。
4. 实施最小必要改动，避免无关重构。
5. 运行相关验证命令（见上表）。
6. 检查并按需更新文档。
7. Stage 并提交。

## 安全与审计

- 敏感凭据（密码、SSH Key）优先使用操作系统安全存储，不在日志或代码中明文记录。
- AI 默认不静默执行命令；审核模式下 AI 生成的命令需人工确认。
- 向 AI 发送上下文前需考虑脱敏。
- 前端尽量不直接管理原始 SSH 密钥；连接建立由 Go core 负责。

## 数据存储路径

- 服务器配置：Go core 所在目录下的 `data/hosts.json`
- AI 对话历史：`data/ai-chat.sqlite3`
- 网页登录配置：`data/web-auth.json`
- 系统安全存储：密码与 SSH Key 存入 OS Keychain / Credential Manager

## 禁止事项

- 不允许删除失败测试来制造通过。
- 不允许无说明地跳过测试或检查。
- 不允许关闭或降低 lint、typecheck、CI、构建规则。
- 不允许隐藏错误日志。
- 不允许无说明地修改测试预期。
- 不允许做无关重构扩大改动范围。
- 不要回滚用户已有改动，除非用户明确要求。
- 不要提交二进制、构建产物、私密配置或无关文件。
- 不要把 `D:\worklog\` 当项目文档。
- 不用聊天总结替代项目内文档。
