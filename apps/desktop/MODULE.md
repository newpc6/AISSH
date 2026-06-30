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
- 待实现：SSH 会话长任务实时输出流式 tail 推送到卡片、真正交互式/全屏程序退出码标记兼容性（交互式/全屏 TUI 不返回 prompt 时的标记识别）


## Agent 命令包装与退出码标记

Agent 在 SSH 会话中执行命令时，不直接发送用户命令原文，而是将命令包装为带退出码标记的复合指令发送。包装的目的：

- 在命令执行完毕后可靠捕获退出码（`$?`），不依赖远端 shell 提示符解析
- 通过唯一标记定位本次命令输出边界，与终端被动输出、备用屏程序输出区分
- 将包装/标记行从输出中过滤，避免污染历史命令和用户可见终端展示

### 包装格式

`wrapAgentCommand(command, marker)` 将原始命令包装为：

```
{
<原始命令（去除尾部空白）>
}
__ai_ssh_agent_exit_code=$?
command printf '\\n<marker>%s\\n' "$__ai_ssh_agent_exit_code"
unset __ai_ssh_agent_exit_code
```

关键设计：

- 命令体用 `{ ... }` 包裹，`{`、`}` 各占一行，支持多行命令和复合语句
- 命令执行后立即保存 `$?` 到临时变量 `__ai_ssh_agent_exit_code`，然后用 `command printf`（绕过 alias）输出标记行
- Marker 格式为 `__AI_SSH_AGENT_DONE_<sanitized_stepId>__`，由 `agentExitMarker(stepId)` 生成
- 最后 `unset` 清理临时变量

### 输出解析

`extractAgentExitCode(output, marker)`：用正则从输出中提取 marker 行紧邻的数值作为退出码，支持负数退出码。若未匹配到 marker 则返回 `undefined`。

`stripAgentMarker(output, marker)` / `stripVisibleAgentMarkers(output)`：

- 按行过滤，移除内部变量行、`printf` 标记行和 marker 输出行
- `isAgentInternalLine(line, marker?)` 识别以下模式为内部行：
  - 包含步骤唯一 marker 的行（如 `__AI_SSH_AGENT_DONE_xxx__ -1`）
  - 包含 `__AI_SSH_AGENT_DONE_` 前缀的行
  - 赋值行 `__ai_ssh_agent_exit_code=$?`
  - `unset` 行
  - `command printf` 或 `printf` 开始的标记输出行

### 执行与等待流程

`useAgentExecution.ts` 中 `executeAgentStep` 的执行流程：

1. 校验 SSH 会话可用性（连接状态、高风险确认）
2. 生成 `marker = agentExitMarker(step.id)`
3. 通过 `wrapAgentCommand(step.command, marker)` 包装命令
4. 发送包装命令到 SSH 会话 `executeCommandToSession(...)`
5. 注册 `agentWaiter`（含 `timeoutId`、`beforeContext`、`marker` 等），等待远端 SSH prompt 回调或超时
6. 远端 prompt 到达时 `handleAgentPrompt` 调用 `finishAgentStep`：
   - 从累积输出中提取退出码：`extractAgentExitCode(rawOutput, marker)`
   - 过滤内部行得到展示输出：`stripAgentMarker(rawOutput, marker)`
   - 更新步骤状态、审计事件、触发下一步规划
7. 超时时同样调用 `finishAgentStep(timedOut=true)`，退出码在超时场景不作判断

### 改动注意事项

- **内部标记不污染历史**：`stripAgentMarker` / `stripVisibleAgentMarkers` 必须覆盖 `isAgentInternalLine` 所有匹配模式；新增包装语法时同步更新过滤逻辑
- **多行命令**：`{ ... }` 块包装确保整个命令块在子 shell 或当前 shell 中原子执行；注意命令体内不应包含不配对的 `}`
- **末尾注释**：用户命令以注释结尾时（如 `cmd # comment`），`{ ... }` 包装后注释不会影响退出码保存行；验证场景：`echo test # debug comment`
- **非零退出码**：`extractAgentExitCode` 支持负数退出码；验证场景：`exit 1`、`exit 42`、`kill -9 $$`（shell 会以 128+9=137 退出）
- **超时**：超时场景不依赖 marker 提取退出码，但 marker 过滤逻辑仍需覆盖，避免超时后残留在后续输出中
- **修改 `wrapAgentCommand` 时**：确保新格式向后兼容旧 marker 解析逻辑；或同步更新 `extractAgentExitCode` / `isAgentInternalLine` / `handleAgentPrompt`
- **命令历史完整性**：包装后的内部行不应进入历史命令记录和终端回显缓存

