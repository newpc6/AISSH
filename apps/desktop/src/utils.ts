import { StreamLanguage } from '@codemirror/language'
import { json } from '@codemirror/lang-json'
import { javascript } from '@codemirror/lang-javascript'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { sql } from '@codemirror/lang-sql'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import {
  type AIModelConfig,
  type AIModelProvider,
  type AppSettings,
  type FileEntry,
  type HealthResponse,
  type HostGroup,
  type HostRecord,
  type HostUpsertRequest,
  type LogLevel,
  type ServerMetrics,
  type SessionRecord,
  type AIRiskLevel,
  CORE_API_BASE,
  CORE_DEFAULT_PORT,
} from '@ai-ssh/shared-contracts'
import type { AIStreamEvent, DesktopWindow, FilePreviewKind, FileSortKey, FileSortState, LoadState, MetricChartKey, MetricSample, TerminalCache, WindowWithSaveFilePicker } from './types'
import { currentLocaleTag, normalizeAppLanguage } from './i18n'

export const CORE_API_FALLBACK_BASE = `http://127.0.0.1:${CORE_DEFAULT_PORT}/api`
export const AI_PREDICT_STREAM_API_PATH = '/api/ai/predict/stream'
export const AI_ASSIST_STREAM_API_PATH = '/api/ai/assist/stream'
export const MIN_PREDICTION_PANEL_HEIGHT = 160
export const DEFAULT_PREDICTION_PANEL_HEIGHT = 300
export const MAX_PREDICTION_PANEL_HEIGHT = 520
export const MIN_RIGHT_SERVER_INFO_HEIGHT = 88
export const DEFAULT_RIGHT_SERVER_INFO_HEIGHT = 420
export const MAX_RIGHT_SERVER_INFO_HEIGHT = 720
export const MIN_RIGHT_PANEL_WIDTH = 360
export const DEFAULT_RIGHT_PANEL_WIDTH = 440
export const MAX_RIGHT_PANEL_WIDTH = 720
export const DEFAULT_HEALTH_CHECK_INTERVAL_SECONDS = 10
export const REQUIRED_CORE_CAPABILITIES = ['ai-assist', 'ai-agent', 'ai-stream', 'ai-unified', 'ai-chat-history']
export const FILE_PREVIEW_CONFIRM_BYTES = 8 * 1024 * 1024
export const ERROR_DETAIL_LIMIT = 1200
export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434/v1'
export const DEFAULT_AI_SYSTEM_PROMPT =
  '你是 AI SSH 的统一运维助手。你需要根据用户输入、选中文本、终端上下文、历史命令、当前目录和主机信息，自动判断用户是在问答、解释错误、总结日志、生成命令，还是希望你驱动终端完成目标。普通问答直接给出中文答案。需要推进终端任务时，每次返回一条可执行的命令；如果是复杂任务，应该在 agentReason 中说明整体计划，命令执行后会拿到输出和退出码，你再根据结果决定下一步。复杂任务可以分多步推进，比如先查询信息、根据结果再做下一步操作。agentMode=review 时所有命令等待人工执行；agentMode=auto 时低风险命令自动执行、高风险命令等待人工确认；agentMode=full-auto 时所有命令都可自动执行。'

