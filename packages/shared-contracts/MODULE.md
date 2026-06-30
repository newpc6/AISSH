# shared-contracts 模块说明

## 职责边界

`packages/shared-contracts` 保存前端使用的共享 TypeScript 契约，包括 API 常量、请求/响应类型、主机、会话、AI、文件和指标相关类型。Go core 使用独立 Go 结构体，但字段语义必须与这里保持一致。

## 关键文件

- `src/index.ts`：共享类型和常量入口。
- `package.json`：工作区包声明。

## 契约维护规则

- 新增后端接口字段时，优先在这里补类型，再更新前端调用。
- 旧字段不能随意删除；需要兼容已有本地数据和旧前端状态。
- 可选字段用 `?` 表达向后兼容。
- 枚举类型新增值时，前端 UI、默认值、i18n 和后端归一化逻辑都要同步。

## 验证方式

```powershell
npm run typecheck:desktop
npm run build:desktop
```

## 改动记录

- 2026-06-30：新增 `HostKeyPolicy` 类型，并为 `HostRecord`、`HostUpsertRequest`、`TransientHostConfig` 增加 `hostKeyPolicy` 可选字段。验证命令：`npm run typecheck:desktop`。
