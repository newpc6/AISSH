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

## Agent 步骤观察 UI

右侧 AI 面板中 Agent 执行步骤卡片展示执行观察摘要，数据来源为 Agent step 的实时状态和随 AI 消息持久化的执行观察字段。

卡片展示内容：

- 执行状态（pending / approved / running / executed / failed / skipped）
- 风险等级（低风险 / 高风险需确认）
- 退出码（非 0 时提示，并继续交给 AI 判断）
- 输出摘要（截断后的命令输出尾部）
- 超时提示（超时时显示暂停提示和配置的超时阈值）
- 执行观察字段（开始时间、完成时间、超时阈值、超时状态）

涉及文件：

- `src/App.tsx`：Agent 执行流程编排、步骤卡片渲染和观察摘要 UI。
- `src/hooks/useAgentExecution.ts`：负责 Agent 生命周期状态管理、执行观察字段更新与审计事件写入。
- `src/styles/ai.css`：维护 Agent 步骤观察摘要样式。

与 Agent 审计写入的关系：

- 审计写入在建议/批准/开始/完成/超时/阻断/跳过时向 Go core 写入事件
- 步骤观察 UI 读取 Agent 执行 hook 更新到 step 的实时/持久字段，不直接依赖审计查询 API
- 卡片展示不依赖审计写入成功：审计失败只记录运行日志，卡片仍显示实时状态

当前边界：

- 已实现：状态、风险、退出码、输出摘要、超时提示和执行观察字段的基础卡片展示
- 待实现：SSH 会话长任务实时输出流式 tail 推送到卡片、复杂 Shell 退出码兼容

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

Agent 步骤观察 UI 手动验证要点：

- 在右侧 AI 面板以 Agent 模式执行多步任务
- 观察步骤卡片状态流转：running → executed / failed / skipped
- 确认退出码、输出摘要、超时提示和执行观察字段正确展示
- 验证 cards 在审核模式和自动模式下的行为差异

## 常见改动点

- 修改接口字段：先更新 `packages/shared-contracts`，再更新表单、调用和文案。
- 修改主机/会话流程：确认断开、重连、错误提示和日志入口仍清晰。
- 修改 AI 面板：保持统一输入、消息追加、审核/自动模式语义稳定。
- 修改 Agent 步骤卡片：确认状态流转（running→executed/failed/skipped）、退出码展示和执行观察摘要逻辑不受影响。
- 修改布局：避免全局滚动和文本溢出。

## 改动记录

- 2026-06-30：主机弹窗新增 host key 校验策略选择，并同步中英文文案；涉及 `App.tsx`、`HostDialog.tsx`、`useHostDialogState.ts`、`utils.ts`、`locales`。验证命令：`npm run typecheck:desktop`、`npm run build:desktop`。
- 2026-06-30：Agent 执行链路接入命令级审计事件写入；涉及 `App.tsx`、`useAgentExecution.ts`、`utils.ts`。验证命令：`npm run typecheck:desktop`、`npm run build:desktop`。
- 2026-06-30：新增 Agent 步骤观察 UI 维护说明，记录步骤卡片展示内容、涉及文件、与审计写入的关系、边界和验证命令；涉及 `src/App.tsx`、`src/hooks/useAgentExecution.ts`、`src/styles/ai.css`。验证命令：`npm run typecheck:desktop`、`npm run build:desktop`。
