import { useEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import {
  CORE_API_BASE,
  type HealthResponse,
  type HostRecord,
  type SessionOpenResponse,
  type SessionRecord,
} from '@ai-ssh/shared-contracts'

type LoadState = 'idle' | 'loading' | 'success' | 'error'

const priorities = [
  '主机管理与连接配置',
  '终端多标签与会话状态',
  '远程文件浏览与上传下载',
  'AI 命令解释与建议面板',
]

const milestones = [
  {
    title: '当前切片',
    body: '主机列表、创建会话接口、终端容器与会话状态联动',
  },
  {
    title: '下一步',
    body: '接入真实 SSH 会话流和 xterm 输入输出桥接',
  },
]

function statusToLabel(state: LoadState) {
  if (state === 'loading') return '连接 core 中'
  if (state === 'success') return 'core 已连接'
  if (state === 'error') return 'core 未连接'
  return '等待检查'
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthState, setHealthState] = useState<LoadState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [hosts, setHosts] = useState<HostRecord[]>([])
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [selectedHostId, setSelectedHostId] = useState<string>('')
  const [sessionState, setSessionState] = useState<LoadState>('idle')
  const terminalRef = useRef<HTMLDivElement | null>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: 'Consolas, "Cascadia Code", monospace',
      fontSize: 13,
      theme: {
        background: '#0d1520',
        foreground: '#d9e2ec',
        cursor: '#4ade80',
        black: '#0f1720',
        blue: '#4f8cff',
        brightBlue: '#6ea8ff',
        brightCyan: '#67e8f9',
        brightGreen: '#4ade80',
        brightMagenta: '#c084fc',
        brightRed: '#fb7185',
        brightWhite: '#f8fafc',
        brightYellow: '#fbbf24',
        cyan: '#22d3ee',
        green: '#22c55e',
        magenta: '#a855f7',
        red: '#ef4444',
        white: '#cbd5e1',
        yellow: '#f59e0b',
      },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    xtermRef.current = terminal
    fitAddonRef.current = fitAddon

    if (terminalRef.current) {
      terminal.open(terminalRef.current)
      fitAddon.fit()
      terminal.writeln('AI SSH terminal workspace ready.')
      terminal.writeln('等待创建 SSH 会话...')
    }

    const onResize = () => fitAddon.fit()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      terminal.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  useEffect(() => {
    const loadHealth = async () => {
      setHealthState('loading')
      try {
        const response = await fetch(`${CORE_API_BASE}/health`)
        if (!response.ok) {
          throw new Error(`请求失败：${response.status}`)
        }
        const data = (await response.json()) as HealthResponse
        setHealth(data)
        setHealthState('success')
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误'
        setErrorMessage(message)
        setHealthState('error')
      }
    }

    const loadHosts = async () => {
      const response = await fetch(`${CORE_API_BASE}/hosts`)
      if (!response.ok) {
        throw new Error(`主机列表加载失败：${response.status}`)
      }
      const data = (await response.json()) as HostRecord[]
      setHosts(data)
      if (!selectedHostId && data.length > 0) {
        setSelectedHostId(data[0].id)
      }
    }

    void loadHealth()
    void loadHosts().catch((error) => {
      const message = error instanceof Error ? error.message : '主机加载失败'
      setErrorMessage(message)
    })
  }, [selectedHostId])

  const currentHost = useMemo(
    () => hosts.find((host) => host.id === selectedHostId) ?? null,
    [hosts, selectedHostId],
  )

  const activeSession = sessions[0] ?? null

  const createSession = async () => {
    if (!selectedHostId) {
      return
    }

    setSessionState('loading')
    xtermRef.current?.clear()
    xtermRef.current?.writeln(`正在为主机 ${selectedHostId} 创建会话...`)

    try {
      const response = await fetch(`${CORE_API_BASE}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hostId: selectedHostId,
        }),
      })

      if (!response.ok) {
        throw new Error(`创建会话失败：${response.status}`)
      }

      const data = (await response.json()) as SessionOpenResponse
      setSessions([data.session])
      setSessionState('success')

      xtermRef.current?.writeln('')
      xtermRef.current?.writeln(`Session: ${data.session.id}`)
      xtermRef.current?.writeln(`Host: ${data.session.hostName}`)
      xtermRef.current?.writeln('已完成会话初始化骨架，下一步接入真实 SSH 流。')
      fitAddonRef.current?.fit()
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建会话失败'
      setSessionState('error')
      setErrorMessage(message)
      xtermRef.current?.writeln('')
      xtermRef.current?.writeln(`ERROR: ${message}`)
    }
  }

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
          <p className="section-label">主机列表</p>
          <div className="host-list">
            {hosts.map((host) => (
              <button
                key={host.id}
                className={`host-item ${selectedHostId === host.id ? 'host-item-active' : ''}`}
                onClick={() => setSelectedHostId(host.id)}
                type="button"
              >
                <strong>{host.name}</strong>
                <span>
                  {host.username}@{host.address}:{host.port}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="sidebar-section">
          <p className="section-label">系统状态</p>
          <div className="status-panel">
            <span className={`status-dot status-${healthState}`} />
            <div>
              <strong>{statusToLabel(healthState)}</strong>
              <p>当前通过 Vite 代理访问本地 Go core。</p>
            </div>
          </div>
        </section>
      </aside>

      <main className="main-panel">
        <section className="hero-band">
          <div className="hero-copy">
            <p className="section-label">Milestone 1</p>
            <h2>我们已经开始从“工程骨架”走向“真正可交互的 SSH 会话流程”。</h2>
            <p className="hero-text">
              这一版先完成主机列表、创建会话接口和终端容器，确保前端、Tauri 和 Go core
              对同一条会话链路达成一致。
            </p>

            <div className="action-row">
              <button
                className="primary-button"
                type="button"
                onClick={() => void createSession()}
                disabled={!selectedHostId || sessionState === 'loading'}
              >
                {sessionState === 'loading' ? '创建中...' : '创建会话'}
              </button>
              <div className="context-block">
                <strong>{currentHost?.name ?? '未选择主机'}</strong>
                <span>
                  {currentHost
                    ? `${currentHost.username}@${currentHost.address}:${currentHost.port}`
                    : '请先选择一个主机'}
                </span>
              </div>
            </div>
          </div>

          <div className="health-card">
            <div className="health-header">
              <span>Core Health</span>
              <strong>{statusToLabel(healthState)}</strong>
            </div>

            {health ? (
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
                  <dt>能力</dt>
                  <dd>{health.capabilities.join(', ')}</dd>
                </div>
              </dl>
            ) : null}

            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
          </div>
        </section>

        <section className="workspace-band">
          <article className="terminal-panel">
            <div className="panel-header">
              <div>
                <p className="section-label">终端容器</p>
                <h3>{activeSession ? activeSession.hostName : '尚未创建会话'}</h3>
              </div>
              <span className={`session-pill session-${activeSession?.status ?? 'idle'}`}>
                {activeSession?.status ?? 'idle'}
              </span>
            </div>
            <div ref={terminalRef} className="terminal-surface" />
          </article>

          <aside className="session-panel">
            <div className="panel-header">
              <div>
                <p className="section-label">会话状态</p>
                <h3>当前会话</h3>
              </div>
            </div>

            {activeSession ? (
              <dl className="session-grid">
                <div>
                  <dt>会话 ID</dt>
                  <dd>{activeSession.id}</dd>
                </div>
                <div>
                  <dt>主机</dt>
                  <dd>{activeSession.hostName}</dd>
                </div>
                <div>
                  <dt>状态</dt>
                  <dd>{activeSession.status}</dd>
                </div>
                <div>
                  <dt>创建时间</dt>
                  <dd>{new Date(activeSession.createdAt).toLocaleString('zh-CN')}</dd>
                </div>
              </dl>
            ) : (
              <p className="empty-text">创建会话后，这里会显示会话状态和连接摘要。</p>
            )}

            <div className="roadmap-band roadmap-compact">
              {milestones.map((item) => (
                <article key={item.title} className="milestone-item">
                  <p className="section-label">{item.title}</p>
                  <h3>{item.body}</h3>
                </article>
              ))}
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}