### 近期修复约束

- 内部行过滤必须同时识别裸内部行和带 shell prompt 前缀的回显行，例如 `(base) user@host:~$ unset __ai_ssh_agent_exit_code`、`> command printf ...`。
- 批量执行状态消息只有最新进行中的状态卡显示 spinner，历史状态卡必须静态展示。
- 批量最终总结阶段如果最新状态卡已经显示 spinner，右侧面板底部不再额外显示全局实时返回 loading，也不展示已落盘执行结论的 Agent 状态残留。
- 批量模式下模型角标不再重复显示当前主机名，已选主机只在批量选择区域展示。
- 每条 AI 消息卡片 header 提供复制按钮，复制内容应包含该卡片的主要文本、Agent step 命令/退出码/输出摘要。

### 涉及文件

| 文件 | 相关函数/职责 |
|------|-------------|
| `src/agentCommand.ts` | `agentExitMarker`、`wrapAgentCommand`、`extractAgentExitCode`、`stripAgentMarker`、`stripVisibleAgentMarkers`、`isAgentInternalLine`、`escapeRegExp` |
| `src/utils.ts` | 重新导出 Agent 命令包装工具，供既有调用保持兼容 |
| `src/hooks/useAgentExecution.ts` | `executeAgentStep`（包装/发送/等待）、`handleAgentPrompt`（prompt 回调）、`finishAgentStep`（退出码提取/过滤/状态更新）、`agentWaitersRef`（超时管理） |
| `src/App.tsx` | Agent 执行流程编排、步骤卡片渲染（展示 `exitCode`、`output`、`timedOut` 等字段） |
| `src/types.ts` | Agent 步骤类型定义（`exitCode?`、`completedAt?`、`startedAt?`、`timeoutSeconds?`、`timedOut?`） |

### 手动验证要点

- 单行命令 + 非零退出码：执行 `false` 或 `sh -c 'exit 3'`，确认退出码正确展示且无 marker 残留
- 多行命令：执行 `{ echo a; echo b; }` 或多行 if/fi 语句，确认输出正确且无 marker / `command printf` 残留
- 末尾注释：执行 `ls -la # list files`，确认退出码正确
- 超时场景：设置极短超时（或在 Go core 中模拟延迟），确认超时后 marker 不残留在后续输出
- 跨步骤连续执行：Agent 连续多步执行，确认上一步 marker 不污染下一步输出
- 历史命令检查：在终端输入 `history` 或查看命令历史，确认不出现 `command printf`、`__AI_SSH_AGENT_DONE_` 等内部行
## 验证方式

```powershell
npm run typecheck:desktop
npm run test:desktop:agent-command
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

- 2026-06-30：新增 Agent 命令包装与退出码标记维护说明，记录包装格式（`wrapAgentCommand`/`agentExitMarker`）、输出解析（`extractAgentExitCode`/`stripAgentMarker`/`isAgentInternalLine`）、执行等待流程、改动注意事项和手动验证要点；涉及 `src/agentCommand.ts`、`src/utils.ts`、`src/hooks/useAgentExecution.ts`、`src/App.tsx`、`src/types.ts`。验证方式：`npm run test:desktop:agent-command`、`npm run typecheck:desktop`。
- 2026-06-30：修复批量执行状态卡 spinner、AI 消息卡复制、批量模式模型角标重复主机名和 Agent 内部命令回显过滤；涉及 `App.tsx`、`AIWorkspacePanel.tsx`、`agentCommand.ts`、`useAIMessageStore.ts`、`styles`。验证命令：`npm run test:desktop:agent-command`、`npm run typecheck:desktop`、`npm run build:desktop`。
- 2026-06-30：收敛批量最终总结阶段的重复 loading 展示，最新状态卡带 spinner 时隐藏底部全局实时返回提示，并避免显示重复的 Agent 状态残留；涉及 `App.tsx`、`AIWorkspacePanel.tsx`。验证命令：`npm run typecheck:desktop`。
