import { useEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import {
  CORE_API_BASE,
  CORE_DEFAULT_PORT,
  type HealthResponse,
  type HostAuthType,
  type HostRecord,
  type AppSettings,
  type FileEntry,
  type FileListResponse,
  type LogEntry,
  type LogLevel,
  type LogsResponse,
  type LogSettings,
  type ServerMetrics,
  type HostUpsertRequest,
  type SessionOpenRequest,
  type SessionOpenResponse,
  type SessionRecord,
  type TerminalEvent,
} from '@ai-ssh/shared-contracts'

type LoadState = 'idle' | 'loading' | 'success' | 'error'
type LeftMode = 'servers' | 'files'
type RightTool = 'ai' | 'history'
type HostDialogMode = 'create' | 'edit'
type TopMenu = 'file' | 'edit' | 'session' | 'transfer' | 'tools' | 'settings' | ''

const CORE_API_FALLBACK_BASE = `http://127.0.0.1:${CORE_DEFAULT_PORT}/api`

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

const defaultSettings: AppSettings = {
  metricsRefreshIntervalSeconds: 2,
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
  aiPredictionEnabled: true,
}

function statusToLabel(state: LoadState) {
  if (state === 'loading') return '连接 core 中'
  if (state === 'success') return 'core 已连接'
  if (state === 'error') return 'core 未连接'
  return '等待检查'
}

function isLikelyStatic405(response: Response) {
  return response.status === 405 && response.url.startsWith(window.location.origin)
}

function resolveApiStreamUrl(path: string) {
  const requestPath = path.startsWith('/') ? path : `/${path}`
  if (window.location.origin.startsWith('http://127.0.0.1:1420')) {
    return `${CORE_API_BASE}${requestPath}`
  }
  return `${CORE_API_FALLBACK_BASE}${requestPath}`
}

function resolveApiUrl(path: string) {
  const requestPath = path.startsWith('/') ? path : `/${path}`
  if (window.location.origin.startsWith('http://127.0.0.1:1420')) {
    return `${CORE_API_BASE}${requestPath}`
  }
  return `${CORE_API_FALLBACK_BASE}${requestPath}`
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function parentPath(path: string) {
  if (!path || path === '.' || path === '/') return '.'
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.length === 0 ? '/' : `/${parts.join('/')}`
}

function shouldRecordCommand(command: string) {
  if (!command) return false
  if (command.includes('__AI_SSH_CWD__')) return false
  if (command.startsWith('printf ') && command.includes('$PWD')) return false
  return true
}

function stripTerminalControlSequences(data: string) {
  return data.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
}

function sessionStatusLabel(status: SessionRecord['status']) {
  if (status === 'connected') return '已连接'
  if (status === 'connecting') return '连接中'
  if (status === 'error') return '已断开'
  if (status === 'closed') return '已关闭'
  return '空闲'
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
  const [openTopMenu, setOpenTopMenu] = useState<TopMenu>('')
  const [aiEnabled, setAiEnabled] = useState(true)
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [isHostDialogOpen, setIsHostDialogOpen] = useState(false)
  const [hostDialogMode, setHostDialogMode] = useState<HostDialogMode>('create')
  const [editingHostId, setEditingHostId] = useState('')
  const [hostForm, setHostForm] = useState<HostUpsertRequest>(emptyHostForm)
  const [savePassword, setSavePassword] = useState(false)
  const [savePrivateKey, setSavePrivateKey] = useState(false)
  const [hostDialogError, setHostDialogError] = useState('')
  const [isSavingHost, setIsSavingHost] = useState(false)
  const [openHostMenuId, setOpenHostMenuId] = useState('')
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logLevel, setLogLevel] = useState<LogLevel>('info')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [aiPrediction, setAiPrediction] = useState('')
  const [filePath, setFilePath] = useState('.')
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([])
  const [fileError, setFileError] = useState('')
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [trackTerminalPath, setTrackTerminalPath] = useState(true)
  const [transferTasks, setTransferTasks] = useState<
    { id: string; name: string; direction: 'upload' | 'download'; progress: number; status: string }[]
  >([])
  const [serverMetrics, setServerMetrics] = useState<ServerMetrics | null>(null)
  const terminalRef = useRef<HTMLDivElement | null>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const commandBufferRef = useRef('')
  const privateKeyFileRef = useRef<HTMLInputElement | null>(null)
  const uploadFileRef = useRef<HTMLInputElement | null>(null)

  const appendLog = (level: LogLevel, source: string, message: string, fields?: Record<string, unknown>) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      fields,
    }
    setLogs((current) => [...current.slice(-199), entry])
  }

  const apiFetch = async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const requestPath = path.startsWith('/') ? path : `/${path}`
    const primaryUrl = `${CORE_API_BASE}${requestPath}`
    appendLog('debug', 'ui.api', 'request started', { method, path: requestPath })

    let response = await fetch(primaryUrl, init)
    if (isLikelyStatic405(response)) {
      appendLog('warn', 'ui.api', 'primary api returned 405, retrying core fallback', {
        method,
        path: requestPath,
        primaryUrl: response.url,
      })
      response = await fetch(`${CORE_API_FALLBACK_BASE}${requestPath}`, init)
    }

    appendLog(response.ok ? 'debug' : 'warn', 'ui.api', 'request completed', {
      method,
      path: requestPath,
      status: response.status,
      url: response.url,
    })
    return response
  }

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
        const response = await apiFetch('/health')
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

  useEffect(() => {
    if (!openHostMenuId) {
      return
    }

    const closeMenu = () => setOpenHostMenuId('')
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [openHostMenuId])

  useEffect(() => {
    if (!openTopMenu) {
      return
    }

    const closeMenu = () => setOpenTopMenu('')
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [openTopMenu])

  const currentHost = useMemo(
    () => hosts.find((host) => host.id === selectedHostId) ?? null,
    [hosts, selectedHostId],
  )
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null
  const activeHost = useMemo(
    () => hosts.find((host) => host.id === activeSession?.hostId) ?? currentHost,
    [hosts, activeSession, currentHost],
  )
  const recentHosts = useMemo(() => hosts.filter((host) => host.id !== 'local-demo').slice(0, 5), [hosts])
  const groupedHosts = useMemo(() => {
    const groups = new Map<string, HostRecord[]>()
    for (const host of hosts) {
      const group = host.group || '默认'
      groups.set(group, [...(groups.get(group) ?? []), host])
    }
    return Array.from(groups.entries()).map(([name, items]) => ({ name, hosts: items }))
  }, [hosts])

  const loadHosts = async (preferredHostId?: string) => {
    const response = await apiFetch('/hosts')
    if (!response.ok) {
      throw new Error(`主机列表加载失败：${response.status}`)
    }
    const data = (await response.json()) as HostRecord[]
    setHosts(data)
    if (preferredHostId && data.some((host) => host.id === preferredHostId)) {
      setSelectedHostId(preferredHostId)
    } else if (!selectedHostId && data.length > 0) {
      setSelectedHostId(data[0].id)
    }
    return data
  }

  const resetHostForm = () => {
    setHostForm(emptyHostForm)
    setSavePassword(false)
    setSavePrivateKey(false)
    setHostDialogError('')
    setHostDialogMode('create')
    setEditingHostId('')
  }

  const openAddHostDialog = () => {
    resetHostForm()
    setIsHostDialogOpen(true)
  }

  const openEditHostDialog = (host: HostRecord) => {
    setHostDialogMode('edit')
    setEditingHostId(host.id)
    setHostForm({
      name: host.name,
      address: host.address,
      port: host.port,
      username: host.username,
      authType: host.authType,
      group: host.group ?? '默认',
      description: host.description ?? '',
      password: '',
      privateKey: '',
    })
    setSavePassword(Boolean(host.hasPassword))
    setSavePrivateKey(Boolean(host.hasPrivateKey))
    setHostDialogError('')
    setOpenHostMenuId('')
    setIsHostDialogOpen(true)
  }

  const closeAddHostDialog = () => {
    setIsHostDialogOpen(false)
    resetHostForm()
  }

  const selectPrivateKeyFile = async (file: File | null) => {
    if (!file) {
      return
    }

    try {
      const privateKey = await file.text()
      setHostForm((current) => ({ ...current, privateKey }))
      setSavePrivateKey(true)
      setHostDialogError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取 SSH Key 文件失败'
      setHostDialogError(message)
      setErrorMessage(message)
    }
  }

  const saveHost = async () => {
    setHostDialogError('')
    if (!hostForm.name || !hostForm.address || !hostForm.username) {
      setHostDialogError('请填写主机名称、地址和用户名')
      return
    }
    if (hostForm.authType === 'password' && hostDialogMode === 'create' && (!savePassword || !hostForm.password)) {
      setHostDialogError('密码认证需要勾选并填写保存密码')
      return
    }
    if (
      hostForm.authType === 'privateKey' &&
      hostDialogMode === 'create' &&
      (!savePrivateKey || !hostForm.privateKey)
    ) {
      setHostDialogError('SSH Key 认证需要勾选保存，并粘贴或选择私钥文件')
      return
    }

    setIsSavingHost(true)
    try {
      const requestPath = hostDialogMode === 'edit' ? `/hosts/${editingHostId}` : '/hosts'
      const response = await apiFetch(requestPath, {
        method: hostDialogMode === 'edit' ? 'PUT' : 'POST',
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
        const detail = await response.text()
        const message = detail.trim() || `HTTP ${response.status}`
        throw new Error(`${hostDialogMode === 'edit' ? '编辑' : '保存'}主机失败：${message}`)
      }

      const saved = (await response.json()) as HostRecord
      await loadHosts(saved.id)
      setErrorMessage('')
      closeAddHostDialog()
    } catch (error) {
      const message = error instanceof Error ? error.message : `${hostDialogMode === 'edit' ? '编辑' : '保存'}主机失败`
      setHostDialogError(message)
      setErrorMessage(message)
    } finally {
      setIsSavingHost(false)
    }
  }

  const exportHosts = async () => {
    const response = await apiFetch('/hosts/export')
    if (!response.ok) {
      setErrorMessage(`导出失败：${response.status}`)
      return
    }
    const text = JSON.stringify(await response.json(), null, 2)
    await navigator.clipboard.writeText(text)
  }

  const importSampleHost = async () => {
    const response = await apiFetch('/hosts/import', {
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

  const deleteHost = async (host: HostRecord) => {
    setOpenHostMenuId('')
    const confirmed = window.confirm(`确定删除服务器「${host.name}」吗？`)
    if (!confirmed) {
      return
    }

    const response = await apiFetch(`/hosts/${host.id}`, { method: 'DELETE' })
    if (!response.ok) {
      const detail = await response.text()
      setErrorMessage(detail.trim() || `删除失败：${response.status}`)
      return
    }

    const nextHosts = await loadHosts()
    if (selectedHostId === host.id) {
      setSelectedHostId(nextHosts[0]?.id ?? '')
    }
    setSessions((current) => current.filter((session) => session.hostId !== host.id))
    if (activeSession?.hostId === host.id) {
      setActiveSessionId('')
    }
  }

  const duplicateHost = async (host: HostRecord) => {
    setOpenHostMenuId('')
    setHostDialogMode('create')
    setEditingHostId('')
    setHostForm({
      name: `${host.name} 副本`,
      address: host.address,
      port: host.port,
      username: host.username,
      authType: host.authType,
      group: host.group ?? '默认',
      description: host.description ?? '',
      password: '',
      privateKey: '',
    })
    setSavePassword(false)
    setSavePrivateKey(false)
    setHostDialogError('')
    setIsHostDialogOpen(true)
  }

  const loadLogs = async () => {
    const [logsResponse, settingsResponse] = await Promise.all([
      apiFetch('/logs?limit=200'),
      apiFetch('/logs/settings'),
    ])

    if (logsResponse.ok) {
      const data = (await logsResponse.json()) as LogsResponse
      setLogs((current) => [...current, ...data.logs].slice(-300))
    }
    if (settingsResponse.ok) {
      const settings = (await settingsResponse.json()) as LogSettings
      setLogLevel(settings.level)
    }
  }

  const openLogDialog = () => {
    setOpenTopMenu('')
    setIsLogDialogOpen(true)
    void loadLogs()
  }

  const openSettingsDialog = () => {
    setOpenTopMenu('')
    setIsSettingsDialogOpen(true)
  }

  const updateLogLevel = async (level: LogLevel) => {
    setLogLevel(level)
    const response = await apiFetch('/logs/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ level }),
    })
    if (!response.ok) {
      setErrorMessage(`设置日志级别失败：${response.status}`)
    }
    await loadLogs()
  }

  const loadFiles = async (path = filePath, hostId = activeSession?.hostId ?? selectedHostId) => {
    if (!hostId || hostId === 'local-demo') {
      setFileEntries([])
      setFileError('请选择一个真实 SSH 会话后查看文件')
      return
    }

    setIsLoadingFiles(true)
    setFileError('')
    try {
      const response = await apiFetch(`/files/${hostId}?path=${encodeURIComponent(path)}`)
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail.trim() || `文件列表加载失败：${response.status}`)
      }
      const data = (await response.json()) as FileListResponse
      setFilePath(data.path)
      setFileEntries(data.entries)
    } catch (error) {
      const message = error instanceof Error ? error.message : '文件列表加载失败'
      setFileError(message)
      setErrorMessage(message)
    } finally {
      setIsLoadingFiles(false)
    }
  }

  const downloadFile = async (entry: FileEntry) => {
    const hostId = activeSession?.hostId ?? selectedHostId
    if (!hostId || entry.type !== 'file') {
      return
    }

    const taskID = `${Date.now()}-${entry.name}`
    setTransferTasks((current) => [
      { id: taskID, name: entry.name, direction: 'download', progress: 20, status: 'running' },
      ...current,
    ])
    try {
      const response = await apiFetch(`/files/${hostId}?download=1&path=${encodeURIComponent(entry.path)}`)
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail.trim() || `下载失败：${response.status}`)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = entry.name
      link.click()
      URL.revokeObjectURL(url)
      setTransferTasks((current) =>
        current.map((task) => (task.id === taskID ? { ...task, progress: 100, status: 'done' } : task)),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '下载失败'
      setErrorMessage(message)
      setTransferTasks((current) =>
        current.map((task) => (task.id === taskID ? { ...task, status: 'error' } : task)),
      )
    }
  }

  const uploadFiles = async (files: FileList | File[]) => {
    const hostId = activeSession?.hostId ?? selectedHostId
    const selectedFiles = Array.from(files)
    if (!hostId || selectedFiles.length === 0) {
      return
    }

    const taskID = `${Date.now()}-upload`
    setTransferTasks((current) => [
      {
        id: taskID,
        name: selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} 个文件`,
        direction: 'upload',
        progress: 20,
        status: 'running',
      },
      ...current,
    ])

    const body = new FormData()
    for (const file of selectedFiles) {
      body.append('files', file)
    }

    try {
      const response = await apiFetch(`/files/${hostId}?path=${encodeURIComponent(filePath)}`, {
        method: 'POST',
        body,
      })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail.trim() || `上传失败：${response.status}`)
      }
      setTransferTasks((current) =>
        current.map((task) => (task.id === taskID ? { ...task, progress: 100, status: 'done' } : task)),
      )
      await loadFiles(filePath, hostId)
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败'
      setErrorMessage(message)
      setTransferTasks((current) =>
        current.map((task) => (task.id === taskID ? { ...task, status: 'error' } : task)),
      )
    }
  }

  const loadServerMetrics = async () => {
    const hostId = activeSession?.hostId
    if (!hostId || hostId === 'local-demo') {
      setServerMetrics(null)
      return
    }
    const response = await apiFetch(`/metrics/${hostId}`)
    if (!response.ok) {
      return
    }
    setServerMetrics((await response.json()) as ServerMetrics)
  }

  const recordCommand = (command: string) => {
    const normalized = command.trim()
    if (!shouldRecordCommand(normalized)) {
      return
    }

    setCommandHistory((history) => [normalized, ...history.filter((item) => item !== normalized)].slice(0, 80))
    if (settings.aiPredictionEnabled && aiEnabled) {
      setAiPrediction(normalized.startsWith('cd ') ? 'ls -lah' : 'pwd')
    }
  }

  const observeTypedInput = (data: string) => {
    const visibleInput = stripTerminalControlSequences(data)
    let next = commandBufferRef.current

    for (const char of visibleInput) {
      if (char === '\r' || char === '\n') {
        recordCommand(next)
        next = ''
      } else if (char === '\u0003') {
        next = ''
      } else if (char === '\u007f' || char === '\b') {
        next = next.slice(0, -1)
      } else if (char >= ' ' && char !== '\u001b') {
        next += char
      }
    }

    commandBufferRef.current = next
  }

  useEffect(() => {
    if (!activeSession || !xtermRef.current) {
      return
    }

    const disposable = xtermRef.current.onData((data) => {
      if (data === '\t' && aiPrediction) {
        applyPrediction()
        return
      }
      if (data !== '\t') {
        setAiPrediction('')
      }
      observeTypedInput(data)
      void apiFetch(`/sessions/${activeSession.id}/input`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data }),
      })
    })

    return () => disposable.dispose()
  }, [activeSession, aiPrediction, settings.aiPredictionEnabled, aiEnabled])

  useEffect(() => {
    if (leftMode === 'files') {
      void loadFiles(filePath)
    }
  }, [leftMode, activeSessionId])

  useEffect(() => {
    void loadServerMetrics()
    if (!activeSession?.hostId || activeSession.hostId === 'local-demo') {
      return
    }

    const interval = window.setInterval(
      () => void loadServerMetrics(),
      Math.max(1, settings.metricsRefreshIntervalSeconds) * 1000,
    )
    return () => window.clearInterval(interval)
  }, [activeSession?.hostId, settings.metricsRefreshIntervalSeconds])

  const openSessionStream = (session: SessionRecord) => {
    eventSourceRef.current?.close()

    const streamUrl = resolveApiStreamUrl(`/sessions/${session.id}/events`)
    appendLog('debug', 'ui.sse', 'session stream connecting', { sessionID: session.id, url: streamUrl })
    const source = new EventSource(streamUrl)
    eventSourceRef.current = source

    source.onopen = () => {
      appendLog('debug', 'ui.sse', 'session stream opened', { sessionID: session.id })
    }

    source.onerror = () => {
      if (eventSourceRef.current !== source) {
        return
      }
      const messageText = '会话输出流连接失败，请查看运行日志或 Go core 控制台'
      appendLog('error', 'ui.sse', messageText, { sessionID: session.id, url: streamUrl })
      source.close()
      setErrorMessage(messageText)
      setSessions((current) =>
        current.map((item) =>
          item.id === session.id ? { ...item, status: 'error', lastError: messageText } : item,
        ),
      )
      xtermRef.current?.writeln('')
      xtermRef.current?.writeln(`ERROR: ${messageText}`)
    }

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

      if (payload.type === 'cwd' && payload.data && trackTerminalPath) {
        setFilePath(payload.data)
        if (leftMode === 'files') {
          void loadFiles(payload.data, session.hostId)
        }
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
      appendLog('debug', 'ui.sse', 'session stream closed', { sessionID: session.id })
    })
  }

  const activateSession = (session: SessionRecord) => {
    if (session.id === activeSessionId) {
      return
    }

    commandBufferRef.current = ''
    setAiPrediction('')
    setActiveSessionId(session.id)
    xtermRef.current?.clear()
    xtermRef.current?.writeln(`已切换到 ${session.hostName}`)
    openSessionStream(session)
    fitAddonRef.current?.fit()
  }

  const createSession = async (hostId = selectedHostId) => {
    if (!hostId) {
      return
    }

    commandBufferRef.current = ''
    setAiPrediction('')
    setSelectedHostId(hostId)
    xtermRef.current?.clear()
    xtermRef.current?.writeln(`正在为主机 ${hostId} 创建会话...`)

    const payload: SessionOpenRequest = { hostId }

    try {
      const response = await apiFetch('/sessions', {
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

  const closeSession = async (session: SessionRecord) => {
    const confirmed = window.confirm(`确定关闭「${session.hostName}」会话吗？`)
    if (!confirmed) {
      return
    }

    if (activeSessionId === session.id) {
      eventSourceRef.current?.close()
    }
    await apiFetch(`/sessions/${session.id}/close`, { method: 'POST' })
    const remainingSessions = sessions.filter((item) => item.id !== session.id)
    setSessions(remainingSessions)
    if (activeSessionId === session.id) {
      const next = remainingSessions[0]
      setActiveSessionId(next?.id ?? '')
      if (next) {
        xtermRef.current?.clear()
        xtermRef.current?.writeln(`已切换到 ${next.hostName}`)
        openSessionStream(next)
      } else {
        commandBufferRef.current = ''
        setAiPrediction('')
        setServerMetrics(null)
        setFileEntries([])
        xtermRef.current?.clear()
      }
    }
  }

  const writeCommand = (command: string) => {
    xtermRef.current?.focus()
    xtermRef.current?.write(command)
    observeTypedInput(command)
    if (activeSession) {
      void apiFetch(`/sessions/${activeSession.id}/input`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: command }),
      })
    }
  }

  const applyPrediction = () => {
    if (!aiPrediction) {
      return
    }
    writeCommand(aiPrediction)
    setAiPrediction('')
  }

  return (
    <div className="workbench-shell">
      <header className="top-menu">
        <div className="app-title">
          <strong>AI SSH</strong>
          <span>{statusToLabel(healthState)}</span>
        </div>
        <nav className="menu-groups">
          {[
            ['file', '文件'],
            ['edit', '编辑'],
            ['session', '会话'],
            ['transfer', '传输'],
            ['tools', '工具'],
            ['settings', '设置'],
          ].map(([key, label]) => (
            <div className="menu-item" key={key}>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setOpenTopMenu((current) => (current === key ? '' : (key as TopMenu)))
                }}
              >
                {label}
              </button>
              {openTopMenu === key ? (
                <div className="top-dropdown" onClick={(event) => event.stopPropagation()}>
                  {key === 'file' ? (
                    <>
                      <button type="button" onClick={openAddHostDialog}>新增连接</button>
                      <button type="button" onClick={() => void importSampleHost()}>导入</button>
                      <button type="button" onClick={() => void exportHosts()}>导出</button>
                    </>
                  ) : null}
                  {key === 'session' ? (
                    <>
                      <button type="button" onClick={() => void createSession()}>新建会话</button>
                      <button disabled={!activeSession} type="button" onClick={() => activeSession && void closeSession(activeSession)}>
                        关闭当前
                      </button>
                    </>
                  ) : null}
                  {key === 'transfer' ? (
                    <>
                      <button type="button" onClick={() => uploadFileRef.current?.click()}>上传文件</button>
                      <button type="button" onClick={() => setLeftMode('files')}>打开文件</button>
                    </>
                  ) : null}
                  {key === 'tools' ? <button type="button" onClick={openLogDialog}>日志</button> : null}
                  {key === 'settings' ? <button type="button" onClick={openSettingsDialog}>偏好设置</button> : null}
                  {key === 'edit' ? <button type="button" disabled>复制</button> : null}
                </div>
              ) : null}
            </div>
          ))}
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
                    <div
                      key={host.id}
                      className={`server-row ${selectedHostId === host.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedHostId(host.id)
                        setOpenHostMenuId('')
                      }}
                      onDoubleClick={() => void createSession(host.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void createSession(host.id)
                        }
                      }}
                    >
                      <div className="server-row-main">
                        <span>{host.name}</span>
                        <small>
                          {host.username}@{host.address}:{host.port}
                        </small>
                      </div>
                      <button
                        aria-label={`${host.name} 菜单`}
                        className="host-menu-trigger"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setOpenHostMenuId((current) => (current === host.id ? '' : host.id))
                        }}
                      >
                        ⋯
                      </button>
                      {openHostMenuId === host.id ? (
                        <div className="host-menu" onClick={(event) => event.stopPropagation()}>
                          <button type="button" onClick={() => openEditHostDialog(host)}>编辑</button>
                          <button type="button" onClick={() => void createSession(host.id)}>连接</button>
                          <button type="button" onClick={() => void duplicateHost(host)}>复制配置</button>
                          <button className="danger-item" type="button" onClick={() => void deleteHost(host)}>
                            删除
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <div className="left-content">
              <div className="panel-toolbar">
                <strong>远程文件</strong>
                <div>
                  <button type="button" onClick={() => void loadFiles(parentPath(filePath))}>↑</button>
                  <button type="button" onClick={() => uploadFileRef.current?.click()}>上传</button>
                </div>
              </div>
              <input
                ref={uploadFileRef}
                hidden
                multiple
                type="file"
                onChange={(event) => {
                  if (event.target.files) {
                    void uploadFiles(event.target.files)
                  }
                  event.target.value = ''
                }}
              />
              <label className="toggle-row">
                <input
                  checked={trackTerminalPath}
                  type="checkbox"
                  onChange={(event) => setTrackTerminalPath(event.target.checked)}
                />
                <span>跟踪终端路径</span>
              </label>
              <div
                className="file-browser"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  if (event.dataTransfer.files.length > 0) {
                    void uploadFiles(event.dataTransfer.files)
                  }
                }}
              >
                <div className="file-path-row">
                  <span>{filePath}</span>
                  <button type="button" onClick={() => void loadFiles(filePath)}>
                    刷新
                  </button>
                </div>
                {fileError ? <p className="error-text">{fileError}</p> : null}
                {isLoadingFiles ? <p className="hint-text">加载中...</p> : null}
                <div className="file-table">
                  <div className="file-table-head">
                    <span>名称</span>
                    <span>大小</span>
                    <span>修改日期</span>
                  </div>
                  {fileEntries.map((entry) => (
                    <button
                      key={entry.path}
                      draggable={entry.type === 'file'}
                      type="button"
                      onDragStart={(event) => {
                        if (entry.type === 'file') {
                          event.dataTransfer.setData(
                            'text/uri-list',
                            resolveApiUrl(`/files/${activeSession?.hostId ?? selectedHostId}?download=1&path=${encodeURIComponent(entry.path)}`),
                          )
                          event.dataTransfer.setData('DownloadURL', `application/octet-stream:${entry.name}:${resolveApiUrl(`/files/${activeSession?.hostId ?? selectedHostId}?download=1&path=${encodeURIComponent(entry.path)}`)}`)
                        }
                      }}
                      onDoubleClick={() => {
                        if (entry.type === 'directory') {
                          void loadFiles(entry.path)
                        } else {
                          void downloadFile(entry)
                        }
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        if (entry.type === 'file') {
                          void downloadFile(entry)
                        }
                      }}
                    >
                      <span>{entry.type === 'directory' ? '▸ ' : ''}{entry.name}</span>
                      <span>{entry.type === 'directory' ? '-' : formatBytes(entry.size)}</span>
                      <span>{new Date(entry.modifiedAt).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
                {transferTasks.length > 0 ? (
                  <div className="transfer-list">
                    {transferTasks.slice(0, 4).map((task) => (
                      <div key={task.id}>
                        <span>{task.direction === 'upload' ? '上传' : '下载'} · {task.name}</span>
                        <progress max="100" value={task.progress} />
                        <small>{task.status}</small>
                      </div>
                    ))}
                  </div>
                ) : null}
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
                <div
                  key={session.id}
                  className={`session-tab ${activeSession?.id === session.id ? 'active' : ''}`}
                  onClick={() => activateSession(session)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      activateSession(session)
                    }
                  }}
                >
                  <span className={`tab-status tab-status-${session.status}`} title={sessionStatusLabel(session.status)} />
                  <span className="tab-title">{session.hostName}</span>
                  <button
                    className="tab-close"
                    type="button"
                    aria-label={`关闭 ${session.hostName}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      void closeSession(session)
                    }}
                  >
                    x
                  </button>
                </div>
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
            {!activeSession ? (
              <div className="terminal-empty">
                <div>
                  <p className="section-label">快速连接</p>
                  <h2>选择一个服务器开始 SSH 会话</h2>
                  <span>关闭所有标签后，终端会回到这里。左侧也可以继续新增、导入或管理服务器。</span>
                </div>
                <div className="recent-hosts">
                  {recentHosts.length > 0 ? (
                    recentHosts.map((host) => (
                      <button key={host.id} type="button" onClick={() => void createSession(host.id)}>
                        <strong>{host.name}</strong>
                        <span>{host.username}@{host.address}:{host.port}</span>
                      </button>
                    ))
                  ) : (
                    <button type="button" onClick={openAddHostDialog}>
                      <strong>新增 SSH 连接</strong>
                      <span>保存后双击服务器卡片即可连接</span>
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </main>

        <aside className="right-rail">
          <section className="info-panel">
            <p className="section-label">当前服务器</p>
            <h3>{activeSession?.hostName ?? activeHost?.name ?? '未连接'}</h3>
            <dl>
              <div>
                <dt>地址</dt>
                <dd>{activeHost ? `${activeHost.address}:${activeHost.port}` : '-'}</dd>
              </div>
              <div>
                <dt>用户</dt>
                <dd>{activeHost?.username ?? '-'}</dd>
              </div>
              <div>
                <dt>认证</dt>
                <dd>{activeHost?.authType ?? '-'}</dd>
              </div>
            </dl>
            <div className="metric-grid">
              <div>
                <span>CPU</span>
                <strong>{serverMetrics ? `${serverMetrics.cpuPercent}%` : '-'}</strong>
              </div>
              <div>
                <span>内存</span>
                <strong>{serverMetrics ? `${serverMetrics.memoryPercent}%` : '-'}</strong>
              </div>
              <div>
                <span>硬盘</span>
                <strong>{serverMetrics ? `${serverMetrics.diskPercent}%` : '-'}</strong>
              </div>
              <div>
                <span>网络</span>
                <strong>
                  {serverMetrics
                    ? `${formatBytes(serverMetrics.networkRxBytes)} / ${formatBytes(serverMetrics.networkTxBytes)}`
                    : '-'}
                </strong>
              </div>
            </div>
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
                {aiPrediction ? (
                  <button className="prediction-row" type="button" onClick={applyPrediction}>
                    <strong>预测</strong>
                    <code>{aiPrediction}</code>
                    <small>Tab 应用</small>
                  </button>
                ) : null}
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
                <h3>{hostDialogMode === 'edit' ? '编辑服务器' : '新增服务器'}</h3>
              </div>
              <button type="button" onClick={closeAddHostDialog}>×</button>
            </div>

            {hostDialogError ? <p className="error-text modal-error">{hostDialogError}</p> : null}

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
                  <span>{hostDialogMode === 'edit' && savePassword ? '保留或更新密码' : '保存密码'}</span>
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
                  <span>{hostDialogMode === 'edit' && savePrivateKey ? '保留或更新 SSH Key' : '保存 SSH Key'}</span>
                </label>
                <label>
                  <span>SSH Key</span>
                  <div className="file-picker-row">
                    <button
                      disabled={!savePrivateKey}
                      type="button"
                      onClick={() => privateKeyFileRef.current?.click()}
                    >
                      选择文件
                    </button>
                    <small>{hostForm.privateKey ? '已读取私钥内容' : '支持选择本地私钥文件'}</small>
                  </div>
                  <input
                    accept=".pem,.key,.pub,.txt"
                    ref={privateKeyFileRef}
                    type="file"
                    hidden
                    onChange={(event) => {
                      void selectPrivateKeyFile(event.target.files?.[0] ?? null)
                      event.target.value = ''
                    }}
                  />
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
              <button disabled={isSavingHost} type="button" onClick={closeAddHostDialog}>取消</button>
              <button className="primary-button" disabled={isSavingHost} type="submit">
                {isSavingHost ? '保存中' : hostDialogMode === 'edit' ? '保存修改' : '保存'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isLogDialogOpen ? (
        <div className="modal-backdrop">
          <section className="log-modal">
            <div className="modal-header">
              <div>
                <p className="section-label">工具</p>
                <h3>运行日志</h3>
              </div>
              <button type="button" onClick={() => setIsLogDialogOpen(false)}>×</button>
            </div>

            <div className="log-toolbar">
              <label>
                <span>日志级别</span>
                <select
                  value={logLevel}
                  onChange={(event) => void updateLogLevel(event.target.value as LogLevel)}
                >
                  <option value="debug">debug</option>
                  <option value="info">info</option>
                  <option value="warn">warn</option>
                  <option value="error">error</option>
                </select>
              </label>
              <button type="button" onClick={() => void loadLogs()}>刷新</button>
            </div>

            <div className="log-list">
              {logs.length === 0 ? (
                <p className="hint-text">暂无日志</p>
              ) : (
                logs
                  .slice()
                  .reverse()
                  .map((entry) => (
                    <article className={`log-row log-${entry.level}`} key={entry.id}>
                      <header>
                        <strong>{entry.level}</strong>
                        <span>{entry.source}</span>
                        <time>{new Date(entry.timestamp).toLocaleString()}</time>
                      </header>
                      <p>{entry.message}</p>
                      {entry.fields ? <code>{JSON.stringify(entry.fields)}</code> : null}
                    </article>
                  ))
              )}
            </div>
          </section>
        </div>
      ) : null}

      {isSettingsDialogOpen ? (
        <div className="modal-backdrop">
          <section className="settings-modal">
            <div className="modal-header">
              <div>
                <p className="section-label">设置</p>
                <h3>偏好设置</h3>
              </div>
              <button type="button" onClick={() => setIsSettingsDialogOpen(false)}>×</button>
            </div>
            <label>
              <span>服务器信息刷新频率（秒）</span>
              <input
                min="1"
                type="number"
                value={settings.metricsRefreshIntervalSeconds}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    metricsRefreshIntervalSeconds: Number(event.target.value) || 2,
                  }))
                }
              />
            </label>
            <label className="checkbox-row">
              <input
                checked={settings.aiPredictionEnabled}
                type="checkbox"
                onChange={(event) =>
                  setSettings((current) => ({ ...current, aiPredictionEnabled: event.target.checked }))
                }
              />
              <span>开启 AI 命令预测</span>
            </label>
            <label>
              <span>大模型地址</span>
              <input
                value={settings.aiBaseUrl}
                onChange={(event) => setSettings((current) => ({ ...current, aiBaseUrl: event.target.value }))}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label>
              <span>API Key</span>
              <input
                type="password"
                value={settings.aiApiKey}
                onChange={(event) => setSettings((current) => ({ ...current, aiApiKey: event.target.value }))}
                placeholder="sk-..."
              />
            </label>
            <label>
              <span>模型</span>
              <input
                value={settings.aiModel}
                onChange={(event) => setSettings((current) => ({ ...current, aiModel: event.target.value }))}
                placeholder="gpt-4.1-mini"
              />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setIsSettingsDialogOpen(false)}>关闭</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