export const textFileExtensions = new Set([
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
export const imageFileExtensions = new Set(['bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp'])
export const videoFileExtensions = new Set(['m4v', 'mov', 'mp4', 'mpeg', 'ogv', 'webm'])

export const logLevelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export const emptyHostForm: HostUpsertRequest = {
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

export const defaultSettings: AppSettings = {
  healthCheckIntervalSeconds: DEFAULT_HEALTH_CHECK_INTERVAL_SECONDS,
  metricsRefreshIntervalSeconds: 2,
  metricsHistoryWindowMinutes: 5,
  metricsCompactPointLimit: 5,
  metricsExpandedPointLimit: 20,
  terminalRetainedLines: 1000,
  rightServerInfoPanelHeight: DEFAULT_RIGHT_SERVER_INFO_HEIGHT,
  rightPanelWidth: DEFAULT_RIGHT_PANEL_WIDTH,
  aiEnabled: true,
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
  aiModels: [],
  activeAIModelId: '',
  activeAIAgentModelId: '',
  activeAIPredictionModelId: '',
  aiPredictionEnabled: true,
  aiPredictionThinkingEnabled: false,
  aiPredictionCount: 3,
  aiPredictionTriggerDelayMs: 1000,
  aiTerminalContextLimit: 5000,
  aiCommandHistoryLimit: 20,
  aiConversationContextLimit: 30,
  aiSystemPrompt: DEFAULT_AI_SYSTEM_PROMPT,
  aiSystemPromptOverride: false,
  aiAgentThinkingEnabled: true,
  aiProviderTimeoutSeconds: 120,
  agentCommandTimeoutSeconds: 120,
}

export function createAIModelId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `ai-model-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function newOpenAICompatibleModelConfig(): AIModelConfig {
  return {
    id: createAIModelId(),
    name: 'OpenAI Compatible',
    provider: 'openai-compatible',
    baseUrl: '',
    apiKey: '',
    model: '',
    thinkingEnabled: true,
  }
}

export function newAnthropicClaudeModelConfig(): AIModelConfig {
  return {
    id: createAIModelId(),
    name: 'Anthropic Claude',
    provider: 'anthropic-claude',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: '',
    model: 'claude-sonnet-4-0',
    thinkingEnabled: true,
  }
}

export function newOllamaModelConfig(): AIModelConfig {
  return {
    id: createAIModelId(),
    name: 'Ollama',
    provider: 'ollama',
    baseUrl: DEFAULT_OLLAMA_BASE_URL,
    apiKey: '',
    model: 'llama3.1',
    thinkingEnabled: true,
  }
}

function normalizeAIModelProvider(value: unknown): AIModelProvider {
  if (value === 'ollama' || value === 'anthropic-claude') return value
  return 'openai-compatible'
}

export function normalizeAIModelConfigs(value: unknown, legacy?: Pick<AppSettings, 'aiBaseUrl' | 'aiApiKey' | 'aiModel'>): AIModelConfig[] {
  const configs = Array.isArray(value) ? value : []
  const normalized = configs
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Record<string, unknown>
      const provider = normalizeAIModelProvider(raw.provider)
      const defaultName = provider === 'ollama'
        ? 'Ollama'
        : provider === 'anthropic-claude'
          ? 'Anthropic Claude'
          : `OpenAI Compatible ${index + 1}`
      const config: AIModelConfig = {
        id: String(raw.id ?? '').trim() || createAIModelId(),
        name: String(raw.name ?? '').trim() || defaultName,
        provider,
        baseUrl: String(raw.baseUrl ?? '').trim(),
        apiKey: String(raw.apiKey ?? ''),
        model: String(raw.model ?? '').trim(),
        thinkingEnabled: raw.thinkingEnabled === undefined ? true : Boolean(raw.thinkingEnabled),
      }
      if (config.provider === 'ollama' && !config.baseUrl) {
        config.baseUrl = DEFAULT_OLLAMA_BASE_URL
      }
      if (config.provider === 'anthropic-claude' && !config.baseUrl) {
        config.baseUrl = 'https://api.anthropic.com/v1'
      }
      return config
    })
    .filter((item): item is AIModelConfig => Boolean(item))

  if (normalized.length === 0 && legacy && (legacy.aiBaseUrl || legacy.aiApiKey || legacy.aiModel)) {
    normalized.push({
      id: createAIModelId(),
      name: 'OpenAI Compatible',
      provider: 'openai-compatible',
      baseUrl: String(legacy.aiBaseUrl ?? '').trim(),
      apiKey: String(legacy.aiApiKey ?? ''),
      model: String(legacy.aiModel ?? '').trim(),
      thinkingEnabled: true,
    })
  }

  return normalized
}

export function getActiveAIModelConfig(settings: AppSettings): AIModelConfig | null {
  return settings.aiModels.find((model) => model.id === settings.activeAIAgentModelId || model.id === settings.activeAIModelId) ?? settings.aiModels[0] ?? null
}

export function getActiveAIPredictionModelConfig(settings: AppSettings): AIModelConfig | null {
  return settings.aiModels.find((model) => model.id === settings.activeAIPredictionModelId || model.id === settings.activeAIModelId) ?? settings.aiModels[0] ?? null
}

export const emptySetupForm = {
  username: 'admin',
  password: '',
  confirmPassword: '',
  desktopLoginRequired: false,
}

export function isTauriDesktopLocation() {
  return window.location.protocol === 'tauri:' || window.location.hostname === 'tauri.localhost'
}

export const isTauriRuntime = (() => {
  const desktopWindow = window as DesktopWindow
  return Boolean(desktopWindow.__TAURI_INTERNALS__ || desktopWindow.__TAURI__ || isTauriDesktopLocation())
})()

export function statusToLabel(state: LoadState) {
  if (state === 'loading') return 'core connecting'
  if (state === 'success') return 'core connected'
  if (state === 'error') return 'core disconnected'
  return 'core checking'
}

export function isLikelyStatic405(response: Response) {
  return response.status === 405 && response.url.startsWith(window.location.origin)
}

export function normalizeApiRequestPath(path: string) {
  const requestPath = path.startsWith('/') ? path : `/${path}`
  return requestPath.startsWith(`${CORE_API_BASE}/`) ? requestPath.slice(CORE_API_BASE.length) : requestPath
}

export function displayApiPath(path: string) {
  const requestPath = path.startsWith('/') ? path : `/${path}`
  return requestPath.startsWith(`${CORE_API_BASE}/`) ? requestPath : `${CORE_API_BASE}${requestPath}`
}

export function missingCoreCapabilities(health: HealthResponse) {
  return REQUIRED_CORE_CAPABILITIES.filter((capability) => !health.capabilities.includes(capability))
}

export function coreCapabilityErrorDetail(missing: string[]) {
  return `当前 18555 端口上的 Go core 缺少 ${missing.join(', ')} 能力，通常表示客户端还在使用旧版 core。请关闭旧的 ai-ssh-core.exe / AI SSH 客户端后，重新运行 npm run dev:tauri 或 npm run dev:core。`
}

export function resolveApiStreamUrl(path: string) {
  const requestPath = normalizeApiRequestPath(path)
  if (isTauriRuntime) return `${CORE_API_FALLBACK_BASE}${requestPath}`
  if (window.location.origin.startsWith('http://127.0.0.1:1420')) return `${CORE_API_BASE}${requestPath}`
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') return `${CORE_API_BASE}${requestPath}`
  return `${CORE_API_FALLBACK_BASE}${requestPath}`
}

export function resolveApiUrl(path: string) {
  const requestPath = normalizeApiRequestPath(path)
  if (isTauriRuntime) return `${CORE_API_FALLBACK_BASE}${requestPath}`
  if (window.location.origin.startsWith('http://127.0.0.1:1420')) return `${CORE_API_BASE}${requestPath}`
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') return `${CORE_API_BASE}${requestPath}`
  return `${CORE_API_FALLBACK_BASE}${requestPath}`
}

export function appendQueryParam(url: string, name: string, value: string) {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${encodeURIComponent(name)}=${encodeURIComponent(value)}`
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export function fileSortLabel(key: FileSortKey) {
  if (key === 'name') return '名称'
  if (key === 'size') return '大小'
  return '修改日期'
}

export function normalizeFileSearchText(value: string) {
  return value.trim().toLocaleLowerCase()
}

export function compareFileEntryValue(a: FileEntry, b: FileEntry, key: FileSortKey) {
  if (key === 'size') return a.size - b.size
  if (key === 'modifiedAt') return Date.parse(a.modifiedAt) - Date.parse(b.modifiedAt)
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}

export function compareFileEntries(a: FileEntry, b: FileEntry, sort: FileSortState) {
  if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
  const value = compareFileEntryValue(a, b, sort.key)
  if (value !== 0) return sort.direction === 'asc' ? value : -value
  return compareFileEntryValue(a, b, 'name')
}

export function formatRate(size: number) {
  return `${formatBytes(Math.max(0, size))}/s`
}

export function resolveLocaleTag(language?: string | null) {
  return currentLocaleTag(language)
}

export function localeFromLanguage(language?: string | null) {
  return normalizeAppLanguage(language)
}

export function formatLocalizedDateTime(
  value: string,
  language?: string | null,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(resolveLocaleTag(language), options)
}

export function formatLocalizedTime(
  value: string,
  language?: string | null,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString(resolveLocaleTag(language), options)
}

export function fileExtension(name: string) {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

export function detectPreviewKind(entry: FileEntry): FilePreviewKind {
  const extension = fileExtension(entry.name)
  if (imageFileExtensions.has(extension)) return 'image'
  if (videoFileExtensions.has(extension)) return 'video'
  if (textFileExtensions.has(extension)) return 'text'
  if (entry.size <= 512 * 1024 && !extension) return 'text'
  return 'binary'
}

export function previewKindLabel(kind: FilePreviewKind) {
  if (kind === 'text') return '文本'
  if (kind === 'image') return '图片'
  if (kind === 'video') return '视频'
  return '文件'
}

export function previewMimeType(entry: Pick<FileEntry, 'name'>, kind: FilePreviewKind) {
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

export function codeMirrorLanguage(name: string) {
  const extension = fileExtension(name)
  if (extension === 'json') return json()
  if (extension === 'js' || extension === 'jsx' || extension === 'ts' || extension === 'tsx') {
    return javascript({ jsx: true, typescript: extension === 'ts' || extension === 'tsx' })
  }
  if (extension === 'css') return css()
  if (extension === 'html') return html()
  if (extension === 'md') return markdown()
  if (extension === 'py') return python()
  if (extension === 'sql') return sql()
  if (extension === 'xml') return xml()
  if (extension === 'yaml' || extension === 'yml') return yaml()
  if (extension === 'sh' || extension === 'bash') return StreamLanguage.define(shell)
  if (extension === 'toml') return StreamLanguage.define(toml)
  if (extension === 'ini' || extension === 'conf' || extension === 'properties' || extension === 'env') {
    return StreamLanguage.define(properties)
  }
  return []
}

export function formatEditableText(name: string, content: string) {
  const extension = fileExtension(name)
  const normalized = content.replace(/\r\n?/g, '\n')
  if (extension === 'json') {
    const formatted = JSON.stringify(JSON.parse(normalized), null, 2)
    return { content: `${formatted}${normalized.endsWith('\n') ? '\n' : ''}`, message: 'JSON 已格式化' }
  }
  return {
    content: normalized
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/g, ''))
      .join('\n'),
    message: '已整理行尾空白',
  }
}

export function formatMetricTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatMetricDateTime(value: string) {
  return new Date(value).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatFullDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function formatMemorySummary(metrics: ServerMetrics | null) {
  if (!metrics) return '-'
  if (metrics.memoryTotalBytes > 0) return `${formatBytes(metrics.memoryUsedBytes)} / ${formatBytes(metrics.memoryTotalBytes)} ${metrics.memoryPercent}%`
  return `${metrics.memoryPercent}%`
}

export function parentPath(path: string) {
  if (!path || path === '.' || path === '/') return '.'
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.length === 0 ? '/' : `/${parts.join('/')}`
}

export function remoteFileName(path: string) {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

export function localFileName(path: string) {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? 'upload-file'
}

export function normalizeRemotePath(path: string) {
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
  return isAbsolute ? (parts.length === 0 ? '/' : `/${parts.join('/')}`) : parts.length === 0 ? '.' : parts.join('/')
}

export function unquoteShellPath(value: string) {
  const trimmed = value.trim().replace(/\\ /g, ' ')
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function inferRemotePathFromCommand(command: string, currentPath: string) {
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

export async function saveBlobWithFilePicker(blob: Blob, suggestedName: string) {
  if (isTauriRuntime) {
    const targetPath = await saveDialog({ defaultPath: suggestedName })
    if (!targetPath) return true
    const data = new Uint8Array(await blob.arrayBuffer())
    await writeFile(targetPath, data)
    return true
  }
  const picker = (window as WindowWithSaveFilePicker).showSaveFilePicker
  if (!picker) return false
  const handle = await picker({ suggestedName })
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
  return true
}

export function downloadBlobInBrowser(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function shouldRecordCommand(command: string) {
  if (!command) return false
  if (command.includes('__AI_SSH_CWD__')) return false
  if (command.includes('__AI_SSH_AGENT_DONE_')) return false
  if (command.startsWith('printf ') && command.includes('$PWD')) return false
  if (/^\[\>?[0-9;]*[a-zA-Z]$/.test(command)) return false
  if (/^(?:\]|\^]).*(?:\\|\u0007)?$/.test(command)) return false
  if (/^[0-9;?=><\\[\]()#;:\s]*$/.test(command)) return false
  return true
}

export function stripTerminalControlSequences(data: string) {
  return data
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\|\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[()][A-Za-z0-9]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
}

function normalizeTerminalContextForAI(data: string) {
  const promptLikeLine = /^(?:\([^)]+\)\s*)?[\w.%+-]+@[^:\s]+:[^$#\r\n]*[$#]\s*.*$/
  const lines = stripTerminalControlSequences(data)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))

  const normalized: string[] = []
  let previousBlank = false
  for (const line of lines) {
    const isPromptLine = promptLikeLine.test(line.trim())
    if (isPromptLine) {
      continue
    }
    const compactLine = line.length > 600 ? `${line.slice(0, 200)} ... ${line.slice(-200)}` : line
    const isBlank = compactLine.trim() === ''
    if (isBlank && previousBlank) {
      continue
    }
    previousBlank = isBlank
    normalized.push(compactLine)
  }
  return normalized.join('\n').trim()
}

export function terminalContextTail(cache: TerminalCache | undefined, limit: number) {
  const normalized = normalizeTerminalContextForAI(cache?.chunks.join('') ?? '')
  const maxChars = Math.max(500, limit)
  if (normalized.length <= maxChars) {
    return normalized
  }
  const lines = normalized.split('\n')
  const selected: string[] = []
  let total = 0
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    const cost = line.length + (selected.length > 0 ? 1 : 0)
    if (selected.length > 0 && total+ cost > maxChars) {
      break
    }
    selected.unshift(line)
    total += cost
  }
  return selected.join('\n')
}

export function compactCommandHistoryForAI(history: string[], limit: number) {
  const maxItems = Math.max(1, Math.min(200, Math.floor(limit || 1)))
  const seen = new Set<string>()
  const compacted: string[] = []
  for (const raw of history) {
    const command = stripTerminalControlSequences(raw).replace(/\s+/g, ' ').trim()
    if (!command || seen.has(command)) {
      continue
    }
    seen.add(command)
    compacted.push(command.length > 400 ? `${command.slice(0, 180)} ... ${command.slice(-120)}` : command)
    if (compacted.length >= maxItems) {
      break
    }
  }
  return compacted
}

export function emptyTerminalCache(): TerminalCache {
  return { chunks: [], lineCount: 0, commandDraft: '' }
}

export function countTerminalLines(data: string) {
  return (data.match(/\r\n|\r|\n/g) ?? []).length
}

export function appendTerminalCache(cache: TerminalCache | undefined, data: string, maxLines: number): TerminalCache {
  if (!data) return cache ?? emptyTerminalCache()
  const limit = Math.max(100, Math.floor(maxLines || 1000))
  const chunks = [...(cache?.chunks ?? []), data]
  let lineCount = (cache?.lineCount ?? 0) + countTerminalLines(data)
  while (chunks.length > 1 && lineCount > limit) {
    const removed = chunks.shift() ?? ''
    lineCount -= countTerminalLines(removed)
  }
  return { chunks, lineCount: Math.max(0, lineCount), commandDraft: cache?.commandDraft ?? '' }
}

export function updateTerminalDraft(cache: TerminalCache | undefined, draft: string): TerminalCache {
  return { ...(cache ?? emptyTerminalCache()), commandDraft: draft }
}

export function normalizeAppSettings(value: Partial<AppSettings> = {}): AppSettings {
  const aiModels = normalizeAIModelConfigs(value.aiModels, {
    aiBaseUrl: value.aiBaseUrl ?? defaultSettings.aiBaseUrl,
    aiApiKey: value.aiApiKey ?? defaultSettings.aiApiKey,
    aiModel: value.aiModel ?? defaultSettings.aiModel,
  })
  const activeAIModelId = aiModels.some((model) => model.id === value.activeAIModelId)
    ? String(value.activeAIModelId)
    : (aiModels[0]?.id ?? '')
  const activeAIAgentModelId = aiModels.some((model) => model.id === value.activeAIAgentModelId)
    ? String(value.activeAIAgentModelId)
    : activeAIModelId
  const activeAIPredictionModelId = aiModels.some((model) => model.id === value.activeAIPredictionModelId)
    ? String(value.activeAIPredictionModelId)
    : activeAIModelId
  const activeAIModel = aiModels.find((model) => model.id === activeAIAgentModelId) ?? aiModels[0]
  return {
    ...defaultSettings,
    ...value,
    healthCheckIntervalSeconds: Math.max(3, Math.min(300, Number(value.healthCheckIntervalSeconds ?? defaultSettings.healthCheckIntervalSeconds) || DEFAULT_HEALTH_CHECK_INTERVAL_SECONDS)),
    metricsRefreshIntervalSeconds: Math.max(1, Number(value.metricsRefreshIntervalSeconds ?? defaultSettings.metricsRefreshIntervalSeconds) || 2),
    metricsHistoryWindowMinutes: Math.max(1, Number(value.metricsHistoryWindowMinutes ?? defaultSettings.metricsHistoryWindowMinutes) || 5),
    metricsCompactPointLimit: Math.max(2, Math.min(30, Number(value.metricsCompactPointLimit ?? defaultSettings.metricsCompactPointLimit) || 5)),
    metricsExpandedPointLimit: Math.max(2, Math.min(120, Number(value.metricsExpandedPointLimit ?? defaultSettings.metricsExpandedPointLimit) || 20)),
    terminalRetainedLines: Math.max(100, Number(value.terminalRetainedLines ?? defaultSettings.terminalRetainedLines) || 1000),
    rightServerInfoPanelHeight: Math.max(
      MIN_RIGHT_SERVER_INFO_HEIGHT,
      Math.min(MAX_RIGHT_SERVER_INFO_HEIGHT, Number(value.rightServerInfoPanelHeight ?? defaultSettings.rightServerInfoPanelHeight) || DEFAULT_RIGHT_SERVER_INFO_HEIGHT),
    ),
    rightPanelWidth: Math.max(MIN_RIGHT_PANEL_WIDTH, Math.min(MAX_RIGHT_PANEL_WIDTH, Number(value.rightPanelWidth ?? defaultSettings.rightPanelWidth) || DEFAULT_RIGHT_PANEL_WIDTH)),
    aiEnabled: value.aiEnabled ?? defaultSettings.aiEnabled,
    aiBaseUrl: activeAIModel?.baseUrl ?? '',
    aiApiKey: activeAIModel?.apiKey ?? '',
    aiModel: activeAIModel?.model ?? '',
    aiModels,
    activeAIModelId,
    activeAIAgentModelId,
    activeAIPredictionModelId,
    aiPredictionEnabled: value.aiPredictionEnabled ?? defaultSettings.aiPredictionEnabled,
    aiPredictionThinkingEnabled: value.aiPredictionThinkingEnabled ?? defaultSettings.aiPredictionThinkingEnabled,
    aiPredictionCount: Math.max(1, Math.min(8, Number(value.aiPredictionCount ?? defaultSettings.aiPredictionCount) || 3)),
    aiPredictionTriggerDelayMs: Math.max(0, Math.min(10000, Number(value.aiPredictionTriggerDelayMs ?? defaultSettings.aiPredictionTriggerDelayMs) || 1000)),
    aiTerminalContextLimit: Math.max(500, Math.min(50000, Number(value.aiTerminalContextLimit ?? defaultSettings.aiTerminalContextLimit) || 5000)),
    aiCommandHistoryLimit: Math.max(1, Math.min(200, Number(value.aiCommandHistoryLimit ?? defaultSettings.aiCommandHistoryLimit) || 20)),
    aiConversationContextLimit: Math.max(1, Math.min(100, Number(value.aiConversationContextLimit ?? defaultSettings.aiConversationContextLimit) || 30)),
    aiSystemPrompt: typeof value.aiSystemPrompt === 'string' && value.aiSystemPrompt.trim() ? value.aiSystemPrompt : defaultSettings.aiSystemPrompt,
    aiSystemPromptOverride: value.aiSystemPromptOverride ?? defaultSettings.aiSystemPromptOverride,
    aiAgentThinkingEnabled: value.aiAgentThinkingEnabled ?? defaultSettings.aiAgentThinkingEnabled,
    aiProviderTimeoutSeconds: Math.max(10, Math.min(1800, Number(value.aiProviderTimeoutSeconds ?? defaultSettings.aiProviderTimeoutSeconds) || 120)),
    agentCommandTimeoutSeconds: Math.max(10, Math.min(1800, Number(value.agentCommandTimeoutSeconds ?? defaultSettings.agentCommandTimeoutSeconds) || 120)),
  }
}

export function normalizeFavoriteCommands(value: unknown) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const commands: string[] = []
  for (const item of value) {
    const command = stripTerminalControlSequences(String(item)).trim()
    if (!command || seen.has(command)) continue
    seen.add(command)
    commands.push(command)
    if (commands.length >= 200) break
  }
  return commands
}

export function isVisibleLogLevel(entryLevel: LogLevel, selectedLevel: LogLevel) {
  return logLevelRank[entryLevel] >= logLevelRank[selectedLevel]
}

export function looksLikeStructuredPredictionFragment(command: string) {
  const trimmed = stripTerminalControlSequences(command)
    .trim()
    .replace(/^`+|`+$/g, '')
    .trim()
  const lower = trimmed.toLowerCase()
  return trimmed.startsWith('{') || trimmed.startsWith('[') || lower.includes('"commands"')
}

export function normalizePredictedCommands(values: unknown, limit: number) {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  const commands: string[] = []
  for (const value of values) {
    const command = stripTerminalControlSequences(String(value)).trim()
    if (!command || command.includes('\n') || looksLikeStructuredPredictionFragment(command) || seen.has(command)) continue
    seen.add(command)
    commands.push(command)
    if (commands.length >= limit) break
  }
  return commands
}

export function classifyCommandRisk(command: string): AIRiskLevel {
  const lower = stripTerminalControlSequences(command).trim().toLowerCase()
  if (!lower) return 'low'
  const highSignals = [
    'sudo ',
    'su -',
    'rm ',
    'chmod 777',
    'chown ',
    'mkfs',
    'dd if=',
    'shutdown',
    'reboot',
    'systemctl restart',
    'systemctl stop',
    'service ',
    'apt install',
    'apt-get install',
    'yum install',
    'dnf install',
    'docker rm',
    'docker system prune',
    'iptables',
    'ufw ',
    'firewall-cmd',
    'curl ',
    'wget ',
  ]
  if (highSignals.some((signal) => lower.includes(signal))) return 'high'
  const mediumSignals = ['docker run', 'docker compose', 'npm install', 'pip install', 'cp ', 'mv ']
  if (mediumSignals.some((signal) => lower.includes(signal))) return 'medium'
  return 'low'
}

export function riskLabel(level?: AIRiskLevel) {
  if (level === 'high') return '高风险'
  if (level === 'medium') return '中风险'
  return '低风险'
}

export function normalizeAssistCommands(values: unknown, limit = 5) {
  return normalizePredictedCommands(values, limit)
}

export function firstString(values: unknown) {
  if (!Array.isArray(values)) return ''
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function agentExitMarker(stepId: string) {
  return `__AI_SSH_AGENT_DONE_${stepId.replace(/[^A-Za-z0-9_]/g, '_')}__`
}

export function wrapAgentCommand(command: string, marker: string) {
  return `${command}\nprintf '${marker}%s\\n' "$?"`
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function extractAgentExitCode(output: string, marker: string) {
  const match = output.match(new RegExp(`${escapeRegExp(marker)}(\\d+)`))
  if (!match) return undefined
  const code = Number(match[1])
  return Number.isFinite(code) ? code : undefined
}

export function stripAgentMarker(output: string, marker: string) {
  return output
    .split(/\r?\n/)
    .filter((line) => !line.includes(marker) && !line.includes(`printf '${marker}`))
    .join('\n')
}

export function stripVisibleAgentMarkers(output: string) {
  return output
    .split(/\r?\n/)
    .filter((line) => !line.includes('__AI_SSH_AGENT_DONE_') && !/^\s*printf '__AI_SSH_AGENT_DONE_/.test(line))
    .join('\r\n')
}

export function clampPredictionPanelHeight(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_PREDICTION_PANEL_HEIGHT
  return Math.min(MAX_PREDICTION_PANEL_HEIGHT, Math.max(MIN_PREDICTION_PANEL_HEIGHT, Math.round(value)))
}

export function clampRightServerInfoPanelHeight(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_RIGHT_SERVER_INFO_HEIGHT
  return Math.min(MAX_RIGHT_SERVER_INFO_HEIGHT, Math.max(MIN_RIGHT_SERVER_INFO_HEIGHT, Math.round(value)))
}

export function clampRightPanelWidth(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_RIGHT_PANEL_WIDTH
  return Math.min(MAX_RIGHT_PANEL_WIDTH, Math.max(MIN_RIGHT_PANEL_WIDTH, Math.round(value)))
}

export function buildMetricPath(samples: MetricSample[], key: MetricChartKey, width: number, height: number) {
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

export function metricPointIndexes(sampleCount: number, maxPoints: number) {
  const indexes = new Set<number>()
  if (sampleCount <= 0) return indexes
  if (sampleCount <= maxPoints) {
    for (let index = 0; index < sampleCount; index += 1) indexes.add(index)
    return indexes
  }
  const lastIndex = sampleCount - 1
  for (let point = 0; point < maxPoints; point += 1) indexes.add(Math.round((point / (maxPoints - 1)) * lastIndex))
  return indexes
}

export function metricXAxisLabels(samples: MetricSample[]) {
  if (samples.length === 0) return ['-', '-']
  const first = samples[0]
  const last = samples[samples.length - 1]
  return [formatMetricTime(first.collectedAt), formatMetricTime(last.collectedAt)]
}

// classifyAgentCommandTimeout returns an appropriate timeout in seconds based on
// the command type. Long-running commands (install, download, compile) get up to
// 3x the base timeout, capped at 1800s. Quick inspection commands get at most 60s.
export function classifyAgentCommandTimeout(command: string, baseTimeoutSeconds: number): number {
  const maxTimeout = 1800
  const quickTimeout = 60
  const lower = command.toLowerCase().trim()
  const longSignals = [
    'install', 'uninstall', 'upgrade', 'update',
    'download', 'wget ', 'curl ', 'git clone',
    'pip install', 'conda install', 'apt install', 'apt-get install',
    'yum install', 'dnf install', 'npm install', 'brew install',
    'build', 'compile', 'make', 'cmake', 'cargo build',
    'tar -x', 'unzip', '7z', 'aria2c',
    'docker build', 'docker pull', 'docker compose up',
    'nvidia-smi -l', 'nvitop',
    'conda create', 'conda env',
    'torch', 'transformers',
  ]
  const quickSignals = [
    'ls ', 'll ', 'pwd', 'echo ', 'cat ', 'head ', 'tail ',
    'grep ', 'which ', 'whereis ', 'type ', 'id ', 'whoami',
    'ps ', 'df ', 'du ', 'free ', 'uptime', 'uname', 'hostname',
    'date ', 'env ', 'cd ', 'true', 'false', 'test ',
    'printenv', 'locale',
  ]

  for (const signal of longSignals) {
    if (lower.includes(signal)) {
      return Math.min(maxTimeout, baseTimeoutSeconds * 3)
    }
  }
  for (const signal of quickSignals) {
    if (lower.startsWith(signal)) {
      return Math.min(quickTimeout, baseTimeoutSeconds)
    }
  }
  return baseTimeoutSeconds
}

export function normalizeHostGroups(groups: HostGroup[], hosts: HostRecord[] = []) {
  const seen = new Set<string>()
  const normalized: HostGroup[] = []
  const append = (name: string) => {
    const trimmed = name.trim() || '默认'
    if (seen.has(trimmed)) return
    seen.add(trimmed)
    normalized.push({ name: trimmed })
  }
  for (const group of groups) append(group.name)
  for (const host of hosts) append(host.group ?? '默认')
  if (normalized.length === 0) append('默认')
  return normalized
}

export function sessionStatusLabel(
  status: SessionRecord['status'],
  t?: (key: string) => string,
) {
  if (t) {
    if (status === 'connected') return t('sessionStatus.connected')
    if (status === 'connecting') return t('sessionStatus.connecting')
    if (status === 'error') return t('sessionStatus.error')
    if (status === 'closed') return t('sessionStatus.closed')
    return t('sessionStatus.idle')
  }
  if (status === 'connected') return 'connected'
  if (status === 'connecting') return 'connecting'
  if (status === 'error') return 'disconnected'
  if (status === 'closed') return 'closed'
  return 'idle'
}

export function truncateErrorDetail(value: string) {
  const trimmed = value.trim()
  if (trimmed.length <= ERROR_DETAIL_LIMIT) return trimmed
  return `${trimmed.slice(0, ERROR_DETAIL_LIMIT)}...(已截断)`
}

export async function readResponseErrorDetail(response: Response) {
  try {
    return truncateErrorDetail(await response.clone().text())
  } catch {
    return ''
  }
}

export function normalizeRequestPath(path: string) {
  return displayApiPath(path).split('?')[0]
}

export async function readSSEStream(response: Response, onEvent: (event: AIStreamEvent) => void) {
  if (!response.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const flush = () => {
    let separatorIndex = buffer.indexOf('\n\n')
    while (separatorIndex >= 0) {
      const frame = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      const dataLines = frame
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
      if (dataLines.length > 0) {
        let parsed: AIStreamEvent | null = null
        try {
          parsed = JSON.parse(dataLines.join('\n')) as AIStreamEvent
        } catch {
          /* Ignore malformed stream fragments */
        }
        if (parsed) onEvent(parsed)
      }
      separatorIndex = buffer.indexOf('\n\n')
    }
  }
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    flush()
  }
  buffer += decoder.decode().replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  flush()
}
