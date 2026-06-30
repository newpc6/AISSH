# desktop 模块说明

## 职责边界

`apps/desktop` 是 AI SSH 的 React + TypeScript 前端和 Tauri 2 桌面壳，负责桌面工作台 UI、SSH 会话标签、文件浏览/预览、AI 对话、设置、运行日志和本地桌面能力调用。

## 关键目录

- `src/App.tsx`：主工作台编排入口，当前仍承载较多状态和流程。
- `src/components/`：按功能拆分的 UI 组件。
- `src/hooks/`：会话、AI、文件、弹窗等自定义 hooks。
- `src/locales/`：中英文国际化文案。
- `src/styles/`：基础、AI、右侧栏、弹窗、响应式样式。
- `src-tauri/`：Tauri 2 桌面壳、权限、sidecar 启动。

## 主机配置 UI

新增或编辑 SSH 主机时，前端维护 `HostUpsertRequest` 表单并提交给 Go core。SSH 主机支持密码、私钥和 Agent 认证，并提供 host key 校验策略：

- `accept-new`：首次信任并保存。
- `strict`：严格校验 known_hosts。
- `off`：关闭校验，不安全，仅用于调试。

WSL 连接不使用 SSH host key 校验。

## Agent 审计写入

前端在 Agent 执行链路中向 Go core `/api/ai/agent-audit` 写入命令级审计事件。写入点包括：

- AI 生成下一步命令。
- 用户确认或自动模式批准执行。
- 命令开始、完成、超时、阻断和跳过。
- 审计写入失败只记录运行日志，不阻断当前 SSH/Agent 操作。

## 验证方式

```powershell
npm run typecheck:desktop
npm run build:desktop
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

涉及 UI 体验时应启动开发环境手动验证：

```powershell
npm run dev:core
npm run dev:tauri
```

## 常见改动点

- 修改接口字段：先更新 `packages/shared-contracts`，再更新表单、调用和文案。
- 修改主机/会话流程：确认断开、重连、错误提示和日志入口仍清晰。
- 修改 AI 面板：保持统一输入、消息追加、审核/自动模式语义稳定。
- 修改布局：避免全局滚动和文本溢出。

## 改动记录

- 2026-06-30：主机弹窗新增 host key 校验策略选择，并同步中英文文案；涉及 `App.tsx`、`HostDialog.tsx`、`useHostDialogState.ts`、`utils.ts`、`locales`。验证命令：`npm run typecheck:desktop`、`npm run build:desktop`。
- 2026-06-30：Agent 执行链路接入命令级审计事件写入；涉及 `App.tsx`、`useAgentExecution.ts`、`utils.ts`。验证命令：`npm run typecheck:desktop`、`npm run build:desktop`。
