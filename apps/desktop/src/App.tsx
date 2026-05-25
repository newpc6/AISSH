import { useEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import {
  CORE_API_BASE,
  type HealthResponse,
  type HostAuthType,
  type HostRecord,
  type HostUpsertRequest,
  type SessionOpenRequest,
  type SessionOpenResponse,
  type SessionRecord,
  type TerminalEvent,
} from '@ai-ssh/shared-contracts'

type LoadState = 'idle' | 'loading' | 'success' | 'error'
type LeftMode = 'servers' | 'files'
type RightTool = 'ai' | 'history'

const commandHistory = [
  'pwd',
  'ls -lah',
  'df -h',
  'free -m',
  'tail -f /var/log/syslog',
  'docker ps',
]

const aiSuggestions = [
  {
    title: '检查当前目录',
    command: 'pwd && ls -lah',
  },
  {
    title: '查看资源占用',
    command: 'top',
  },
  {
    title: '定位磁盘压力',
    command: 'df -h && du -sh * | sort -h',
  },
]

const emptyHostForm: HostUpsertRequest = {
  name: '',
  address: '',
  port: 22,
  username: '',
  authType: 'password',
  group: '默认',
  description: '',
  password: '',
  privateKey: '',
}

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
  const [activeSessionId, setActiveSessionId] = useState<string>('')
  const [leftMode, setLeftMode] = useState<LeftMode>('servers')
  const [rightTool, setRightTool] = useState<RightTool>('ai')
  const [aiEnabled, setAiEnabled] = useState(true)
  const [isHostDialogOpen, setIsHostDialogOpen] = useState(false)
  const [hostForm, setHostForm] = useState<HostUpsertRequest>(emptyHostForm)
  const [savePassword, setSavePassword] = useState(false)
  const [savePrivateKey, setSavePrivateKey] = useState(false)
  const terminalRef = useRef<HTMLDivElement | null>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

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
      terminal.writeln('AI SSH workspace ready.')
      terminal.writeln('选择左侧服务器并创建会话，或点击左侧 + 添加 SSH 连接。')
    }

    const onResize = () => fitAddon.fit()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      eventSourceRef.current?.close()
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

    void loadHealth()
    void loadHosts()
  }, [])

  const currentHost = useMemo(
    () => hosts.find((host) => host.id === selectedHostId) ?? null,
    [hosts, selectedHostId],
  )
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null
  const groupedHosts = useMemo(() => {
    const groups = new Map<string, HostRecord[]>()
    for (const host of hosts) {
      const group = host.group || '默认'
      groups.set(group, [...(groups.get(group) ?? []), host])
    }
    return Array.from(groups.entries()).map(([name, items]) => ({ name, hosts: items }))
  }, [hosts])

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

  const resetHostForm = () => {
    setHostForm(emptyHostForm)
    setSavePassword(false)
    setSavePrivateKey(false)
  }

  const openAddHostDialog = () => {
    resetHostForm()
    setIsHostDialogOpen(true)
  }

  const closeAddHostDialog = () => {
    setIsHostDialogOpen(false)
    resetHostForm()
  }

  const saveHost = async () => {
    if (!hostForm.name || !hostForm.address || !hostForm.username) {
      setErrorMessage('请填写主机名称、地址和用户名')
      return
    }

    const response = await fetch(`${CORE_API_BASE}/hosts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...hostForm,
        port: Number(hostForm.port) || 22,
        password: hostForm.authType === 'password' && savePassword ? hostForm.password : '',
        privateKey: hostForm.authType === 'privateKey' && savePrivateKey ? hostForm.privateKey : '',
      }),
    })

    if (!response.ok) {
      setErrorMessage(`保存主机失败：${response.status}`)
      return
    }

    closeAddHostDialog()
    await loadHosts()
  }

  const exportHosts = async () => {
    const response = await fetch(`${CORE_API_BASE}/hosts/export`)
    if (!response.ok) {
      setErrorMessage(`导出失败：${response.status}`)
      return
    }
    const text = JSON.stringify(await response.json(), null, 2)
    await navigator.clipboard.writeText(text)
  }

  const importSampleHost = async () => {
    const response = await fetch(`${CORE_API_BASE}/hosts/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hosts: [
          {
            name: 'Imported Demo',
            address: '192.168.56.10',
            port: 22,
            username: 'ubuntu',
            authType: 'password',
            group: '导入',
            description: '导入示例主机',
          },
        ],
      }),
    })

    if (!response.ok) {
      setErrorMessage(`导入失败：${response.status}`)
      return
    }

    await loadHosts()
  }

  useEffect(() => {
    if (!activeSession || !xtermRef.current) {
      return
    }

    const disposable = xtermRef.current.onData((data) => {
      void fetch(`${CORE_API_BASE}/sessions/${activeSession.id}/input`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data }),
      })
    })

    return () => disposable.dispose()
  }, [activeSession])

  const openSessionStream = (session: SessionRecord) => {
    eventSourceRef.current?.close()

    const source = new EventSource(`${CORE_API_BASE}/sessions/${session.id}/events`)
    eventSourceRef.current = source

    source.addEventListener('terminal', (event) => {
      const message = event as MessageEvent<string>
      const payload = JSON.parse(message.data) as TerminalEvent

      if (payload.type === 'output') {
        xtermRef.current?.write(payload.data ?? '')
      }

      if (payload.type === 'status') {
        setSessions((current) =>
          current.map((item) =>
            item.id === session.id
              ? { ...item, status: payload.data === 'connected' ? 'connected' : item.status }
              : item,
          ),
        )
      }

      if (payload.type === 'error') {
        const messageText = payload.data ?? '会话发生错误'
        setErrorMessage(messageText)
        setSessions((current) =>
          current.map((item) =>
            item.id === session.id ? { ...item, status: 'error', lastError: messageText } : item,
          ),
        )
        xtermRef.current?.writeln('')
        xtermRef.current?.writeln(`ERROR: ${messageText}`)
      }
    })

    source.addEventListener('close', () => {
      source.close()
    })
  }

  const createSession = async () => {
    if (!selectedHostId) {
      return
    }

    xtermRef.current?.clear()
    xtermRef.current?.writeln(`正在为主机 ${selectedHostId} 创建会话...`)

    const payload: SessionOpenRequest = { hostId: selectedHostId }

    try {
      const response = await fetch(`${CORE_API_BASE}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`创建会话失败：${response.status}`)
      }

      const data = (await response.json()) as SessionOpenResponse
      setSessions((current) => [data.session, ...current])
      setActiveSessionId(data.session.id)

      xtermRef.current?.writeln('')
      xtermRef.current?.writeln(`Session: ${data.session.id}`)
      xtermRef.current?.writeln(`Host: ${data.session.hostName}`)
      xtermRef.current?.writeln('正在连接会话输出流...')
      openSessionStream(data.session)
      fitAddonRef.current?.fit()
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建会话失败'
      setErrorMessage(message)
      xtermRef.current?.writeln('')
      xtermRef.current?.writeln(`ERROR: ${message}`)
    }
  }

  const writeCommand = (command: string) => {
    xtermRef.current?.focus()
    xtermRef.current?.write(command)
    if (activeSession) {
      void fetch(`${CORE_API_BASE}/sessions/${activeSession.id}/input`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: command }),
      })
    }
  }

  return (
    <div className="workbench-shell">
      <header className="top-menu">
        <div className="app-title">
          <strong>AI SSH</strong>
          <span>{statusToLabel(healthState)}</span>
        </div>
        <nav className="menu-groups">
          <button type="button">文件</button>
          <button type="button">编辑</button>
          <button type="button">会话</button>
          <button type="button">传输</button>
          <button type="button">工具</button>
          <button type="button">设置</button>
        </nav>
        <div className="top-actions">
          <button type="button" onClick={() => void importSampleHost()}>导入</button>
          <button type="button" onClick={() => void exportHosts()}>导出</button>
          <span className={`status-dot status-${healthState}`} />
        </div>
      </header>

      <div className="workbench-grid">
        <aside className="left-rail">
          <div className="rail-tabs">
            <button
              className={leftMode === 'servers' ? 'active' : ''}
              type="button"
              onClick={() => setLeftMode('servers')}
            >
              SSH
            </button>
            <button
              className={leftMode === 'files' ? 'active' : ''}
              type="button"
              onClick={() => setLeftMode('files')}
            >
              文件
            </button>
          </div>

          {leftMode === 'servers' ? (
            <div className="left-content">
              <div className="panel-toolbar">
                <strong>服务器</strong>
                <div>
                  <button type="button" onClick={openAddHostDialog}>+</button>
                  <button type="button" onClick={() => void exportHosts()}>⇅</button>
                </div>
              </div>

              {groupedHosts.map((group) => (
                <section className="server-group" key={group.name}>
                  <p>{group.name}</p>
                  {group.hosts.map((host) => (
                    <button
                      key={host.id}
                      className={`server-row ${selectedHostId === host.id ? 'selected' : ''}`}
                      onClick={() => setSelectedHostId(host.id)}
                      onDoubleClick={() => void createSession()}
                      type="button"
                    >
                      <span>{host.name}</span>
                      <small>
                        {host.username}@{host.address}:{host.port}
                      </small>
                    </button>
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <div className="left-content">
              <div className="panel-toolbar">
                <strong>远程文件</strong>
                <div>
                  <button type="button">↑</button>
                  <button type="button">↓</button>
                </div>
              </div>
              <div className="file-tree">
                <button type="button">/home</button>
                <button type="button">/var/log</button>
                <button type="button">/etc</button>
                <button type="button">/data</button>
              </div>
            </div>
          )}
        </aside>

        <main className="center-workspace">
          <div className="session-tabs">
            {sessions.length === 0 ? (
              <button className="session-tab active" type="button">
                未连接
              </button>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.id}
                  className={`session-tab ${activeSession?.id === session.id ? 'active' : ''}`}
                  type="button"
                  onClick={() => setActiveSessionId(session.id)}
                >
                  <span>{session.hostName}</span>
                  <small>{session.status}</small>
                </button>
              ))
            )}
            <button className="session-new" type="button" onClick={() => void createSession()}>
              +
            </button>
          </div>

          <section className="terminal-stage">
            <div className="terminal-header">
              <div>
                <strong>{activeSession ? activeSession.hostName : currentHost?.name ?? '请选择服务器'}</strong>
                <span>
                  {currentHost
                    ? `${currentHost.username}@${currentHost.address}:${currentHost.port}`
                    : '可以使用 Local Demo 或左侧新增 SSH 连接'}
                </span>
              </div>
              <span className={`session-pill session-${activeSession?.status ?? 'idle'}`}>
                {activeSession?.status ?? 'idle'}
              </span>
            </div>
            <div ref={terminalRef} className="terminal-surface" />
          </section>
        </main>

        <aside className="right-rail">
          <section className="info-panel">
            <p className="section-label">当前服务器</p>
            <h3>{activeSession?.hostName ?? currentHost?.name ?? '未连接'}</h3>
            <dl>
              <div>
                <dt>地址</dt>
                <dd>{currentHost ? `${currentHost.address}:${currentHost.port}` : '-'}</dd>
              </div>
              <div>
                <dt>用户</dt>
                <dd>{currentHost?.username ?? '-'}</dd>
              </div>
              <div>
                <dt>认证</dt>
                <dd>{currentHost?.authType ?? '-'}</dd>
              </div>
            </dl>
          </section>

          <section className="tool-panel">
            <div className="tool-tabs">
              <button
                className={rightTool === 'ai' ? 'active' : ''}
                type="button"
                onClick={() => setRightTool('ai')}
              >
                AI
              </button>
              <button
                className={rightTool === 'history' ? 'active' : ''}
                type="button"
                onClick={() => setRightTool('history')}
              >
                历史
              </button>
            </div>

            {rightTool === 'ai' ? (
              <div className="ai-box">
                <label className="toggle-row">
                  <input
                    checked={aiEnabled}
                    onChange={(event) => setAiEnabled(event.target.checked)}
                    type="checkbox"
                  />
                  <span>预测下一步命令</span>
                </label>
                {aiSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.command}
                    className="suggestion-row"
                    type="button"
                    onClick={() => writeCommand(suggestion.command)}
                    disabled={!aiEnabled}
                  >
                    <strong>{suggestion.title}</strong>
                    <code>{suggestion.command}</code>
                  </button>
                ))}
                <p className="hint-text">后续会读取终端上下文，支持 Tab 应用建议。</p>
              </div>
            ) : (
              <div className="history-list">
                {commandHistory.map((command) => (
                  <button key={command} type="button" onClick={() => writeCommand(command)}>
                    {command}
                  </button>
                ))}
              </div>
            )}
          </section>

          {errorMessage ? <p className="error-text side-error">{errorMessage}</p> : null}
          {health ? <p className="core-line">{health.service} · {health.version}</p> : null}
        </aside>
      </div>

      {isHostDialogOpen ? (
        <div className="modal-backdrop">
          <form
            className="host-modal"
            onSubmit={(event) => {
              event.preventDefault()
              void saveHost()
            }}
          >
            <div className="modal-header">
              <div>
                <p className="section-label">SSH 连接</p>
                <h3>新增服务器</h3>
              </div>
              <button type="button" onClick={closeAddHostDialog}>×</button>
            </div>

            <label>
              <span>名称</span>
              <input
                value={hostForm.name}
                onChange={(event) => setHostForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="服务器名称"
              />
            </label>
            <div className="form-row">
              <label>
                <span>分组</span>
                <input
                  value={hostForm.group ?? ''}
                  onChange={(event) => setHostForm((current) => ({ ...current, group: event.target.value }))}
                  placeholder="默认"
                />
              </label>
              <label>
                <span>认证</span>
                <select
                  value={hostForm.authType}
                  onChange={(event) => {
                    const authType = event.target.value as HostAuthType
                    setHostForm((current) => ({ ...current, authType, password: '', privateKey: '' }))
                    setSavePassword(false)
                    setSavePrivateKey(false)
                  }}
                >
                  <option value="password">密码</option>
                  <option value="privateKey">SSH Key</option>
                  <option value="agent">Agent</option>
                </select>
              </label>
            </div>
            <label>
              <span>地址</span>
              <input
                value={hostForm.address}
                onChange={(event) => setHostForm((current) => ({ ...current, address: event.target.value }))}
                placeholder="192.168.1.10"
              />
            </label>
            <div className="form-row">
              <label>
                <span>端口</span>
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={hostForm.port}
                  onChange={(event) =>
                    setHostForm((current) => ({ ...current, port: Number(event.target.value) || 22 }))
                  }
                />
              </label>
              <label>
                <span>用户</span>
                <input
                  value={hostForm.username}
                  onChange={(event) => setHostForm((current) => ({ ...current, username: event.target.value }))}
                  placeholder="root"
                />
              </label>
            </div>

            {hostForm.authType === 'password' ? (
              <div className="secret-area">
                <label className="checkbox-row">
                  <input
                    checked={savePassword}
                    onChange={(event) => setSavePassword(event.target.checked)}
                    type="checkbox"
                  />
                  <span>保存密码</span>
                </label>
                <label>
                  <span>密码</span>
                  <input
                    disabled={!savePassword}
                    type="password"
                    value={hostForm.password ?? ''}
                    onChange={(event) => setHostForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="保存后连接时自动使用"
                  />
                </label>
              </div>
            ) : null}

            {hostForm.authType === 'privateKey' ? (
              <div className="secret-area">
                <label className="checkbox-row">
                  <input
                    checked={savePrivateKey}
                    onChange={(event) => setSavePrivateKey(event.target.checked)}
                    type="checkbox"
                  />
                  <span>保存 SSH Key</span>
                </label>
                <label>
                  <span>SSH Key</span>
                  <textarea
                    disabled={!savePrivateKey}
                    value={hostForm.privateKey ?? ''}
                    onChange={(event) => setHostForm((current) => ({ ...current, privateKey: event.target.value }))}
                    placeholder="保存后连接时自动使用"
                  />
                </label>
              </div>
            ) : null}

            <div className="modal-actions">
              <button type="button" onClick={closeAddHostDialog}>取消</button>
              <button className="primary-button" type="submit">保存</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
