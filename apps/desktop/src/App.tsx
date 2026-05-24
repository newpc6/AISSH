import { useEffect, useMemo, useState } from 'react'
import { CORE_API_BASE, type HealthResponse } from '@ai-ssh/shared-contracts'

type LoadState = 'idle' | 'loading' | 'success' | 'error'

const priorities = [
  '主机管理与连接配置',
  '终端多标签与分屏容器',
  '远程文件浏览与上传下载',
  'AI 命令解释与建议面板',
]

const milestones = [
  {
    title: 'Milestone 0',
    body: '工程骨架、共享契约、健康检查链路、桌面壳接入预留',
  },
  {
    title: 'Milestone 1',
    body: 'SSH 连接、会话管理、终端输出与主机认证能力',
  },
  {
    title: 'Milestone 2',
    body: '远程文件浏览、上传下载、拖拽传输与进度反馈',
  },
  {
    title: 'Milestone 3',
    body: 'AI 输出解释、命令草稿、安全提示与审计',
  },
]

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [state, setState] = useState<LoadState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const loadHealth = async () => {
      setState('loading')

      try {
        const response = await fetch(`${CORE_API_BASE}/health`)

        if (!response.ok) {
          throw new Error(`请求失败：${response.status}`)
        }

        const data = (await response.json()) as HealthResponse
        setHealth(data)
        setState('success')
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误'
        setErrorMessage(message)
        setState('error')
      }
    }

    void loadHealth()
  }, [])

  const statusLabel = useMemo(() => {
    if (state === 'loading') return '连接 core 中'
    if (state === 'success') return 'core 已连接'
    if (state === 'error') return 'core 未连接'
    return '等待检查'
  }, [state])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">A</div>
          <div>
            <p className="eyebrow">AI SSH</p>
            <h1>桌面优先的智能 SSH 工作台</h1>
          </div>
        </div>

        <section className="sidebar-section">
          <p className="section-label">当前重点</p>
          <ul className="priority-list">
            {priorities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="sidebar-section">
          <p className="section-label">架构状态</p>
          <div className="status-panel">
            <span className={`status-dot status-${state}`} />
            <div>
              <strong>{statusLabel}</strong>
              <p>当前通过 Vite 代理访问本地 Go core 健康检查接口。</p>
            </div>
          </div>
        </section>
      </aside>

      <main className="main-panel">
        <section className="hero-band">
          <div className="hero-copy">
            <p className="section-label">Milestone 0</p>
            <h2>先把能跑的骨架搭起来，再把 SSH、文件管理和 AI 一层层做实。</h2>
            <p className="hero-text">
              当前阶段已经完成产品设计、开发计划和仓库基线。现在这张页面用于验证前端与
              Go core 的最小链路，为后续接入 Tauri、SSH 会话和文件传输做准备。
            </p>
          </div>

          <div className="health-card">
            <div className="health-header">
              <span>Core Health</span>
              <strong>{statusLabel}</strong>
            </div>

            {state === 'success' && health ? (
              <dl className="health-grid">
                <div>
                  <dt>服务名</dt>
                  <dd>{health.service}</dd>
                </div>
                <div>
                  <dt>版本</dt>
                  <dd>{health.version}</dd>
                </div>
                <div>
                  <dt>状态</dt>
                  <dd>{health.status}</dd>
                </div>
                <div>
                  <dt>时间</dt>
                  <dd>{new Date(health.timestamp).toLocaleString('zh-CN')}</dd>
                </div>
              </dl>
            ) : null}

            {state === 'error' ? <p className="error-text">{errorMessage}</p> : null}
          </div>
        </section>

        <section className="roadmap-band">
          {milestones.map((item) => (
            <article key={item.title} className="milestone-item">
              <p className="section-label">{item.title}</p>
              <h3>{item.body}</h3>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}
