# core-go 模块说明

## 职责边界

`apps/core-go` 是 AI SSH 的核心引擎，负责 HTTP API、SSH/SFTP 会话、远程命令、服务器指标、AI provider 代理、AI 对话持久化、本地配置和凭据存储。前端不直接连接 SSH，也不直接调用模型服务。

## 关键目录

- `cmd/server/main.go`：Go core 入口。
- `internal/server/server.go`：核心数据结构、会话管理、主机配置、HTTP handler 依赖的业务能力。
- `internal/server/http.go`：HTTP 路由和接口绑定。
- `internal/server/remote.go`：SSH/SFTP、WSL、远程文件、指标采集。
- `internal/server/credentials.go`：系统安全存储凭据读写。
- `internal/server/ai*.go`：AI 预测、统一助手、模型/技能/对话存储。

## SSH 安全与认证

- `authType=password` 使用系统安全存储中的密码。
- `authType=privateKey` 使用系统安全存储中的私钥内容。
- `authType=agent` 通过 `SSH_AUTH_SOCK` 连接本机 SSH agent。
- `hostKeyPolicy=accept-new` 是默认策略：首次连接新主机时写入本机 `known_hosts`，之后校验指纹。
- `hostKeyPolicy=strict` 只允许已存在于 `known_hosts` 的主机指纹。
- `hostKeyPolicy=off` 关闭 host key 校验，仅用于临时调试，不能作为默认值。

## 数据与配置

- 主机配置默认保存在 Go core 可执行文件所在目录下 `data/hosts.json`。
- 网页登录配置保存在 `data/web-auth.json`。
- AI 对话历史保存在 `data/ai-chat.sqlite3`。
- 密码和私钥不写入 `hosts.json`，只写入 OS Keychain / Credential Manager。

## 验证方式

```powershell
npm run test:core
npm run build:core
```

涉及 SSH 连接、文件传输、AI 执行闭环时，还应结合桌面端或 Web 端做手动联调。

## 常见改动点

- 新增或调整 API：同步检查 `packages/shared-contracts/src/index.ts` 和前端调用。
- 修改主机配置字段：保持旧 `hosts.json` 向后兼容，缺字段必须有默认值。
- 修改凭据、host key、Agent 执行：补单元测试，避免记录敏感信息。

## 改动记录

- 2026-06-30：补充 SSH agent 认证、known_hosts 策略说明；涉及 `remote.go`、`server.go`、`server_test.go`。验证命令：`npm run test:core`。
