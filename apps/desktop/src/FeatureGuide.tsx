type FeatureItem = {
  name: string
  description: string
  usage: string
}

type FeatureModule = {
  title: string
  summary: string
  features: FeatureItem[]
}

const featureModules: FeatureModule[] = [
  {
    title: '服务器管理',
    summary: '集中维护 SSH 服务器、分组、认证方式和导入导出。',
    features: [
      { name: '服务器列表', description: '按分组展示服务器，支持搜索名称、地址和端口。', usage: '在左侧 SSH 面板选择服务器，双击或点击新建会话连接。' },
      { name: '分组管理', description: '为服务器建立分组，便于区分环境、业务或客户。', usage: '在会话菜单或左侧工具栏打开分组管理，调整后保存。' },
      { name: '导入导出', description: '导出服务器列表或完整软件配置，也可以带加密凭据导出。', usage: '在文件菜单中选择导入或导出，桌面版会优先使用文件。' },
    ],
  },
  {
    title: '终端会话',
    summary: '管理多个 SSH 会话，保留终端输出，并跟踪远程路径。',
    features: [
      { name: '多会话标签', description: '每台服务器可以打开独立会话标签。', usage: '从左侧服务器列表创建会话，在中间标签栏切换或关闭。' },
      { name: '命令历史', description: '记录可复用命令，支持复制、执行和收藏。', usage: '右侧切换到历史或收藏，点击命令即可回填或执行。' },
      { name: '终端上下文', description: 'AI 会读取最近终端输出、当前命令和目录作为上下文。', usage: '在设置里调整终端上下文字符数和保留行数。' },
    ],
  },
  {
    title: 'AI 助手',
    summary: '统一问答、错误解释、命令生成和 Agent 执行入口。',
    features: [
      { name: '模型配置', description: '支持多个 OpenAI 兼容模型和 Ollama 模型，并选择当前启用项。', usage: '设置 > AI 中新增模型；Ollama 地址填写到 /v1，例如 http://host:11434/v1。' },
      { name: '统一 AI 输入', description: '直接输入问题、目标或让 AI 根据终端内容生成命令。', usage: '右侧 AI 面板输入需求，Ctrl+Enter 或发送按钮提交。' },
      { name: 'Agent 模式', description: '审核模式需人工执行命令，自动模式会自动推进低风险命令。', usage: '在 AI 输入框下方选择审核或自动，高风险命令仍需确认。' },
      { name: '思考控制', description: '可关闭 Agent 思考以减少 Qwen/Ollama 长时间推理。', usage: '设置 > AI 中关闭“开启 Agent 思考”。' },
      { name: '命令预测', description: '根据终端上下文预测下一条可能输入的命令。', usage: '在终端区域查看预测，启用预测 thinking 可观察模型推理片段。' },
    ],
  },
  {
    title: '批量任务',
    summary: '勾选多台服务器，让 AI 按顺序执行同一个自然语言任务。',
    features: [
      { name: '批量选择', description: '左侧开启批量模式后勾选目标服务器。', usage: '右侧 AI 区域会显示已选服务器 tag，点击 tag 上的 x 可取消勾选。' },
      { name: '逐台执行', description: '批量任务会按勾选顺序连接服务器并推进 Agent。', usage: '输入任务描述后点击闪电按钮，执行卡片会显示每台状态。' },
      { name: '最终总结', description: '批量完成后会汇总成功、失败和每台执行摘要。', usage: '在 AI 对话历史中查看批量任务记录和最终总结。' },
    ],
  },
  {
    title: '文件与传输',
    summary: '浏览远程目录，预览、编辑和传输文件。',
    features: [
      { name: '文件面板', description: '查看当前服务器目录、排序和搜索文件。', usage: '顶部传输菜单打开文件面板，也可以跟随终端当前目录。' },
      { name: '预览与编辑', description: '文本文件可直接预览和编辑，图片视频可预览。', usage: '在文件列表中打开文件，编辑后保存到远程服务器。' },
      { name: '上传下载', description: '支持上传本地文件到远程目录和下载远程文件。', usage: '使用传输菜单或文件面板按钮发起传输。' },
    ],
  },
  {
    title: '日志与安全',
    summary: '查看运行日志、调整登录策略和排查 AI/provider 问题。',
    features: [
      { name: '运行日志', description: '查看 core、AI、认证和 UI 的运行记录。', usage: '工具 > 日志中搜索 source=ai 或接口路径排查问题。' },
      { name: '网页登录', description: '可要求 Web 访问登录，也可要求桌面启动时登录。', usage: '设置 > 安全中调整登录策略或修改密码。' },
      { name: '错误通知', description: '右下角错误卡片会显示来源、接口和详细信息。', usage: '遇到 AI 或 SSH 错误时先看详情，再到日志里查完整上下文。' },
    ],
  },
]

export function FeatureGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <section className="feature-guide-modal">
        <div className="modal-header">
          <div>
            <p className="section-label">帮助</p>
            <h3>功能说明</h3>
          </div>
          <button type="button" title="关闭功能说明" onClick={onClose}>×</button>
        </div>
        <div className="feature-guide-content">
          {featureModules.map((module) => (
            <section className="feature-guide-section" key={module.title}>
              <div>
                <h4>{module.title}</h4>
                <p>{module.summary}</p>
              </div>
              <div className="feature-guide-list">
                {module.features.map((feature) => (
                  <article className="feature-guide-item" key={feature.name}>
                    <strong>{feature.name}</strong>
                    <p>{feature.description}</p>
                    <small>{feature.usage}</small>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="modal-actions">
          <button className="primary-button" type="button" title="关闭功能说明" onClick={onClose}>知道了</button>
        </div>
      </section>
    </div>
  )
}
