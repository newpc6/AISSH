import { useEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import '@xterm/xterm/css/xterm.css'
import {
  type AIPredictionRequest,
  type AIPredictionResponse,
  CORE_API_BASE,
  CORE_DEFAULT_PORT,
  type HealthResponse,
  type HostAuthType,
  type HostGroup,
  type HostGroupsResponse,
  type HostGroupsUpdateRequest,
  type HostRecord,
  type AppSettings,
  type FileEntry,
  type FileListResponse,
  type HostsExportResponse,
  type HostsImportRequest,
  type LogEntry,
  type LogLevel,
  type LogsResponse,
  type LogSettings,
  type ServerMetrics,
  type SessionCwdResponse,
  type HostUpsertRequest,
  type SessionOpenRequest,
  type SessionOpenResponse,
  type SessionRecord,
  type SessionResizeRequest,
  type TerminalEvent,
} from '@ai-ssh/shared-contracts'

type LoadState = 'idle' | 'loading' | 'success' | 'error'
type LeftMode = 'servers' | 'files'
type RightTool = 'ai' | 'history' | 'favorites'
type HostDialogMode = 'create' | 'edit'
type TopMenu = 'file' | 'edit' | 'session' | 'transfer' | 'tools' | 'settings' | ''
type SettingsSection = 'general' | 'metrics' | 'ai'

type MetricSample = ServerMetrics & {
  networkRxRateBytes: number
  networkTxRateBytes: number
}

type MetricHover = {
  key: MetricChartKey
  index: number
  x: number
  y: number
} | null

type PredictionGhostPosition = {
  left: number
  top: number
  maxWidth: number
  height: number
}

type SessionReconnectResponse = {
  previousSessionId: string
  session: SessionRecord
}

type TerminalCache = {
  chunks: string[]
  lineCount: number
  commandDraft: string
}

type FilePreviewKind = 'text' | 'image' | 'video' | 'binary'
type FilePreviewStatus = 'loading' | 'ready' | 'error'

type FilePreviewTab = {
  id: string
  sessionId: string
  hostId: string
  hostName: string
  name: string
  path: string
  size: number
  modifiedAt: string
  kind: FilePreviewKind
  status: FilePreviewStatus
  content?: string
  objectUrl?: string
  error?: string
}

type MetricChartKey = 'cpuPercent' | 'memoryPercent'

type HostGroupView = HostGroup & {
  hosts: HostRecord[]
}

type SaveFilePickerHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>
    close: () => Promise<void>
  }>
}

type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: (options: { suggestedName?: string }) => Promise<SaveFilePickerHandle>
}

const CORE_API_FALLBACK_BASE = `http://127.0.0.1:${CORE_DEFAULT_PORT}/api`
const FILE_PREVIEW_CONFIRM_BYTES = 8 * 1024 * 1024
const FAVORITE_COMMANDS_STORAGE_KEY = 'ai-ssh-favorite-commands'

const textFileExtensions = new Set([
  'bash',
  'c',
  'conf',
  'cpp',
  'cs',
  'css',
  'csv',
  'env',
  'go',
  'h',
  'html',
  'ini',
  'java',
  'js',
  'json',
  'jsx',
  'log',
  'md',
  'properties',
  'py',
  'rs',
  'sh',
  'sql',
  'toml',
  'ts',
  'tsx',
  'txt',
  'xml',
  'yaml',
  'yml',
])
const imageFileExtensions = new Set(['bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp'])
const videoFileExtensions = new Set(['m4v', 'mov', 'mp4', 'mpeg', 'ogv', 'webm'])

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
  metricsHistoryWindowMinutes: 5,
  metricsCompactPointLimit: 5,
  metricsExpandedPointLimit: 20,
  terminalRetainedLines: 1000,
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
  aiPredictionEnabled: true,
  aiPredictionCount: 3,
  aiTerminalContextLimit: 5000,
  aiCommandHistoryLimit: 20,
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

function formatRate(size: number) {
  return `${formatBytes(Math.max(0, size))}/s`
}

