# AI SSH

[English Documentation](README_EN.md) | 中文文档

AI SSH 是一个桌面优先的智能 SSH 工具，把 SSH 会话、文件管理、服务器状态和 AI 辅助能力放进同一个工作台里，适合日常运维、排障和批量操作。


## 它能做什么

- 多服务器 SSH 管理：分组、搜索、快速连接、会话标签切换
- 统一 AI 工作台：问答、命令生成、执行结论、历史对话
- 历史命令与收藏命令：便于重复执行常见操作
- 远程文件浏览：路径切换、文件预览、上传下载
- 服务器信息与指标：当前服务器、CPU、内存、磁盘、网络趋势
- 批量任务模式：对多台服务器执行同一类自然语言任务
- 桌面端工作流：更适合长时间盯终端、文件和 AI 协作的场景

## 界面总览

![AI SSH 总览](docs/images/readme/01-overview.jpg)

AI SSH 的主工作台分成三栏：

- 左侧是 SSH 服务器列表和文件模式入口
- 中间是会话主区域，没有活动会话时会显示快速连接
- 右侧是服务器信息、AI、历史命令和收藏命令

上面的截图展示的是英文模式下的真实工作台状态：已经连上一台服务器，执行了安全的只读巡检，并由 AI 在右侧总结网络、CPU 和 GPU 信息。文档中的服务器账号、IP 和端口都已经做了打码处理。

## 主要功能

### 1. SSH 服务器管理

- 支持服务器分组、搜索、快速定位
- 左侧工具栏区分了模式按钮和动作按钮
- 双击服务器即可发起会话
- 支持批量模式，为多主机场景做准备

![当前服务器详情](docs/images/detail/05-server-info.jpg)

- 右侧服务器信息面板会展示当前连接主机、登录用户和地址信息
- 配合 AI 会话上下文，便于在多服务器场景里确认当前操作对象

### 2. 远程文件浏览

![远程文件浏览](docs/images/readme/02-files.jpg)

- 左侧可切换到远程文件模式
- 支持路径输入、目录进入、文件列表浏览
- 适合配合 SSH 会话一起处理配置文件和日志文件

### 3. AI 助手与命令协作

- 连上 SSH 后，右侧 AI 可以结合当前会话、主机信息和终端上下文给出建议
- 支持直接问答、生成命令、分步执行建议和风险提示
- 审核模式下，AI 生成的命令需要人工确认后再执行，适合运维场景

![AI 历史命令](docs/images/readme/03-history.jpg)

- 支持 AI 对话历史查看，方便回看之前的巡检、排障和问答过程
- AI 消息流会展示步骤、结论和上下文说明

![AI 历史记录列表](docs/images/detail/12-ai-history-list.jpg)

- 历史列表支持展开、收起和快速回看
- 适合长链路排障、部署回顾和多轮问答跟踪

### 4. 收藏常用命令

![收藏命令](docs/images/readme/04-favorites.jpg)

- 可把常用命令加入收藏
- 支持快速复制、写回终端和直接执行
- 适合沉淀常见巡检、部署、排障动作

![命令历史记录](docs/images/detail/13-command-history.jpg)

- 历史命令与收藏命令配合使用，适合沉淀团队常用操作
- 可快速回看刚执行过的命令并再次复用

![命令收藏细节](docs/images/detail/14-command-favorites.jpg)

### 5. 应用设置、模型与技能

- 可在应用设置里调整语言、安全选项、服务器指标和 AI 运行参数
- 模型管理与技能管理已拆成独立入口，适合集中配置多个模型与多个可复用技能
- 适合把 AI 能力接到企业内网模型、云模型或自建模型服务

![设置菜单](docs/images/detail/01-settings-menu.jpg)

- 设置菜单中可直接进入应用设置、AI 模型和 AI 技能
- 更适合把基础设置和 AI 资产配置拆开管理

![应用设置](docs/images/readme/05-settings.jpg)

- 支持终端、指标、右侧面板等工作台参数调整
- 便于按个人习惯或团队环境做适配

![模型配置列表](docs/images/detail/02-models-table.jpg)

- 模型列表支持配置多个提供商和多个模型
- 可以分别指定哪个模型用于 AI Agent，哪个模型用于命令预测
- 支持 OpenAI 兼容接口、Claude 原生协议、Ollama 和自定义地址

![技能配置](docs/images/detail/03-skill-config.jpg)

- 技能支持单独配置名称和详细提示词
- 适合沉淀部署、巡检、排障等场景化工作方法

![技能选择](docs/images/detail/04-skill-picker.jpg)

- 在 AI 输入区可通过图标按钮多选技能
- 选中的技能会和当前模型一起生效，用于约束 AI 的工作方式

### 6. 命令预测与思考模式

![终端命令 AI 预测](docs/images/detail/07-command-prediction.jpg)

- 在终端输入时可触发 AI 命令预测
- 适合补全常见巡检、部署和排障命令

![开启预测思考](docs/images/detail/08-prediction-thinking-toggle.jpg)

- 可单独为预测模型开启思考模式
- 适合复杂命令生成前先做一层推理

![预测思考效果](docs/images/detail/09-prediction-thinking-result.jpg)

- 对复杂上下文下的命令生成更稳定
- 适合需要参考当前会话状态、错误信息或既有输出的场景

### 7. 审核执行与结果总结

![审核模式](docs/images/detail/10-review-mode.jpg)

- 审核模式下，AI 给出的命令需要人工确认后才会执行
- 更适合线上运维、变更执行和高风险命令场景

![AI 执行结果](docs/images/detail/11-ai-execution-result.jpg)

- 执行后会回传结果给 AI 做总结
- 便于直接得到“执行成功 / 失败原因 / 下一步建议”

### 8. 指标查看与输入体验

![指标放大查看](docs/images/detail/06-metrics-zoom.jpg)

- 右侧指标支持放大查看，更适合看 CPU、内存、磁盘、网络趋势
- 适合在会话上下文里直接判断资源瓶颈

![放大输入框](docs/images/detail/15-expanded-input.jpg)

- 输入区支持放大编辑，适合长问题、多步骤任务和复杂部署说明
- 对需要一次性交代较多背景的场景更友好

## 当前定位

AI SSH 现在已经具备一个完整的桌面工作台轮廓，重点在于：

- 把 SSH、文件、AI、指标放到同一个界面里
- 降低在多个工具之间来回切换的成本
- 让命令执行和结果理解都更顺手

## 项目文档

- [项目协作规则](AGENTS.md)
- [模块索引](docs/MODULE_INDEX.md)
- [产品设计文档](docs/product-design.md)
- [开发计划文档](docs/development-plan.md)
- [启动与查看效果说明](docs/run-and-preview.md)
- [打包与发布说明](docs/build-and-package.md)