function fileExtension(name: string) {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

function detectPreviewKind(entry: FileEntry): FilePreviewKind {
  const extension = fileExtension(entry.name)
  if (imageFileExtensions.has(extension)) return 'image'
  if (videoFileExtensions.has(extension)) return 'video'
  if (textFileExtensions.has(extension)) return 'text'
  if (entry.size <= 512 * 1024 && !extension) return 'text'
  return 'binary'
}

function previewKindLabel(kind: FilePreviewKind) {
  if (kind === 'text') return '文本'
  if (kind === 'image') return '图片'
  if (kind === 'video') return '视频'
  return '文件'
}

function previewMimeType(entry: Pick<FileEntry, 'name'>, kind: FilePreviewKind) {
  const extension = fileExtension(entry.name)
  if (kind === 'text') {
    if (extension === 'md') return 'text/markdown;charset=utf-8'
    if (extension === 'json') return 'application/json;charset=utf-8'
    if (extension === 'html') return 'text/html;charset=utf-8'
    if (extension === 'css') return 'text/css;charset=utf-8'
    if (extension === 'js' || extension === 'jsx') return 'text/javascript;charset=utf-8'
    return 'text/plain;charset=utf-8'
  }
  if (kind === 'image') {
    if (extension === 'svg') return 'image/svg+xml'
    if (extension === 'jpg') return 'image/jpeg'
    return `image/${extension || 'png'}`
  }
  if (kind === 'video') {
    if (extension === 'mov') return 'video/quicktime'
    if (extension === 'm4v') return 'video/mp4'
    return `video/${extension || 'mp4'}`
  }
  return 'application/octet-stream'
}

function formatMetricTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatMetricDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatMemorySummary(metrics: ServerMetrics | null) {
  if (!metrics) return '-'
  if (metrics.memoryTotalBytes > 0) {
    return `${formatBytes(metrics.memoryUsedBytes)} / ${formatBytes(metrics.memoryTotalBytes)} ${metrics.memoryPercent}%`
  }
  return `${metrics.memoryPercent}%`
}

function parentPath(path: string) {
  if (!path || path === '.' || path === '/') return '.'
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.length === 0 ? '/' : `/${parts.join('/')}`
}

function normalizeRemotePath(path: string) {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '.') return '.'
  const isAbsolute = trimmed.startsWith('/')
  const parts: string[] = []
  for (const part of trimmed.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  if (isAbsolute) {
    return parts.length === 0 ? '/' : `/${parts.join('/')}`
  }
  return parts.length === 0 ? '.' : parts.join('/')
}

function unquoteShellPath(value: string) {
  const trimmed = value.trim().replace(/\\ /g, ' ')
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function inferRemotePathFromCommand(command: string, currentPath: string) {
  const firstCommand = command.trim().split(/\s*(?:&&|\|\||;)\s*/)[0] ?? ''
  const match = firstCommand.match(/^cd(?:\s+(.+))?$/)
  if (!match) return ''

  const target = unquoteShellPath(match[1] ?? '~')
  if (!target || target === '~') return '.'
  if (target === '-') return ''
  if (target.startsWith('~/')) return normalizeRemotePath(`.${target.slice(1)}`)
  if (target.startsWith('/')) return normalizeRemotePath(target)

  const basePath = currentPath && currentPath !== '.' ? currentPath : '.'
  return normalizeRemotePath(`${basePath}/${target}`)
}

async function saveBlobWithFilePicker(blob: Blob, suggestedName: string) {
  if ('__TAURI_INTERNALS__' in window) {
    const targetPath = await saveDialog({ defaultPath: suggestedName })
    if (!targetPath) {
      return true
    }
    const data = new Uint8Array(await blob.arrayBuffer())
    await writeFile(targetPath, data)
    return true
  }

  const picker = (window as WindowWithSaveFilePicker).showSaveFilePicker
  if (!picker) {
    return false
  }

  const handle = await picker({ suggestedName })
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
  return true
}

function downloadBlobInBrowser(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function shouldRecordCommand(command: string) {
  if (!command) return false
  if (command.includes('__AI_SSH_CWD__')) return false
  if (command.startsWith('printf ') && command.includes('$PWD')) return false
  if (/^\[\>?[0-9;]*[a-zA-Z]$/.test(command)) return false
  if (/^(?:\]|\^]).*(?:\\|\u0007)?$/.test(command)) return false
  if (/^[0-9;?=><\\[\]()#;:\s]*$/.test(command)) return false
  return true
}

function stripTerminalControlSequences(data: string) {
  return data
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\|\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[()][A-Za-z0-9]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
}

function terminalContextTail(cache: TerminalCache | undefined, limit: number) {
  return stripTerminalControlSequences(cache?.chunks.join('') ?? '').slice(-Math.max(500, limit))
}

function normalizeAppSettings(value: Partial<AppSettings> = {}): AppSettings {
  return {
    ...defaultSettings,
    ...value,
    metricsRefreshIntervalSeconds: Math.max(
      1,
      Number(value.metricsRefreshIntervalSeconds ?? defaultSettings.metricsRefreshIntervalSeconds) || 2,
    ),
    metricsHistoryWindowMinutes: Math.max(
      1,
      Number(value.metricsHistoryWindowMinutes ?? defaultSettings.metricsHistoryWindowMinutes) || 5,
    ),
    metricsCompactPointLimit: Math.max(
      2,
      Math.min(30, Number(value.metricsCompactPointLimit ?? defaultSettings.metricsCompactPointLimit) || 5),
    ),
    metricsExpandedPointLimit: Math.max(
      2,
      Math.min(120, Number(value.metricsExpandedPointLimit ?? defaultSettings.metricsExpandedPointLimit) || 20),
    ),
    terminalRetainedLines: Math.max(
      100,
      Number(value.terminalRetainedLines ?? defaultSettings.terminalRetainedLines) || 1000,
    ),
    aiPredictionCount: Math.max(
      1,
      Math.min(8, Number(value.aiPredictionCount ?? defaultSettings.aiPredictionCount) || 3),
    ),
    aiTerminalContextLimit: Math.max(
      500,
      Math.min(50000, Number(value.aiTerminalContextLimit ?? defaultSettings.aiTerminalContextLimit) || 5000),
    ),
    aiCommandHistoryLimit: Math.max(
      1,
      Math.min(200, Number(value.aiCommandHistoryLimit ?? defaultSettings.aiCommandHistoryLimit) || 20),
    ),
  }
}

function normalizeFavoriteCommands(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }
  const seen = new Set<string>()
  const commands: string[] = []
  for (const item of value) {
    const command = stripTerminalControlSequences(String(item)).trim()
    if (!command || seen.has(command)) {
      continue
    }
    seen.add(command)
    commands.push(command)
    if (commands.length >= 200) {
      break
    }
  }
  return commands
}

function emptyTerminalCache(): TerminalCache {
  return {
    chunks: [],
    lineCount: 0,
    commandDraft: '',
  }
}

function countTerminalLines(data: string) {
  return (data.match(/\r\n|\r|\n/g) ?? []).length
}

function appendTerminalCache(cache: TerminalCache | undefined, data: string, maxLines: number): TerminalCache {
  if (!data) {
    return cache ?? emptyTerminalCache()
  }

  const limit = Math.max(100, Math.floor(maxLines || 1000))
  const chunks = [...(cache?.chunks ?? []), data]
  let lineCount = (cache?.lineCount ?? 0) + countTerminalLines(data)

  while (chunks.length > 1 && lineCount > limit) {
    const removed = chunks.shift() ?? ''
    lineCount -= countTerminalLines(removed)
  }

  return {
    chunks,
    lineCount: Math.max(0, lineCount),
    commandDraft: cache?.commandDraft ?? '',
  }
}

function updateTerminalDraft(cache: TerminalCache | undefined, draft: string): TerminalCache {
  return {
    ...(cache ?? emptyTerminalCache()),
    commandDraft: draft,
  }
}

function buildMetricPath(samples: MetricSample[], key: MetricChartKey, width: number, height: number) {
  if (samples.length === 0) return ''
  if (samples.length === 1) {
    const y = height - (Math.max(0, Math.min(100, samples[0][key])) / 100) * height
    return `M 0 ${y.toFixed(1)} L ${width} ${y.toFixed(1)}`
  }
  return samples
    .map((sample, index) => {
      const x = (index / (samples.length - 1)) * width
      const y = height - (Math.max(0, Math.min(100, sample[key])) / 100) * height
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

function metricPointIndexes(sampleCount: number, maxPoints: number) {
  const indexes = new Set<number>()
  if (sampleCount <= 0) {
    return indexes
  }
  if (sampleCount <= maxPoints) {
    for (let index = 0; index < sampleCount; index += 1) {
      indexes.add(index)
    }
    return indexes
  }

  const lastIndex = sampleCount - 1
  for (let point = 0; point < maxPoints; point += 1) {
    indexes.add(Math.round((point / (maxPoints - 1)) * lastIndex))
  }
  return indexes
}

function metricXAxisLabels(samples: MetricSample[]) {
  if (samples.length === 0) {
    return ['-', '-']
  }
  const first = samples[0]
  const last = samples[samples.length - 1]
  return [formatMetricTime(first.collectedAt), formatMetricTime(last.collectedAt)]
}

function normalizeHostGroups(groups: HostGroup[], hosts: HostRecord[] = []) {
  const seen = new Set<string>()
  const normalized: HostGroup[] = []
  const append = (name: string) => {
    const trimmed = name.trim() || '默认'
    if (seen.has(trimmed)) {
      return
    }
    seen.add(trimmed)
    normalized.push({ name: trimmed })
  }

  for (const group of groups) {
    append(group.name)
  }
  for (const host of hosts) {
    append(host.group ?? '默认')
  }
  if (normalized.length === 0) {
    append('默认')
  }
  return normalized
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
  const [hostGroups, setHostGroups] = useState<HostGroup[]>([{ name: '默认' }])
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false)
  const [groupDrafts, setGroupDrafts] = useState<string[]>(['默认'])
  const [originalGroupDrafts, setOriginalGroupDrafts] = useState<string[]>(['默认'])
  const [groupDialogMessage, setGroupDialogMessage] = useState('')
  const [groupDialogError, setGroupDialogError] = useState('')
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [selectedHostId, setSelectedHostId] = useState<string>('')
  const [activeSessionId, setActiveSessionId] = useState<string>('')
  const [leftMode, setLeftMode] = useState<LeftMode>('servers')
  const [rightTool, setRightTool] = useState<RightTool>('ai')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')
  const [openTopMenu, setOpenTopMenu] = useState<TopMenu>('')
  const [aiEnabled, setAiEnabled] = useState(true)
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [isServerInfoCollapsed, setIsServerInfoCollapsed] = useState(false)
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
  const [favoriteCommands, setFavoriteCommands] = useState<string[]>([])
  const [pendingFavoriteDelete, setPendingFavoriteDelete] = useState('')
  const [aiPredictions, setAiPredictions] = useState<string[]>([])
  const [aiPredictionIndex, setAiPredictionIndex] = useState(0)
  const [aiPredictionState, setAiPredictionState] = useState<LoadState>('idle')
  const [aiPredictionError, setAiPredictionError] = useState('')
  const [predictionGhostPosition, setPredictionGhostPosition] = useState<PredictionGhostPosition | null>(null)
  const [terminalCaches, setTerminalCaches] = useState<Record<string, TerminalCache>>({})
  const [filePreviewTabs, setFilePreviewTabs] = useState<FilePreviewTab[]>([])
  const [activeViewId, setActiveViewId] = useState('')
  const [expandedMetric, setExpandedMetric] = useState<MetricChartKey | ''>('')
  const [metricHover, setMetricHover] = useState<MetricHover>(null)
  const [settingsSavedMessage, setSettingsSavedMessage] = useState('')
  const [filePath, setFilePath] = useState('.')
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([])
  const [fileError, setFileError] = useState('')
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [leftRailWidth, setLeftRailWidth] = useState(380)
  const [filePathDraft, setFilePathDraft] = useState('.')
  const [trackTerminalPath, setTrackTerminalPath] = useState(true)
  const [transferTasks, setTransferTasks] = useState<
    { id: string; name: string; direction: 'upload' | 'download'; progress: number; status: string }[]
  >([])
  const [serverMetrics, setServerMetrics] = useState<ServerMetrics | null>(null)
  const [metricHistory, setMetricHistory] = useState<MetricSample[]>([])
  const terminalRef = useRef<HTMLDivElement | null>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const eventSourcesRef = useRef<Record<string, EventSource>>({})
  const commandBufferRef = useRef('')
  const activeSessionIdRef = useRef('')
  const sessionSettingsRef = useRef(defaultSettings)
  const hostsRef = useRef<HostRecord[]>([])
  const sessionsRef = useRef<SessionRecord[]>([])
  const filePreviewTabsRef = useRef<FilePreviewTab[]>([])
  const aiEnabledRef = useRef(true)
  const commandHistoryRef = useRef<string[]>([])
  const terminalCachesRef = useRef<Record<string, TerminalCache>>({})
  const leftModeRef = useRef<LeftMode>('servers')
  const trackTerminalPathRef = useRef(true)
  const inputQueuesRef = useRef<Record<string, Promise<void>>>({})
  const pendingResizeRef = useRef<Record<string, number>>({})
  const pendingAIPredictionTimerRef = useRef<number | undefined>(undefined)
  const pendingAIPredictionCommandRef = useRef('')
  const aiPredictionRequestRef = useRef(0)
  const aiPredictionCursorRef = useRef(0)
  const aiPredictionCycleStartedRef = useRef(false)
  const predictionPositionFrameRef = useRef<number | undefined>(undefined)
  const predictionGhostVisibleRef = useRef(false)
  const alternateScreenSessionsRef = useRef<Set<string>>(new Set())
  const previousMetricsRef = useRef<ServerMetrics | null>(null)
  const filePathRef = useRef('.')
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

  const setActiveSession = (sessionId: string) => {
    activeSessionIdRef.current = sessionId
    setActiveSessionId(sessionId)
    if (sessionId) {
      setActiveViewId(`session:${sessionId}`)
    }
  }

  const setTrackedFilePath = (path: string) => {
    filePathRef.current = path
    setFilePath(path)
  }

  const clearAIPrediction = (options: { cancelPending?: boolean } = {}) => {
    if (options.cancelPending !== false) {
      window.clearTimeout(pendingAIPredictionTimerRef.current)
      pendingAIPredictionTimerRef.current = undefined
      pendingAIPredictionCommandRef.current = ''
      aiPredictionRequestRef.current += 1
    }
    setAiPredictions([])
    setAiPredictionIndex(0)
    setAiPredictionState('idle')
    setAiPredictionError('')
    predictionGhostVisibleRef.current = false
    setPredictionGhostPosition(null)
    aiPredictionCursorRef.current = 0
    aiPredictionCycleStartedRef.current = false
  }

  const updatePredictionGhostPositionNow = () => {
    const terminal = xtermRef.current
    const surface = terminalRef.current
    if (!predictionGhostVisibleRef.current || !terminal || !surface) {
      setPredictionGhostPosition(null)
      return
    }

    const viewport = surface.querySelector('.xterm-viewport') as HTMLElement | null
    const screen = surface.querySelector('.xterm-screen') as HTMLElement | null
    const xtermRows = surface.querySelector('.xterm-rows') as HTMLElement | null
    const firstRow = xtermRows?.querySelector('div') as HTMLElement | null
    const viewportRect = viewport?.getBoundingClientRect() ?? surface.getBoundingClientRect()
    const surfaceRect = surface.getBoundingClientRect()
    const screenRect = screen?.getBoundingClientRect() ?? viewportRect
    const cellWidth = firstRow ? firstRow.getBoundingClientRect().width / Math.max(terminal.cols, 1) : viewportRect.width / Math.max(terminal.cols, 1)
    const cellHeight = firstRow?.getBoundingClientRect().height || viewportRect.height / Math.max(terminal.rows, 1)
    const cursorX = Math.min(terminal.buffer.active.cursorX + 1, Math.max(terminal.cols - 1, 0))
    const cursorY = terminal.buffer.active.cursorY
    const left = Math.min(
      Math.max(8, screenRect.left - surfaceRect.left + cursorX * cellWidth + 2),
      Math.max(8, surfaceRect.width - 80),
    )
    const top = Math.min(
      Math.max(8, screenRect.top - surfaceRect.top + cursorY * cellHeight),
      Math.max(8, surfaceRect.height - cellHeight - 8),
    )
    setPredictionGhostPosition({
      left,
      top,
      maxWidth: Math.max(120, surfaceRect.width - left - 12),
      height: Math.max(18, cellHeight),
    })
  }

  const schedulePredictionGhostPositionUpdate = () => {
    window.cancelAnimationFrame(predictionPositionFrameRef.current ?? 0)
    predictionPositionFrameRef.current = window.requestAnimationFrame(() => {
      predictionPositionFrameRef.current = undefined
      updatePredictionGhostPositionNow()
    })
  }

  const queueSessionInput = (sessionId: string, data: string) => {
    const previous = inputQueuesRef.current[sessionId] ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const response = await apiFetch(`/sessions/${sessionId}/input`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ data }),
        })
        if (!response.ok) {
          const detail = await response.text()
          throw new Error(detail.trim() || `会话输入失败：${response.status}`)
        }
      })
      .catch((error) => {
        const detail = error instanceof Error ? error.message : String(error)
        markSessionDisconnected(sessionId, `会话已断开，输入无法发送：${detail}`)
      })
    inputQueuesRef.current[sessionId] = next.then(
      () => undefined,
      () => undefined,
    )
  }

  const syncTerminalSize = (sessionId = activeSessionIdRef.current) => {
    const terminal = xtermRef.current
    if (!sessionId || !terminal) {
      return
    }

    window.clearTimeout(pendingResizeRef.current[sessionId])
    pendingResizeRef.current[sessionId] = window.setTimeout(() => {
      if (!eventSourcesRef.current[sessionId]) {
        return
      }
      const payload: SessionResizeRequest = {
        cols: terminal.cols,
        rows: terminal.rows,
      }
      void apiFetch(`/sessions/${sessionId}/resize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
        .then(async (response) => {
          if (!response.ok) {
            const detail = await response.text()
            throw new Error(detail.trim() || `终端尺寸同步失败：${response.status}`)
          }
        })
        .catch((error) => {
          const detail = error instanceof Error ? error.message : String(error)
          markSessionDisconnected(sessionId, `会话已断开，终端尺寸无法同步：${detail}`)
        })
    }, 80)
  }

  const replaceTerminalWithCache = (sessionId: string) => {
    const terminal = xtermRef.current
    if (!terminal) {
      return
    }

    terminal.clear()
    const cache = terminalCachesRef.current[sessionId]
    if (cache?.chunks.length) {
      terminal.write(cache.chunks.join(''))
    }
    commandBufferRef.current = cache?.commandDraft ?? ''
  }

  const appendSessionTerminalOutput = (sessionId: string, data: string) => {
    const maxLines = sessionSettingsRef.current.terminalRetainedLines
    setTerminalCaches((current) => {
      const next = {
        ...current,
        [sessionId]: appendTerminalCache(current[sessionId], data, maxLines),
      }
      terminalCachesRef.current = next
      return next
    })

    if (activeSessionIdRef.current === sessionId) {
      xtermRef.current?.write(data)
      schedulePredictionGhostPositionUpdate()
      if (
        pendingAIPredictionCommandRef.current &&
        sessionSettingsRef.current.aiPredictionEnabled &&
        aiEnabledRef.current &&
        !alternateScreenSessionsRef.current.has(sessionId)
      ) {
        scheduleAIPrediction(commandHistoryRef.current, 700)
      }
    }
  }

  const setSessionCommandDraft = (sessionId: string, draft: string) => {
    setTerminalCaches((current) => {
      const next = {
        ...current,
        [sessionId]: updateTerminalDraft(current[sessionId], draft),
      }
      terminalCachesRef.current = next
      return next
    })
  }

  const removeTerminalCache = (sessionId: string) => {
    setTerminalCaches((current) => {
      const next = { ...current }
      delete next[sessionId]
      terminalCachesRef.current = next
      return next
    })
  }

  const closeSessionStream = (sessionId: string) => {
    const source = eventSourcesRef.current[sessionId]
    if (source) {
      source.close()
      delete eventSourcesRef.current[sessionId]
    }
    delete inputQueuesRef.current[sessionId]
    window.clearTimeout(pendingResizeRef.current[sessionId])
    delete pendingResizeRef.current[sessionId]
  }

  const markSessionDisconnected = (sessionId: string, message: string) => {
    const session = sessionsRef.current.find((item) => item.id === sessionId)
    closeSessionStream(sessionId)
    if (!session || session.status === 'error' || session.status === 'closed') {
      return
    }

    const nextSessions = sessionsRef.current.map((item) =>
      item.id === sessionId ? { ...item, status: 'error' as const, lastError: message } : item,
    )
    sessionsRef.current = nextSessions
    setSessions(nextSessions)
    appendLog('warn', 'ui.session', 'session marked disconnected', {
      sessionID: sessionId,
      hostID: session.hostId,
      message,
    })
    if (activeSessionIdRef.current === sessionId) {
      clearAIPrediction()
      setErrorMessage(message)
      appendSessionTerminalOutput(sessionId, `\r\nERROR: ${message}\r\n`)
    }
  }

  const apiFetch = async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const requestPath = path.startsWith('/') ? path : `/${path}`
    const primaryUrl = `${CORE_API_BASE}${requestPath}`
    appendLog('debug', 'ui.api', 'request started', { method, path: requestPath })

    try {
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
    } catch (error) {
      appendLog('error', 'ui.api', 'request failed', {
        method,
        path: requestPath,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  const persistFavoriteCommands = (commands: string[]) => {
    const normalized = normalizeFavoriteCommands(commands)
    setFavoriteCommands(normalized)
    window.localStorage.setItem(FAVORITE_COMMANDS_STORAGE_KEY, JSON.stringify(normalized))
  }

  const toggleFavoriteCommand = (command: string) => {
    const normalized = stripTerminalControlSequences(command).trim()
    if (!normalized) {
      return
    }
    const next = favoriteCommands.includes(normalized)
      ? favoriteCommands.filter((item) => item !== normalized)
      : [normalized, ...favoriteCommands.filter((item) => item !== normalized)]
    persistFavoriteCommands(next)
  }

  const deleteFavoriteCommand = (command: string) => {
    const normalized = stripTerminalControlSequences(command).trim()
    if (!normalized) {
      return
    }
    persistFavoriteCommands(favoriteCommands.filter((item) => item !== normalized))
    setPendingFavoriteDelete('')
  }

  const isFavoriteCommand = (command: string) => favoriteCommands.includes(stripTerminalControlSequences(command).trim())

  useEffect(() => {
    const rawSettings = window.localStorage.getItem('ai-ssh-settings')
    if (rawSettings) {
      try {
        const normalized = normalizeAppSettings(JSON.parse(rawSettings) as Partial<AppSettings>)
        setSettings(normalized)
        sessionSettingsRef.current = normalized
      } catch (error) {
        appendLog('warn', 'ui.settings', 'settings load failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    const rawFavorites = window.localStorage.getItem(FAVORITE_COMMANDS_STORAGE_KEY)
    if (rawFavorites) {
      try {
        setFavoriteCommands(normalizeFavoriteCommands(JSON.parse(rawFavorites)))
      } catch (error) {
        appendLog('warn', 'ui.favorites', 'favorite commands load failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

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

    const onResize = () => {
      fitAddon.fit()
      syncTerminalSize()
      schedulePredictionGhostPositionUpdate()
    }
    window.addEventListener('resize', onResize)
    const resizeObserver = terminalRef.current
      ? new ResizeObserver(() => {
          window.requestAnimationFrame(onResize)
        })
      : null
    if (terminalRef.current && resizeObserver) {
      resizeObserver.observe(terminalRef.current)
    }
    const resizeDisposable = terminal.onResize(() => syncTerminalSize())
    const cursorDisposable = terminal.onCursorMove(schedulePredictionGhostPositionUpdate)
    const renderDisposable = terminal.onRender(schedulePredictionGhostPositionUpdate)

    return () => {
      window.removeEventListener('resize', onResize)
      resizeObserver?.disconnect()
      resizeDisposable.dispose()
      cursorDisposable.dispose()
      renderDisposable.dispose()
      window.cancelAnimationFrame(predictionPositionFrameRef.current ?? 0)
      Object.values(eventSourcesRef.current).forEach((source) => source.close())
      eventSourcesRef.current = {}
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
    void loadHostGroups()
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
    const checkCoreHealth = async () => {
      try {
        const response = await apiFetch('/health')
        if (!response.ok) {
          throw new Error(`请求失败：${response.status}`)
        }
        const data = (await response.json()) as HealthResponse
        setHealth(data)
        setHealthState('success')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'core 不可用'
        setHealthState('error')
        setErrorMessage(message)
        sessionsRef.current
          .filter((session) => session.status === 'connected' || session.status === 'connecting')
          .forEach((session) => markSessionDisconnected(session.id, `Go core 连接中断：${message}`))
      }
    }

    const interval = window.setInterval(() => {
      void checkCoreHealth()
    }, 3000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!openTopMenu) {
      return
    }

    const closeMenu = () => setOpenTopMenu('')
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [openTopMenu])

  useEffect(() => {
    filePathRef.current = filePath
    setFilePathDraft(filePath)
  }, [filePath])

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  useEffect(() => {
    hostsRef.current = hosts
  }, [hosts])

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  useEffect(() => {
    const isKnownSessionView =
      activeViewId.startsWith('session:') && sessions.some((session) => `session:${session.id}` === activeViewId)
    const isKnownFileView =
      activeViewId.startsWith('file:') && filePreviewTabs.some((tab) => `file:${tab.id}` === activeViewId)
    if (activeViewId && (isKnownSessionView || isKnownFileView)) {
      return
    }
    if (activeSessionId) {
      setActiveViewId(`session:${activeSessionId}`)
    } else if (filePreviewTabs.length > 0) {
      setActiveViewId(`file:${filePreviewTabs[0].id}`)
    }
  }, [activeViewId, activeSessionId, filePreviewTabs, sessions])

  useEffect(() => {
    return () => {
      filePreviewTabsRef.current.forEach((tab) => {
        if (tab.objectUrl) {
          URL.revokeObjectURL(tab.objectUrl)
        }
      })
    }
  }, [])

  useEffect(() => {
    aiEnabledRef.current = aiEnabled
  }, [aiEnabled])

  useEffect(() => {
    const normalized = normalizeAppSettings(settings)
    sessionSettingsRef.current = normalized
  }, [settings])

  useEffect(() => {
    commandHistoryRef.current = commandHistory
  }, [commandHistory])

  useEffect(() => {
    terminalCachesRef.current = terminalCaches
  }, [terminalCaches])

  useEffect(() => {
    filePreviewTabsRef.current = filePreviewTabs
  }, [filePreviewTabs])

  useEffect(() => {
    leftModeRef.current = leftMode
  }, [leftMode])

  useEffect(() => {
    trackTerminalPathRef.current = trackTerminalPath
  }, [trackTerminalPath])

  const currentHost = useMemo(
    () => hosts.find((host) => host.id === selectedHostId) ?? null,
    [hosts, selectedHostId],
  )
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null
  const activeFilePreview = filePreviewTabs.find((tab) => `file:${tab.id}` === activeViewId) ?? null
  const isFilePreviewActive = Boolean(activeFilePreview)
  const activeHost = useMemo(
    () => hosts.find((host) => host.id === activeSession?.hostId) ?? currentHost,
    [hosts, activeSession, currentHost],
  )
  const recentHosts = useMemo(() => hosts.filter((host) => host.id !== 'local-demo').slice(0, 5), [hosts])
  const latestMetricSample = metricHistory[metricHistory.length - 1] ?? null
  const primaryDisk = serverMetrics?.disks?.find((disk) => disk.mount === '/') ?? serverMetrics?.disks?.[0] ?? null
  const primaryPrediction = commandBufferRef.current.trim() ? '' : (aiPredictions[aiPredictionIndex] ?? aiPredictions[0] ?? '')
  const isAIProviderConfigured = Boolean(settings.aiBaseUrl.trim() && settings.aiModel.trim())
  const groupedHosts = useMemo<HostGroupView[]>(() => {
    const groups = normalizeHostGroups(hostGroups, hosts)
    return groups.map((group) => ({
      ...group,
      hosts: hosts.filter((host) => (host.group || '默认') === group.name),
    }))
  }, [hostGroups, hosts])

  useEffect(() => {
    previousMetricsRef.current = null
    setMetricHistory([])
  }, [activeSession?.hostId])

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

  const loadHostGroups = async () => {
    const response = await apiFetch('/host-groups')
    if (!response.ok) {
      appendLog('warn', 'ui.hostGroups', 'host groups load failed', { status: response.status })
      return normalizeHostGroups(hostGroups, hosts)
    }
    const data = (await response.json()) as HostGroupsResponse
    const groups = normalizeHostGroups(data.groups, hosts)
    setHostGroups(groups)
    return groups
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
    setHostForm((current) => ({ ...current, group: hostGroups[0]?.name ?? '默认' }))
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

  const exportHosts = async (includeCredentials = false) => {
    const response = await apiFetch(`/hosts/export${includeCredentials ? '?credentials=1' : ''}`)
    if (!response.ok) {
      setErrorMessage(`导出失败：${response.status}`)
      return
    }
    const payload = (await response.json()) as HostsExportResponse
    const text = JSON.stringify(payload, null, 2)
    await navigator.clipboard.writeText(text)
    if (includeCredentials && payload.exportKey) {
      window.alert('已复制加密服务器列表。JSON 中包含 exportKey，导入到其他电脑后可以恢复密码或 SSH Key。请只把这份文件交给可信的人。')
    }
  }

  const importHostsFromClipboard = async () => {
    const text = window.prompt('粘贴服务器列表 JSON')
    if (!text) {
      return
    }
    let payload: HostsImportRequest
    try {
      const parsed = JSON.parse(text) as Partial<HostsExportResponse & HostsImportRequest>
      payload = {
        hosts: (parsed.hosts ?? []) as HostsImportRequest['hosts'],
        encrypted: parsed.encrypted,
        exportKey: parsed.exportKey,
        groups: parsed.groups,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '服务器列表 JSON 解析失败'
      setErrorMessage(message)
      return
    }
    await importHosts(payload)
  }

  const importHosts = async (payload: HostsImportRequest) => {
    const response = await apiFetch('/hosts/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const detail = await response.text()
      setErrorMessage(`导入失败：${detail.trim() || response.status}`)
      return
    }

    await loadHosts()
    await loadHostGroups()
  }

  const exportSoftwareConfig = async () => {
    const config = {
      settings: normalizeAppSettings(settings),
      leftRailWidth,
      hostGroups,
      favoriteCommands: normalizeFavoriteCommands(favoriteCommands),
      exportedAt: new Date().toISOString(),
      version: 1,
    }
    await navigator.clipboard.writeText(JSON.stringify(config, null, 2))
  }

  const importSoftwareConfig = async () => {
    const text = window.prompt('粘贴软件配置 JSON')
    if (!text) {
      return
    }
    try {
      const parsed = JSON.parse(text) as { settings?: Partial<AppSettings>; leftRailWidth?: number; favoriteCommands?: unknown }
      if (parsed.settings) {
        setSettings((current) => normalizeAppSettings({ ...current, ...parsed.settings }))
      }
      if (typeof parsed.leftRailWidth === 'number') {
        setLeftRailWidth(Math.min(620, Math.max(320, parsed.leftRailWidth)))
      }
      if (Array.isArray((parsed as { hostGroups?: HostGroup[] }).hostGroups)) {
        setHostGroups(normalizeHostGroups((parsed as { hostGroups: HostGroup[] }).hostGroups, hosts))
      }
      if (Array.isArray(parsed.favoriteCommands)) {
        persistFavoriteCommands(parsed.favoriteCommands)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '配置 JSON 解析失败'
      setErrorMessage(message)
    }
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
    sessions.filter((session) => session.hostId === host.id).forEach((session) => closeSessionStream(session.id))
    if (activeSession?.hostId === host.id) {
      setActiveSession('')
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
    setSettingsSavedMessage('')
    setIsSettingsDialogOpen(true)
  }

  const openGroupDialog = () => {
    setOpenTopMenu('')
    const groups = normalizeHostGroups(hostGroups, hosts)
    const names = groups.map((group) => group.name)
    setGroupDrafts(names)
    setOriginalGroupDrafts(names)
    setGroupDialogMessage('')
    setGroupDialogError('')
    setIsGroupDialogOpen(true)
  }

  const saveHostGroups = async () => {
    const payload: HostGroupsUpdateRequest = {
      groups: normalizeHostGroups(
        groupDrafts.map((name, index) => ({
          name,
          previousName: originalGroupDrafts[index],
        })),
      ),
    }
    const response = await apiFetch('/host-groups', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const detail = await response.text()
      setGroupDialogError(detail.trim() || `保存分组失败：${response.status}`)
      return
    }
    const data = (await response.json()) as HostGroupsResponse
    setHostGroups(normalizeHostGroups(data.groups, hosts))
    await loadHosts()
    setOriginalGroupDrafts(payload.groups.map((group) => group.name))
    setGroupDrafts(payload.groups.map((group) => group.name))
    setGroupDialogError('')
    setGroupDialogMessage('分组已保存')
  }

  const saveSettings = () => {
    const normalized = normalizeAppSettings(settings)
    setSettings(normalized)
    sessionSettingsRef.current = normalized
    if (!normalized.aiPredictionEnabled) {
      clearAIPrediction()
    }
    window.localStorage.setItem('ai-ssh-settings', JSON.stringify(normalized))
    setTerminalCaches((current) => {
      const next = Object.fromEntries(
        Object.entries(current).map(([sessionId, cache]) => {
          const trimmed = appendTerminalCache(emptyTerminalCache(), cache.chunks.join(''), normalized.terminalRetainedLines)
          return [sessionId, { ...trimmed, commandDraft: cache.commandDraft }]
        }),
      )
      terminalCachesRef.current = next
      return next
    })
    setSettingsSavedMessage('偏好设置已保存')
    setErrorMessage('')
    appendLog('info', 'ui.settings', 'settings saved', {
      metricsRefreshIntervalSeconds: normalized.metricsRefreshIntervalSeconds,
      metricsHistoryWindowMinutes: normalized.metricsHistoryWindowMinutes,
      metricsCompactPointLimit: normalized.metricsCompactPointLimit,
      metricsExpandedPointLimit: normalized.metricsExpandedPointLimit,
      terminalRetainedLines: normalized.terminalRetainedLines,
      aiPredictionEnabled: normalized.aiPredictionEnabled,
      aiPredictionCount: normalized.aiPredictionCount,
      aiTerminalContextLimit: normalized.aiTerminalContextLimit,
      aiCommandHistoryLimit: normalized.aiCommandHistoryLimit,
    })
    window.setTimeout(() => setSettingsSavedMessage(''), 2200)
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
      setTrackedFilePath(data.path)
      setFileEntries(data.entries)
    } catch (error) {
      const message = error instanceof Error ? error.message : '文件列表加载失败'
      setFileError(message)
      setErrorMessage(message)
    } finally {
      setIsLoadingFiles(false)
    }
  }

  const refreshFilesFromSessionPath = async () => {
    if (!activeSession || activeSession.hostId === 'local-demo') {
      await loadFiles(filePath)
      return
    }

    if (!trackTerminalPath) {
      await loadFiles(filePath, activeSession.hostId)
      return
    }

    try {
      const response = await apiFetch(`/sessions/${activeSession.id}/cwd`)
      if (response.ok) {
        const data = (await response.json()) as SessionCwdResponse
        if (data.path) {
          await loadFiles(data.path, activeSession.hostId)
          return
        }
      }
    } catch {
      // SSE 路径事件已经是主通道，这里只是切换文件页时的兜底刷新。
    }

    await loadFiles(filePath, activeSession.hostId)
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
      const savedWithPicker = await saveBlobWithFilePicker(blob, entry.name)
      if (!savedWithPicker) {
        downloadBlobInBrowser(blob, entry.name)
      }
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

  const openFilePreview = async (entry: FileEntry) => {
    const session = activeSession
    const hostId = session?.hostId ?? selectedHostId
    if (!hostId || entry.type !== 'file') {
      return
    }

    const kind = detectPreviewKind(entry)
    if (entry.size > FILE_PREVIEW_CONFIRM_BYTES) {
      const confirmed = window.confirm(`文件 ${entry.name} 大小为 ${formatBytes(entry.size)}，确定要打开预览吗？`)
      if (!confirmed) {
        return
      }
    }

    const tabID = `${hostId}:${entry.path}`
    const existing = filePreviewTabsRef.current.find((tab) => tab.id === tabID)
    if (existing) {
      setActiveViewId(`file:${tabID}`)
      return
    }

    const baseTab: FilePreviewTab = {
      id: tabID,
      sessionId: session?.id ?? '',
      hostId,
      hostName: session?.hostName ?? activeHost?.name ?? hostId,
      name: entry.name,
      path: entry.path,
      size: entry.size,
      modifiedAt: entry.modifiedAt,
      kind,
      status: kind === 'binary' ? 'ready' : 'loading',
    }
    setFilePreviewTabs((current) => [baseTab, ...current])
    setActiveViewId(`file:${tabID}`)

    if (kind === 'binary') {
      return
    }

    try {
      const response = await apiFetch(`/files/${hostId}?download=1&path=${encodeURIComponent(entry.path)}`)
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail.trim() || `文件预览失败：${response.status}`)
      }
      const blob = await response.blob()
      if (kind === 'text') {
        const content = await blob.text()
        setFilePreviewTabs((current) =>
          current.map((tab) => (tab.id === tabID ? { ...tab, status: 'ready', content } : tab)),
        )
        return
      }

      const objectUrl = URL.createObjectURL(new Blob([blob], { type: previewMimeType(entry, kind) }))
      setFilePreviewTabs((current) =>
        current.map((tab) => {
          if (tab.id !== tabID) return tab
          if (tab.objectUrl) {
            URL.revokeObjectURL(tab.objectUrl)
          }
          return { ...tab, status: 'ready', objectUrl }
        }),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '文件预览失败'
      setFilePreviewTabs((current) =>
        current.map((tab) => (tab.id === tabID ? { ...tab, status: 'error', error: message } : tab)),
      )
      setErrorMessage(message)
    }
  }

  const closeFilePreview = (tabID: string) => {
    const currentTabs = filePreviewTabsRef.current
    const closedIndex = currentTabs.findIndex((tab) => tab.id === tabID)
    const closed = currentTabs[closedIndex]
    if (closed?.objectUrl) {
      URL.revokeObjectURL(closed.objectUrl)
    }
    const nextTabs = currentTabs.filter((tab) => tab.id !== tabID)
    setFilePreviewTabs(nextTabs)
    if (activeViewId === `file:${tabID}`) {
      const nextFileTab = nextTabs[Math.max(0, closedIndex - 1)] ?? nextTabs[0]
      if (nextFileTab) {
        setActiveViewId(`file:${nextFileTab.id}`)
      } else if (activeSessionId) {
        setActiveViewId(`session:${activeSessionId}`)
      } else {
        setActiveViewId('')
      }
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
      setMetricHistory([])
      previousMetricsRef.current = null
      return
    }
    const response = await apiFetch(`/metrics/${hostId}`)
    if (!response.ok) {
      const detail = await response.text()
      appendLog('warn', 'ui.metrics', 'metrics load failed', {
        hostID: hostId,
        status: response.status,
        detail: detail.trim(),
      })
      return
    }
    const metrics = (await response.json()) as ServerMetrics
    const previousMetrics = previousMetricsRef.current
    const previousTime = previousMetrics ? Date.parse(previousMetrics.collectedAt) : 0
    const currentTime = Date.parse(metrics.collectedAt)
    const elapsedSeconds = previousTime > 0 ? Math.max(1, (currentTime - previousTime) / 1000) : 1
    const sample: MetricSample = {
      ...metrics,
      networkRxRateBytes: previousMetrics
        ? Math.max(0, (metrics.networkRxBytes - previousMetrics.networkRxBytes) / elapsedSeconds)
        : 0,
      networkTxRateBytes: previousMetrics
        ? Math.max(0, (metrics.networkTxBytes - previousMetrics.networkTxBytes) / elapsedSeconds)
        : 0,
    }
    const historyWindowMs = Math.max(1, settings.metricsHistoryWindowMinutes) * 60 * 1000
    setServerMetrics(metrics)
    setMetricHistory((current) => {
      const next = [...current, sample]
      const cutoff = currentTime - historyWindowMs
      return next.filter((item) => Date.parse(item.collectedAt) >= cutoff).slice(-240)
    })
    previousMetricsRef.current = metrics
  }

  const recordCommand = (command: string) => {
    const normalized = stripTerminalControlSequences(command).trim()
    if (!shouldRecordCommand(normalized)) {
      return
    }

    const inferredPath = inferRemotePathFromCommand(normalized, filePathRef.current)
    if (inferredPath && trackTerminalPathRef.current && activeSession && activeSession.hostId !== 'local-demo') {
      setTrackedFilePath(inferredPath)
      if (leftModeRef.current === 'files') {
        void loadFiles(inferredPath, activeSession.hostId)
      }
    }

    const nextHistory = [normalized, ...commandHistoryRef.current].slice(0, 200)
    commandHistoryRef.current = nextHistory
    setCommandHistory(nextHistory)
    if (sessionSettingsRef.current.aiPredictionEnabled && aiEnabledRef.current) {
      pendingAIPredictionCommandRef.current = normalized
      setAiPredictionState('loading')
      setAiPredictionError('')
      scheduleAIPrediction(nextHistory)
    }
  }

  const scheduleAIPrediction = (history = commandHistoryRef.current, delayMs = 900) => {
    window.clearTimeout(pendingAIPredictionTimerRef.current)
    pendingAIPredictionTimerRef.current = window.setTimeout(() => {
      pendingAIPredictionTimerRef.current = undefined
      void requestAIPredictions(history)
    }, delayMs)
  }

  useEffect(() => () => window.clearTimeout(pendingAIPredictionTimerRef.current), [])

  const requestAIPredictions = async (history = commandHistoryRef.current) => {
    const normalized = normalizeAppSettings(sessionSettingsRef.current)
    const session = sessionsRef.current.find((item) => item.id === activeSessionIdRef.current)
    const host = hostsRef.current.find((item) => item.id === session?.hostId)
    if (!aiEnabledRef.current || !normalized.aiPredictionEnabled || !session || !host) {
      clearAIPrediction()
      return
    }
    if (!normalized.aiBaseUrl.trim() || !normalized.aiModel.trim()) {
      setAiPredictions([])
      setAiPredictionState('error')
      setAiPredictionError('请先在设置中填写大模型地址和模型')
      return
    }

    const requestID = aiPredictionRequestRef.current + 1
    aiPredictionRequestRef.current = requestID
    setAiPredictionState('loading')
    setAiPredictionError('')

    const payload: AIPredictionRequest = {
      baseUrl: normalized.aiBaseUrl,
      apiKey: normalized.aiApiKey,
      model: normalized.aiModel,
      predictionCount: normalized.aiPredictionCount,
      terminalContext: terminalContextTail(terminalCachesRef.current[session.id], normalized.aiTerminalContextLimit),
      commandHistory: history.slice(0, normalized.aiCommandHistoryLimit),
      currentCommand: commandBufferRef.current,
      hostName: session.hostName,
      hostAddress: host.address,
      username: host.username,
    }

    try {
      const response = await apiFetch('/ai/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error((await response.text()).trim() || `AI 预测失败：${response.status}`)
      }
      const data = (await response.json()) as AIPredictionResponse
      if (aiPredictionRequestRef.current !== requestID) {
        return
      }
      setAiPredictions(data.commands.slice(0, normalized.aiPredictionCount))
      aiPredictionCursorRef.current = 0
      aiPredictionCycleStartedRef.current = false
      setAiPredictionIndex(0)
      setAiPredictionState('success')
      setAiPredictionError('')
      pendingAIPredictionCommandRef.current = ''
      schedulePredictionGhostPositionUpdate()
    } catch (error) {
      if (aiPredictionRequestRef.current !== requestID) {
        return
      }
      setAiPredictions([])
      setAiPredictionState('error')
      setAiPredictionError(error instanceof Error ? error.message : 'AI 预测失败')
      pendingAIPredictionCommandRef.current = ''
      appendLog('warn', 'ui.ai', 'prediction failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const updateAlternateScreenMode = (sessionId: string, data: string) => {
    const pattern = /\x1b\[\?(?:47|1047|1049)([hl])/g
    let match: RegExpExecArray | null
    while ((match = pattern.exec(data)) !== null) {
      if (match[1] === 'h') {
        alternateScreenSessionsRef.current.add(sessionId)
        if (activeSessionIdRef.current === sessionId) {
          commandBufferRef.current = ''
        }
        setSessionCommandDraft(sessionId, '')
      } else {
        alternateScreenSessionsRef.current.delete(sessionId)
      }
    }
  }

  const setCommandDraft = (sessionId: string, draft: string) => {
    commandBufferRef.current = draft
    setSessionCommandDraft(sessionId, draft)
  }

  const observeTerminalInput = (sessionId: string, data: string) => {
    if (alternateScreenSessionsRef.current.has(sessionId)) {
      return
    }

    let next = commandBufferRef.current
    for (let index = 0; index < data.length; index += 1) {
      const char = data[index]
      const code = char.charCodeAt(0)
      if (char === '\r' || char === '\n') {
        next = ''
        continue
      }
      if (char === '\u007f' || char === '\b') {
        next = next.slice(0, -1)
        continue
      }
      if (char === '\u0003' || char === '\u0015') {
        next = ''
        continue
      }
      if (char === '\u0017') {
        next = next.replace(/\s*\S+\s*$/, '')
        continue
      }
      if (char === '\u0001' || char === '\u0005' || char === '\t') {
        continue
      }
      if (char === '\u001b') {
        const sequence = data.slice(index).match(/^\u001b(?:\[[0-9;?]*[ -/]*[@-~]|O.)/)
        if (sequence) {
          index += sequence[0].length - 1
        }
        continue
      }
      if (code >= 32) {
        next += char
      }
    }
    setCommandDraft(sessionId, next)
  }

  const cyclePrediction = () => {
    if (commandBufferRef.current.trim() || aiPredictions.length === 0) {
      return
    }
    const nextIndex = aiPredictionCycleStartedRef.current
      ? (aiPredictionCursorRef.current + 1) % aiPredictions.length
      : 0
    aiPredictionCycleStartedRef.current = true
    aiPredictionCursorRef.current = nextIndex
    setAiPredictionIndex(nextIndex)
    schedulePredictionGhostPositionUpdate()
  }

  useEffect(() => {
    if (!activeSession || !xtermRef.current) {
      return
    }

    const disposable = xtermRef.current.onData((data) => {
      if (activeSession.status !== 'connected') {
        if (activeSession.status === 'error' || activeSession.status === 'closed') {
          setErrorMessage('当前 SSH 会话已断开，请点击重连后继续输入')
        }
        return
      }
      if (data === '\t' && aiPredictions.length > 0 && !commandBufferRef.current.trim()) {
        cyclePrediction()
        return
      }
      const isEnter = data === '\r' || data === '\n' || data === '\r\n'
      if (isEnter && primaryPrediction && !commandBufferRef.current.trim()) {
        const command = primaryPrediction
        writeCommand(command)
        setCommandDraft(activeSession.id, '')
        setAiPredictions([])
        setAiPredictionIndex(0)
        aiPredictionCursorRef.current = 0
        aiPredictionCycleStartedRef.current = false
        queueSessionInput(activeSession.id, '\r')
        return
      }
      if (!isEnter) {
        clearAIPrediction()
      }
      observeTerminalInput(activeSession.id, data)
      queueSessionInput(activeSession.id, data)
    })

    return () => {
      disposable.dispose()
    }
  }, [activeSession, activeSession?.status, primaryPrediction, aiPredictions, aiPredictionIndex, settings.aiPredictionEnabled, aiEnabled])

  useEffect(() => {
    if (leftMode === 'files') {
      void refreshFilesFromSessionPath()
    }
  }, [leftMode, activeSessionId, trackTerminalPath])

  useEffect(() => {
    if (primaryPrediction && activeSession && !isFilePreviewActive) {
      predictionGhostVisibleRef.current = true
      schedulePredictionGhostPositionUpdate()
    } else {
      predictionGhostVisibleRef.current = false
      setPredictionGhostPosition(null)
    }
  }, [primaryPrediction, activeSession?.id, isFilePreviewActive])

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
  }, [activeSession?.hostId, settings.metricsRefreshIntervalSeconds, settings.metricsHistoryWindowMinutes])

  const openSessionStream = (session: SessionRecord, markConnecting = false) => {
    if (eventSourcesRef.current[session.id]) {
      return
    }
    if (markConnecting) {
      setSessions((current) =>
        current.map((item) => (item.id === session.id ? { ...item, status: 'connecting' } : item)),
      )
    }

    const streamUrl = resolveApiStreamUrl(`/sessions/${session.id}/events`)
    appendLog('debug', 'ui.sse', 'session stream connecting', { sessionID: session.id, url: streamUrl })
    const source = new EventSource(streamUrl)
    eventSourcesRef.current[session.id] = source

    source.onopen = () => {
      appendLog('debug', 'ui.sse', 'session stream opened', { sessionID: session.id })
    }

    source.onerror = () => {
      if (eventSourcesRef.current[session.id] !== source) {
        return
      }
      const messageText = '会话输出流已断开，请重连当前 SSH 会话'
      appendLog('error', 'ui.sse', messageText, { sessionID: session.id, url: streamUrl })
      source.close()
      delete eventSourcesRef.current[session.id]
      markSessionDisconnected(session.id, messageText)
    }

    source.addEventListener('terminal', (event) => {
      const message = event as MessageEvent<string>
      const payload = JSON.parse(message.data) as TerminalEvent

      if (payload.type === 'output') {
        updateAlternateScreenMode(session.id, payload.data ?? '')
        appendSessionTerminalOutput(session.id, payload.data ?? '')
      }

      if (payload.type === 'status') {
        const nextStatus: SessionRecord['status'] | '' =
          payload.data === 'connected' ? 'connected' : payload.data === 'closed' ? 'closed' : ''
        if (nextStatus) {
          const nextSessions = sessionsRef.current.map((item) =>
            item.id === session.id ? { ...item, status: nextStatus } : item,
          )
          sessionsRef.current = nextSessions
          setSessions(nextSessions)
        }
      }

      if (payload.type === 'cwd' && payload.data && trackTerminalPathRef.current) {
        if (leftModeRef.current === 'files') {
          void loadFiles(payload.data, session.hostId)
        } else {
          setTrackedFilePath(payload.data)
        }
      }

      if (payload.type === 'command' && payload.data) {
        recordCommand(payload.data)
      }

      if (payload.type === 'error') {
        const messageText = payload.data ?? '会话发生错误'
        setErrorMessage(messageText)
        const nextSessions = sessionsRef.current.map((item) =>
          item.id === session.id ? { ...item, status: 'error' as const, lastError: messageText } : item,
        )
        sessionsRef.current = nextSessions
        setSessions(nextSessions)
        appendSessionTerminalOutput(session.id, `\r\nERROR: ${messageText}\r\n`)
      }
    })

    source.addEventListener('close', () => {
      source.close()
      if (eventSourcesRef.current[session.id] === source) {
        delete eventSourcesRef.current[session.id]
      }
      appendLog('debug', 'ui.sse', 'session stream closed', { sessionID: session.id })
      const latestSession = sessionsRef.current.find((item) => item.id === session.id)
      if (latestSession?.status === 'connected' || latestSession?.status === 'connecting') {
        markSessionDisconnected(session.id, '会话输出流已关闭，请重连当前 SSH 会话')
      }
    })
  }

  const activateSession = (session: SessionRecord) => {
    if (session.id === activeSessionId) {
      return
    }

    clearAIPrediction()
    setActiveSession(session.id)
    replaceTerminalWithCache(session.id)
    if (session.status === 'connected' || session.status === 'connecting') {
      openSessionStream(session)
    }
    fitAddonRef.current?.fit()
    syncTerminalSize(session.id)
    schedulePredictionGhostPositionUpdate()
  }

  const createSession = async (hostId = selectedHostId) => {
    if (!hostId) {
      return
    }

    commandBufferRef.current = ''
    clearAIPrediction()
    setSelectedHostId(hostId)
    xtermRef.current?.clear()

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
      const initialOutput = `正在为主机 ${hostId} 创建会话...\r\n\r\nSession: ${data.session.id}\r\nHost: ${data.session.hostName}\r\n正在连接会话输出流...\r\n`
      setTerminalCaches((current) => {
        const next = {
          ...current,
          [data.session.id]: appendTerminalCache(emptyTerminalCache(), initialOutput, sessionSettingsRef.current.terminalRetainedLines),
        }
        terminalCachesRef.current = next
        return next
      })
      setSessions((current) => [data.session, ...current])
      setActiveSession(data.session.id)
      xtermRef.current?.clear()
      xtermRef.current?.write(initialOutput)
      openSessionStream(data.session, true)
      fitAddonRef.current?.fit()
      syncTerminalSize(data.session.id)
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

    closeSessionStream(session.id)
    await apiFetch(`/sessions/${session.id}/close`, { method: 'POST' })
    const remainingSessions = sessions.filter((item) => item.id !== session.id)
    setSessions(remainingSessions)
    removeTerminalCache(session.id)
    if (activeSessionId === session.id) {
      const next = remainingSessions[0]
      setActiveSession(next?.id ?? '')
      if (next) {
        replaceTerminalWithCache(next.id)
        if (next.status === 'connected' || next.status === 'connecting') {
          openSessionStream(next)
        }
        fitAddonRef.current?.fit()
        syncTerminalSize(next.id)
      } else {
        commandBufferRef.current = ''
        clearAIPrediction()
        setServerMetrics(null)
        setMetricHistory([])
        previousMetricsRef.current = null
        setFileEntries([])
        xtermRef.current?.clear()
      }
    }
  }

  const reconnectSession = async (session: SessionRecord) => {
    closeSessionStream(session.id)
    const reconnectOutput = `\r\n正在重新连接 ${session.hostName}...\r\n`
    const previousCache = appendTerminalCache(
      terminalCachesRef.current[session.id] ?? emptyTerminalCache(),
      reconnectOutput,
      sessionSettingsRef.current.terminalRetainedLines,
    )
    setTerminalCaches((current) => {
      const next = { ...current, [session.id]: previousCache }
      terminalCachesRef.current = next
      return next
    })
    const connectingSessions = sessionsRef.current.map((item) =>
      item.id === session.id ? { ...item, status: 'connecting' as const, lastError: '' } : item,
    )
    sessionsRef.current = connectingSessions
    setSessions(connectingSessions)

    try {
      let response = await apiFetch(`/sessions/${session.id}/reconnect`, {
        method: 'POST',
      })
      if (response.status === 404) {
        appendLog('warn', 'ui.session', 'session missing in core, creating replacement session', {
          sessionID: session.id,
          hostID: session.hostId,
        })
        response = await apiFetch('/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ hostId: session.hostId } satisfies SessionOpenRequest),
        })
      }
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail.trim() || `重连失败：${response.status}`)
      }

      const data = (await response.json()) as SessionReconnectResponse | SessionOpenResponse
      const nextSession = data.session
      const connectedOutput = `Session: ${nextSession.id}\r\n正在连接会话输出流...\r\n`
      const nextCache = appendTerminalCache(
        terminalCachesRef.current[session.id] ?? previousCache,
        connectedOutput,
        sessionSettingsRef.current.terminalRetainedLines,
      )
      setTerminalCaches((current) => {
        const next = { ...current }
        delete next[session.id]
        next[nextSession.id] = nextCache
        terminalCachesRef.current = next
        return next
      })
      const nextSessions = sessionsRef.current.map((item) => (item.id === session.id ? nextSession : item))
      sessionsRef.current = nextSessions
      setSessions(nextSessions)
      setActiveSession(nextSession.id)
      commandBufferRef.current = nextCache.commandDraft
      replaceTerminalWithCache(nextSession.id)
      openSessionStream(nextSession, true)
      fitAddonRef.current?.fit()
      syncTerminalSize(nextSession.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : '重连失败'
      setErrorMessage(message)
      appendSessionTerminalOutput(session.id, `\r\nERROR: ${message}\r\n`)
      const nextSessions = sessionsRef.current.map((item) =>
        item.id === session.id ? { ...item, status: 'error' as const, lastError: message } : item,
      )
      sessionsRef.current = nextSessions
      setSessions(nextSessions)
    }
  }

  const writeCommand = (command: string) => {
    xtermRef.current?.focus()
    if (activeSession) {
      if (activeSession.status !== 'connected') {
        setErrorMessage('当前 SSH 会话已断开，请点击重连后继续输入')
        return
      }
      const next = commandBufferRef.current + command
      commandBufferRef.current = next
      setSessionCommandDraft(activeSession.id, next)
      queueSessionInput(activeSession.id, command)
    }
  }

  const applyPrediction = () => {
    if (!primaryPrediction) {
      return
    }
    writeCommand(primaryPrediction)
    clearAIPrediction()
  }

  const renderFilePreview = (tab: FilePreviewTab) => {
    const meta = `${tab.hostName} · ${tab.path} · ${formatBytes(tab.size)}`
    if (tab.status === 'loading') {
      return (
        <div className="file-preview-empty">
          <span className="file-loading-spinner" />
          <strong>正在加载 {tab.name}</strong>
          <small>{meta}</small>
        </div>
      )
    }
    if (tab.status === 'error') {
      return (
        <div className="file-preview-empty">
          <strong>预览失败</strong>
          <small>{tab.error ?? '无法读取远程文件'}</small>
          <button type="button" title={`下载 ${tab.name}`} onClick={() => void downloadFile({
            name: tab.name,
            path: tab.path,
            type: 'file',
            size: tab.size,
            modifiedAt: tab.modifiedAt,
          })}>
            下载文件
          </button>
        </div>
      )
    }
    if (tab.kind === 'text') {
      return (
        <div className="file-text-preview">
          <pre>{tab.content ?? ''}</pre>
        </div>
      )
    }
    if (tab.kind === 'image' && tab.objectUrl) {
      return (
        <div className="file-media-preview">
          <img alt={tab.name} src={tab.objectUrl} />
        </div>
      )
    }
    if (tab.kind === 'video' && tab.objectUrl) {
      return (
        <div className="file-media-preview">
          <video controls src={tab.objectUrl} />
        </div>
      )
    }
    return (
      <div className="file-preview-empty">
        <strong>暂不支持直接预览这种文件</strong>
        <small>{meta}</small>
        <button type="button" title={`下载 ${tab.name}`} onClick={() => void downloadFile({
          name: tab.name,
          path: tab.path,
          type: 'file',
          size: tab.size,
          modifiedAt: tab.modifiedAt,
        })}>
          下载文件
        </button>
      </div>
    )
  }

  const startLeftRailResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = leftRailWidth

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setLeftRailWidth(Math.min(620, Math.max(320, startWidth + moveEvent.clientX - startX)))
    }

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const renderMetricChart = (key: MetricChartKey, label: string, compact = true) => {
    const width = compact ? 220 : 760
    const height = compact ? 74 : 260
    const chartWidth = width - 48
    const chartHeight = height - 28
    const path = buildMetricPath(metricHistory, key, chartWidth, chartHeight)
    const [startLabel, endLabel] = metricXAxisLabels(metricHistory)
    const latestValue = metricHistory[metricHistory.length - 1]?.[key] ?? serverMetrics?.[key] ?? 0
    const visiblePointIndexes = metricPointIndexes(
      metricHistory.length,
      compact ? settings.metricsCompactPointLimit : settings.metricsExpandedPointLimit,
    )
    const hoveredSample =
      metricHover?.key === key && metricHistory[metricHover.index] ? metricHistory[metricHover.index] : null
    const chartTitle = key === 'memoryPercent' ? formatMemorySummary(serverMetrics) : serverMetrics ? `${latestValue}%` : '-'
    const updateMetricHover = (event: React.MouseEvent<SVGRectElement>) => {
      if (metricHistory.length === 0) {
        return
      }
      const bounds = event.currentTarget.getBoundingClientRect()
      const relativeX = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left))
      const index =
        metricHistory.length === 1 ? 0 : Math.round((relativeX / Math.max(1, bounds.width)) * (metricHistory.length - 1))
      const sample = metricHistory[index]
      const x = metricHistory.length === 1 ? chartWidth : (index / (metricHistory.length - 1)) * chartWidth
      const y = chartHeight - (Math.max(0, Math.min(100, sample[key])) / 100) * chartHeight
      setMetricHover({ key, index, x, y })
    }

    return (
      <div className={`metric-chart ${compact ? 'compact' : 'expanded'}`} onMouseLeave={() => setMetricHover(null)}>
        <div className="metric-chart-top">
          <span>{label}</span>
          <strong>{chartTitle}</strong>
        </div>
        <div className="metric-plot">
          {compact ? (
            <button
              aria-label={`放大${label}趋势图`}
              className="metric-zoom"
              title={`放大${label}趋势图`}
              type="button"
              onClick={() => setExpandedMetric(key)}
            >
              <span />
            </button>
          ) : null}
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <g transform="translate(36 8)">
              <line className="axis-line" x1="0" x2="0" y1="0" y2={chartHeight} />
              <line className="axis-line" x1="0" x2={chartWidth} y1={chartHeight} y2={chartHeight} />
              {[0, 50, 100].map((value) => {
                const y = chartHeight - (value / 100) * chartHeight
                return (
                  <g key={value}>
                    <line className="grid-line" x1="0" x2={chartWidth} y1={y} y2={y} />
                    <text x="-8" y={y + 3} textAnchor="end">
                      {value}%
                    </text>
                  </g>
                )
              })}
              <rect
                className="metric-hover-zone"
                height={chartHeight}
                width={chartWidth}
                x="0"
                y="0"
                onMouseMove={updateMetricHover}
                onMouseEnter={updateMetricHover}
              />
              {path ? <path className="metric-line" d={path} /> : null}
              {metricHistory.map((sample, index) => {
                const x = metricHistory.length === 1 ? chartWidth : (index / (metricHistory.length - 1)) * chartWidth
                const y = chartHeight - (Math.max(0, Math.min(100, sample[key])) / 100) * chartHeight
                const isHovered = metricHover?.key === key && metricHover.index === index
                if (!visiblePointIndexes.has(index) && !isHovered) {
                  return null
                }
                return (
                  <circle
                    aria-label={`${label} ${formatMetricDateTime(sample.collectedAt)} ${sample[key]}%`}
                    className={`metric-point ${isHovered ? 'active' : ''}`}
                    cx={x}
                    cy={y}
                    key={`${sample.collectedAt}-${index}`}
                    r={isHovered ? 4.5 : 3}
                  >
                    <title>
                      {`${formatMetricDateTime(sample.collectedAt)} · ${label} ${sample[key]}%${
                        key === 'memoryPercent' && sample.memoryTotalBytes > 0
                          ? ` · ${formatBytes(sample.memoryUsedBytes)} / ${formatBytes(sample.memoryTotalBytes)}`
                          : ''
                      }`}
                    </title>
                  </circle>
                )
              })}
              {metricHistory.length === 0 ? (
                <text className="empty-chart-text" x={chartWidth / 2} y={chartHeight / 2} textAnchor="middle">
                  等待采样
                </text>
              ) : null}
            </g>
            <text x="36" y={height - 4}>
              {startLabel}
            </text>
            <text x={width - 2} y={height - 4} textAnchor="end">
              {endLabel}
            </text>
          </svg>
          {hoveredSample ? (
            <div
              className="metric-tooltip"
              style={{
                left: `${36 + metricHover!.x}px`,
                top: `${8 + metricHover!.y}px`,
              }}
            >
              <strong>{`${label} ${hoveredSample[key]}%`}</strong>
              <span>{formatMetricDateTime(hoveredSample.collectedAt)}</span>
              {key === 'memoryPercent' && hoveredSample.memoryTotalBytes > 0 ? (
                <small>
                  {formatBytes(hoveredSample.memoryUsedBytes)} / {formatBytes(hoveredSample.memoryTotalBytes)}
                </small>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  const expandedMetricLabel = expandedMetric === 'cpuPercent' ? 'CPU 使用率' : '内存使用率'

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
                title={`打开${label}菜单`}
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
                      <button type="button" title="新增 SSH 连接" onClick={openAddHostDialog}>新增连接</button>
                      <button type="button" title="导出服务器列表" onClick={() => void exportHosts(false)}>导出服务器列表</button>
                      <button type="button" title="导出服务器列表并包含加密凭据" onClick={() => void exportHosts(true)}>导出服务器列表（含加密凭据）</button>
                      <button type="button" title="导出软件配置" onClick={() => void exportSoftwareConfig()}>导出软件配置</button>
                      <button type="button" title="从剪贴板导入服务器列表" onClick={() => void importHostsFromClipboard()}>导入服务器列表</button>
                      <button type="button" title="从剪贴板导入软件配置" onClick={() => void importSoftwareConfig()}>导入软件配置</button>
                    </>
                  ) : null}
                  {key === 'session' ? (
                    <>
                      <button type="button" title="为当前选中服务器新建会话" onClick={() => void createSession()}>新建会话</button>
                      <button
                        disabled={!activeSession || (activeSession.status !== 'error' && activeSession.status !== 'closed')}
                        title="重连当前会话"
                        type="button"
                        onClick={() => activeSession && void reconnectSession(activeSession)}
                      >
                        重连当前
                      </button>
                      <button type="button" title="管理 SSH 分组" onClick={openGroupDialog}>管理分组</button>
                      <button disabled={!activeSession} title="关闭当前会话" type="button" onClick={() => activeSession && void closeSession(activeSession)}>
                        关闭当前
                      </button>
                    </>
                  ) : null}
                  {key === 'transfer' ? (
                    <>
                      <button type="button" title="上传文件到当前目录" onClick={() => uploadFileRef.current?.click()}>上传文件</button>
                      <button type="button" title="打开远程文件面板" onClick={() => setLeftMode('files')}>打开文件</button>
                    </>
                  ) : null}
                  {key === 'tools' ? <button type="button" title="查看运行日志" onClick={openLogDialog}>日志</button> : null}
                  {key === 'settings' ? <button type="button" title="打开偏好设置" onClick={openSettingsDialog}>偏好设置</button> : null}
                  {key === 'edit' ? <button type="button" title="复制选中内容" disabled>复制</button> : null}
                </div>
              ) : null}
            </div>
          ))}
        </nav>
        <div className="top-actions">
          <span className={`status-dot status-${healthState}`} />
        </div>
      </header>

      <div
        className="workbench-grid"
        style={{
          '--left-rail-width': `${leftRailWidth}px`,
          gridTemplateColumns: `${leftRailWidth}px minmax(560px, 1fr) 340px`,
        } as React.CSSProperties}
      >
        <aside className="left-rail">
          <div className="rail-tabs">
            <button
              className={leftMode === 'servers' ? 'active' : ''}
              title="切换到 SSH 服务器列表"
              type="button"
              onClick={() => setLeftMode('servers')}
            >
              SSH
            </button>
            <button
              className={leftMode === 'files' ? 'active' : ''}
              title="切换到远程文件目录"
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
                  <button type="button" title="新增 SSH 连接" onClick={openAddHostDialog}>+</button>
                  <button type="button" title="管理 SSH 分组" onClick={openGroupDialog}>分组</button>
                  <button type="button" title="导出服务器列表" onClick={() => void exportHosts(false)}>⇅</button>
                </div>
              </div>

              <div className="server-groups">
                {groupedHosts.map((group) => (
                  <section className="server-group" key={group.name}>
                    <p>{group.name}<span>{group.hosts.length}</span></p>
                    {group.hosts.length === 0 ? <small className="empty-group-text">空分组</small> : null}
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
                          title={`${host.name} 更多操作`}
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
                            <button type="button" title="编辑服务器配置" onClick={() => openEditHostDialog(host)}>编辑</button>
                            <button type="button" title="连接此服务器" onClick={() => void createSession(host.id)}>连接</button>
                            <button type="button" title="复制一份服务器配置" onClick={() => void duplicateHost(host)}>复制配置</button>
                            <button className="danger-item" type="button" title="删除此服务器" onClick={() => void deleteHost(host)}>
                              删除
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </div>
          ) : (
            <div className="left-content">
              <div className="panel-toolbar">
                <strong>远程文件</strong>
                <div>
                  <button type="button" title="进入上级目录" onClick={() => void loadFiles(parentPath(filePath))}>上级</button>
                  <button type="button" title="上传文件到当前目录" onClick={() => uploadFileRef.current?.click()}>上传</button>
                </div>
              </div>
              <form
                className="file-path-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void loadFiles(filePathDraft.trim() || '.')
                }}
              >
                <input
                  aria-label="远程路径"
                  value={filePathDraft}
                  onChange={(event) => setFilePathDraft(event.target.value)}
                />
                <button type="submit" title="进入输入的远程路径">进入</button>
              </form>
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
                className={`file-browser ${fileError ? 'has-status' : ''}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  if (event.dataTransfer.files.length > 0) {
                    void uploadFiles(event.dataTransfer.files)
                  }
                }}
              >
                <div className="file-path-row">
                  <span className="file-path-text">{filePath}</span>
                  <div className="file-path-actions">
                    {isLoadingFiles ? (
                      <span className="file-loading-spinner" role="status" aria-label="远程文件加载中" title="远程文件加载中" />
                    ) : null}
                    <button type="button" title="刷新当前目录" onClick={() => void loadFiles(filePath)}>
                      刷新
                    </button>
                  </div>
                </div>
                {fileError ? (
                  <div className="file-browser-status">
                    <p className="error-text">{fileError}</p>
                  </div>
                ) : null}
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
                      title={entry.type === 'directory' ? '双击进入目录' : '单击打开预览，右键下载文件'}
                      onClick={() => {
                        if (entry.type === 'file') {
                          void openFilePreview(entry)
                        }
                      }}
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
                          void openFilePreview(entry)
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
              </div>
              {transferTasks.length > 0 ? (
                <div className="transfer-dock">
                  <strong>传输任务</strong>
                  <div className="transfer-list">
                    {transferTasks.slice(0, 4).map((task) => (
                      <div key={task.id}>
                        <button
                          className="transfer-close"
                          type="button"
                          title={`移除 ${task.name} 传输记录`}
                          onClick={() => setTransferTasks((current) => current.filter((item) => item.id !== task.id))}
                        >
                          ×
                        </button>
                        <span>{task.direction === 'upload' ? '上传' : '下载'} · {task.name}</span>
                        <progress max="100" value={task.progress} />
                        <small>{task.status}</small>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </aside>
        <div
          aria-label="调整左侧宽度"
          className="rail-resizer"
          role="separator"
          tabIndex={0}
          onPointerDown={startLeftRailResize}
        />

        <main className="center-workspace">
          <div className="session-tabs">
            {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`session-tab ${activeViewId === `session:${session.id}` ? 'active' : ''}`}
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
                    title={`关闭 ${session.hostName}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      void closeSession(session)
                    }}
                  >
                    x
                  </button>
                </div>
              ))}
            {filePreviewTabs.map((tab) => (
              <div
                key={tab.id}
                className={`session-tab file-preview-tab ${activeViewId === `file:${tab.id}` ? 'active' : ''}`}
                onClick={() => setActiveViewId(`file:${tab.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setActiveViewId(`file:${tab.id}`)
                  }
                }}
              >
                <span className={`tab-status tab-status-${tab.status === 'error' ? 'error' : tab.status === 'loading' ? 'connecting' : 'connected'}`} title={previewKindLabel(tab.kind)} />
                <span className="tab-title">{tab.name}</span>
                <button
                  className="tab-close"
                  type="button"
                  aria-label={`关闭 ${tab.name}`}
                  title={`关闭 ${tab.name}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    closeFilePreview(tab.id)
                  }}
                >
                  x
                </button>
              </div>
            ))}
            <button className="session-new" type="button" title="新建 SSH 会话" onClick={() => void createSession()}>
              +
            </button>
          </div>

          <section className={`terminal-stage ${isFilePreviewActive ? 'show-file-preview' : ''}`}>
            {activeFilePreview ? (
              <div className="file-preview-header">
                <div>
                  <strong>{activeFilePreview.name}</strong>
                  <span>{activeFilePreview.path}</span>
                </div>
                <small>{previewKindLabel(activeFilePreview.kind)} · {formatBytes(activeFilePreview.size)} · {new Date(activeFilePreview.modifiedAt).toLocaleString()}</small>
                <button
                  className="terminal-reconnect"
                  type="button"
                  title={`下载 ${activeFilePreview.name}`}
                  onClick={() => void downloadFile({
                    name: activeFilePreview.name,
                    path: activeFilePreview.path,
                    type: 'file',
                    size: activeFilePreview.size,
                    modifiedAt: activeFilePreview.modifiedAt,
                  })}
                >
                  下载
                </button>
              </div>
            ) : activeSession ? (
              <div className="terminal-header">
                <div>
                  <strong>{activeSession.hostName}</strong>
                  <span>
                    {activeHost
                      ? `${activeHost.username}@${activeHost.address}:${activeHost.port}`
                      : activeSession.hostId}
                  </span>
                </div>
                <span className={`session-pill session-${activeSession.status}`}>
                  {sessionStatusLabel(activeSession.status)}
                </span>
                {activeSession.status === 'error' || activeSession.status === 'closed' ? (
                  <button className="terminal-reconnect" type="button" title="重连当前 SSH 会话" onClick={() => void reconnectSession(activeSession)}>
                    重连
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className={`terminal-wrap ${isFilePreviewActive ? 'terminal-hidden' : ''}`}>
              <div ref={terminalRef} className="terminal-surface" />
              {activeSession && primaryPrediction && predictionGhostPosition ? (
                <button
                  className="terminal-ghost-prediction"
                  style={{
                    left: predictionGhostPosition.left,
                    top: predictionGhostPosition.top,
                    maxWidth: predictionGhostPosition.maxWidth,
                    height: predictionGhostPosition.height,
                  }}
                  type="button"
                  title="应用 AI 预测命令"
                  onClick={applyPrediction}
                >
                  {primaryPrediction}
                </button>
              ) : null}
            </div>
            {activeFilePreview ? (
              <div className="file-preview-surface">
                {renderFilePreview(activeFilePreview)}
              </div>
            ) : null}
            {!activeSession && !activeFilePreview ? (
              <div className="terminal-empty">
                <div>
                  <p className="section-label">快速连接</p>
                  <h2>选择一个服务器开始 SSH 会话</h2>
                  <span>关闭所有标签后，终端会回到这里。左侧也可以继续新增、导入或管理服务器。</span>
                </div>
                <div className="recent-hosts">
                  {recentHosts.length > 0 ? (
                    recentHosts.map((host) => (
                      <button key={host.id} type="button" title={`连接 ${host.name}`} onClick={() => void createSession(host.id)}>
                        <strong>{host.name}</strong>
                        <span>{host.username}@{host.address}:{host.port}</span>
                      </button>
                    ))
                  ) : (
                    <button type="button" title="新增 SSH 连接" onClick={openAddHostDialog}>
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
          <section className={`info-panel ${isServerInfoCollapsed ? 'collapsed' : ''}`}>
            <div className="info-panel-header">
              <div>
                <p className="section-label">当前服务器</p>
                <h3>{activeSession?.hostName ?? activeHost?.name ?? '未连接'}</h3>
              </div>
              <button
                className="panel-icon-button"
                type="button"
                title={isServerInfoCollapsed ? '展开当前服务器信息' : '折叠当前服务器信息'}
                onClick={() => setIsServerInfoCollapsed((current) => !current)}
              >
                {isServerInfoCollapsed ? '▾' : '▴'}
              </button>
            </div>
            {!isServerInfoCollapsed ? (
              <>
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
                <div className="metric-stack">
                  <div className="metric-card">{renderMetricChart('cpuPercent', 'CPU')}</div>
                  <div className="metric-card">{renderMetricChart('memoryPercent', '内存')}</div>
                  <div className="metric-card">
                    <div>
                      <span>硬盘</span>
                      <strong>{primaryDisk ? `${primaryDisk.mount} ${primaryDisk.usedPercent}%` : serverMetrics ? `${serverMetrics.diskPercent}%` : '-'}</strong>
                    </div>
                    <div className="disk-list">
                      {(serverMetrics?.disks?.length ? serverMetrics.disks : []).slice(0, 4).map((disk) => (
                        <div key={`${disk.filesystem}-${disk.mount}`}>
                          <span>{disk.mount}</span>
                          <progress max="100" value={disk.usedPercent} />
                          <strong>{disk.usedPercent}%</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="metric-card">
                    <div>
                      <span>网络</span>
                      <strong>
                        {latestMetricSample
                          ? `↓ ${formatRate(latestMetricSample.networkRxRateBytes)} / ↑ ${formatRate(latestMetricSample.networkTxRateBytes)}`
                          : '-'}
                      </strong>
                    </div>
                    <small>
                      {serverMetrics
                        ? `累计 ↓ ${formatBytes(serverMetrics.networkRxBytes)} / ↑ ${formatBytes(serverMetrics.networkTxBytes)}`
                        : '等待采样'}
                    </small>
                  </div>
                </div>
              </>
            ) : null}
          </section>

          <section className="tool-panel">
            <div className="tool-tabs">
              <button
                className={rightTool === 'ai' ? 'active' : ''}
                title="切换到 AI 工具"
                type="button"
                onClick={() => setRightTool('ai')}
              >
                AI
              </button>
              <button
                className={rightTool === 'history' ? 'active' : ''}
                title="切换到历史命令"
                type="button"
                onClick={() => setRightTool('history')}
              >
                历史
              </button>
              <button
                className={rightTool === 'favorites' ? 'active' : ''}
                title="切换到收藏命令"
                type="button"
                onClick={() => setRightTool('favorites')}
              >
                收藏
              </button>
            </div>

            {rightTool === 'ai' ? (
              <div className="ai-box">
                <label className="toggle-row">
                  <input
                    checked={aiEnabled}
                    onChange={(event) => {
                      setAiEnabled(event.target.checked)
                      if (!event.target.checked) {
                        clearAIPrediction()
                      }
                    }}
                    type="checkbox"
                  />
                  <span>预测下一步命令</span>
                </label>
                {aiPredictionState === 'loading' ? <p className="hint-text">正在调用大模型预测...</p> : null}
                {!isAIProviderConfigured && aiEnabled && settings.aiPredictionEnabled ? (
                  <p className="hint-text">请先在设置里填写大模型地址和模型，保存后才会调用 AI 预测。</p>
                ) : null}
                {aiPredictionError ? <p className="error-text">{aiPredictionError}</p> : null}
                {aiPredictions.map((command, index) => {
                  const favorited = isFavoriteCommand(command)
                  return (
                    <div
                      className={`command-row prediction-row ${index === aiPredictionIndex ? 'primary' : ''}`}
                      key={command}
                    >
                      <button
                        className="command-main"
                        type="button"
                        title={`切换到第 ${index + 1} 条 AI 预测命令`}
                        onClick={() => {
                          aiPredictionCursorRef.current = index
                          aiPredictionCycleStartedRef.current = true
                          setAiPredictionIndex(index)
                        }}
                      >
                        <strong>{index === aiPredictionIndex ? '当前建议' : `建议 ${index + 1}`}</strong>
                        <code>{command}</code>
                      </button>
                      <button
                        className={`favorite-command-button ${favorited ? 'active' : ''}`}
                        type="button"
                        title={favorited ? `取消收藏：${command}` : `收藏命令：${command}`}
                        onClick={() => toggleFavoriteCommand(command)}
                      >
                        {favorited ? '★' : '☆'}
                      </button>
                    </div>
                  )
                })}
                {aiPredictions.length > 0 ? (
                  <p className="hint-text">空命令行按 Tab 循环切换建议，按回车执行当前建议；输入其他字符会清空建议。</p>
                ) : null}
              </div>
            ) : rightTool === 'history' ? (
              <div className="history-list">
                {commandHistory.length === 0 ? (
                  <p className="hint-text">暂无历史命令</p>
                ) : (
                  commandHistory.map((command, index) => {
                    const favorited = isFavoriteCommand(command)
                    return (
                      <div className="command-row compact" key={`${index}-${command}`}>
                        <button
                          className="command-main"
                          type="button"
                          title={`输入历史命令：${command}`}
                          onClick={() => writeCommand(command)}
                        >
                          {command}
                        </button>
                        <button
                          className={`favorite-command-button ${favorited ? 'active' : ''}`}
                          type="button"
                          title={favorited ? `取消收藏：${command}` : `收藏命令：${command}`}
                          onClick={() => toggleFavoriteCommand(command)}
                        >
                          {favorited ? '★' : '☆'}
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            ) : (
              <div className="favorite-list">
                {favoriteCommands.length === 0 ? (
                  <p className="hint-text">暂无收藏命令</p>
                ) : (
                  favoriteCommands.map((command) => (
                    <div className="command-row compact" key={command}>
                      <button
                        className="command-main"
                        type="button"
                        title={`输入收藏命令：${command}`}
                        onClick={() => writeCommand(command)}
                      >
                        {command}
                      </button>
                      <button
                        className="favorite-command-button danger"
                        type="button"
                        title={`删除收藏命令：${command}`}
                        onClick={() => setPendingFavoriteDelete(command)}
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
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
              <button type="button" title="关闭服务器编辑窗口" onClick={closeAddHostDialog}>×</button>
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
                  list="host-group-options"
                  value={hostForm.group ?? ''}
                  onChange={(event) => setHostForm((current) => ({ ...current, group: event.target.value }))}
                  placeholder="默认"
                />
                <datalist id="host-group-options">
                  {hostGroups.map((group) => (
                    <option key={group.name} value={group.name} />
                  ))}
                </datalist>
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
                      title="选择本地 SSH 私钥文件"
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
              <button disabled={isSavingHost} title="取消保存服务器" type="button" onClick={closeAddHostDialog}>取消</button>
              <button className="primary-button" disabled={isSavingHost} title="保存服务器配置" type="submit">
                {isSavingHost ? '保存中' : hostDialogMode === 'edit' ? '保存修改' : '保存'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isGroupDialogOpen ? (
        <div className="modal-backdrop">
          <section className="group-modal">
            <div className="modal-header">
              <div>
                <p className="section-label">SSH 连接</p>
                <h3>分组管理</h3>
              </div>
              <button type="button" title="关闭分组管理窗口" onClick={() => setIsGroupDialogOpen(false)}>×</button>
            </div>

            {groupDialogError ? <p className="error-text modal-error">{groupDialogError}</p> : null}
            {groupDialogMessage ? <p className="success-text">{groupDialogMessage}</p> : null}

            <div className="group-list-editor">
              {groupDrafts.map((group, index) => {
                const usedCount = hosts.filter((host) => (host.group || '默认') === group.trim()).length
                return (
                  <div className="group-edit-row" key={`${group}-${index}`}>
                    <input
                      value={group}
                      onChange={(event) => {
                        const next = [...groupDrafts]
                        next[index] = event.target.value
                        setGroupDrafts(next)
                        setGroupDialogMessage('')
                      }}
                      placeholder="分组名称"
                    />
                    <span>{usedCount} 台</span>
                    <button
                      disabled={usedCount > 0 || groupDrafts.length <= 1}
                      title={usedCount > 0 ? '该分组正在被服务器使用，不能删除' : '删除空分组'}
                      type="button"
                      onClick={() => {
                        setGroupDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))
                        setOriginalGroupDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))
                        setGroupDialogMessage('')
                      }}
                    >
                      删除
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="modal-actions">
              <button
                title="新增一个 SSH 分组"
                type="button"
                onClick={() => {
                  setGroupDrafts((current) => [...current, '新分组'])
                  setOriginalGroupDrafts((current) => [...current, ''])
                  setGroupDialogMessage('')
                }}
              >
                新增分组
              </button>
              <button className="primary-button" type="button" title="保存 SSH 分组" onClick={() => void saveHostGroups()}>
                保存
              </button>
            </div>
          </section>
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
              <button type="button" title="关闭日志窗口" onClick={() => setIsLogDialogOpen(false)}>×</button>
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
              <button type="button" title="刷新运行日志" onClick={() => void loadLogs()}>刷新</button>
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
              <button type="button" title="关闭偏好设置窗口" onClick={() => setIsSettingsDialogOpen(false)}>×</button>
            </div>

            <div className="settings-layout">
              <nav className="settings-nav">
                {[
                  ['general', '通用'],
                  ['metrics', '服务器指标'],
                  ['ai', 'AI 预测'],
                ].map(([key, label]) => (
                  <button
                    className={settingsSection === key ? 'active' : ''}
                    key={key}
                    type="button"
                    title={`切换到${label}设置`}
                    onClick={() => setSettingsSection(key as SettingsSection)}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              <div className="settings-content">
                {settingsSection === 'general' ? (
                  <label>
                    <span>每个 SSH 标签保留终端行数</span>
                    <input
                      min="100"
                      type="number"
                      value={settings.terminalRetainedLines}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          terminalRetainedLines: Number(event.target.value) || 1000,
                        }))
                      }
                    />
                  </label>
                ) : null}

                {settingsSection === 'metrics' ? (
                  <>
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
                    <label>
                      <span>指标折线时间范围（分钟）</span>
                      <input
                        min="1"
                        type="number"
                        value={settings.metricsHistoryWindowMinutes}
                        onChange={(event) =>
                          setSettings((current) => ({
                            ...current,
                            metricsHistoryWindowMinutes: Number(event.target.value) || 5,
                          }))
                        }
                      />
                    </label>
                    <div className="form-row settings-pair">
                      <label>
                        <span>小图圆点数量</span>
                        <input
                          min="2"
                          max="30"
                          type="number"
                          value={settings.metricsCompactPointLimit}
                          onChange={(event) =>
                            setSettings((current) => ({
                              ...current,
                              metricsCompactPointLimit: Number(event.target.value) || 5,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>放大图圆点数量</span>
                        <input
                          min="2"
                          max="120"
                          type="number"
                          value={settings.metricsExpandedPointLimit}
                          onChange={(event) =>
                            setSettings((current) => ({
                              ...current,
                              metricsExpandedPointLimit: Number(event.target.value) || 20,
                            }))
                          }
                        />
                      </label>
                    </div>
                  </>
                ) : null}

                {settingsSection === 'ai' ? (
                  <>
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
                      <span>预测命令数量</span>
                      <input
                        min="1"
                        max="8"
                        type="number"
                        value={settings.aiPredictionCount}
                        onChange={(event) =>
                          setSettings((current) => ({
                            ...current,
                            aiPredictionCount: Number(event.target.value) || 3,
                          }))
                        }
                      />
                    </label>
                    <div className="form-row settings-pair">
                      <label>
                        <span>终端上下文字符数</span>
                        <input
                          min="500"
                          max="50000"
                          step="500"
                          type="number"
                          value={settings.aiTerminalContextLimit ?? defaultSettings.aiTerminalContextLimit}
                          onChange={(event) =>
                            setSettings((current) => ({
                              ...current,
                              aiTerminalContextLimit: Number(event.target.value) || 5000,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>历史命令条数</span>
                        <input
                          min="1"
                          max="200"
                          type="number"
                          value={settings.aiCommandHistoryLimit ?? defaultSettings.aiCommandHistoryLimit}
                          onChange={(event) =>
                            setSettings((current) => ({
                              ...current,
                              aiCommandHistoryLimit: Number(event.target.value) || 20,
                            }))
                          }
                        />
                      </label>
                    </div>
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
                  </>
                ) : null}
              </div>
            </div>

            {settingsSavedMessage ? <p className="success-text">{settingsSavedMessage}</p> : null}
            <div className="modal-actions">
              <button type="button" title="关闭偏好设置窗口" onClick={() => setIsSettingsDialogOpen(false)}>关闭</button>
              <button className="primary-button" type="button" title="保存偏好设置" onClick={saveSettings}>保存</button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingFavoriteDelete ? (
        <div className="modal-backdrop">
          <section className="confirm-modal">
            <div className="modal-header">
              <div>
                <p className="section-label">收藏命令</p>
                <h3>删除收藏</h3>
              </div>
              <button type="button" title="关闭删除确认" onClick={() => setPendingFavoriteDelete('')}>×</button>
            </div>
            <p className="confirm-copy">确定删除这条收藏命令吗？</p>
            <code className="confirm-command">{pendingFavoriteDelete}</code>
            <div className="modal-actions">
              <button type="button" title="取消删除收藏命令" onClick={() => setPendingFavoriteDelete('')}>取消</button>
              <button className="danger-button" type="button" title="确认删除收藏命令" onClick={() => deleteFavoriteCommand(pendingFavoriteDelete)}>
                删除
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {expandedMetric ? (
        <div className="modal-backdrop">
          <section className="metric-modal">
            <div className="modal-header">
              <div>
                <p className="section-label">当前服务器</p>
                <h3>{expandedMetricLabel}</h3>
              </div>
              <button type="button" title="关闭放大图表" onClick={() => setExpandedMetric('')}>×</button>
            </div>
            {renderMetricChart(expandedMetric, expandedMetricLabel, false)}
          </section>
        </div>
      ) : null}
    </div>
  )
}
