import type {
  AIAgentStep,
  AIAssistResponse,
  AIChatMessage,
  HostGroup,
  HostRecord,
  ServerMetrics,
  SessionRecord,
} from '@ai-ssh/shared-contracts'

export type LoadState = 'idle' | 'loading' | 'success' | 'error'
export type LeftMode = 'servers' | 'files'
export type RightTool = 'ai' | 'history' | 'favorites'
export type HostDialogMode = 'create' | 'edit'
export type TopMenu = 'file' | 'edit' | 'session' | 'transfer' | 'tools' | 'settings' | ''
export type SettingsSection = 'general' | 'security' | 'metrics' | 'ai'

export type AIPredictionSessionState = {
  predictions: string[]
  index: number
  state: LoadState
  error: string
  thinking: string
  streamingContent: string
}

export type MetricSample = ServerMetrics & {
  networkRxRateBytes: number
  networkTxRateBytes: number
}

export type MetricHover = {
  key: MetricChartKey
  index: number
  x: number
  y: number
} | null

export type PredictionGhostPosition = {
  left: number
  top: number
  maxWidth: number
  height: number
}

export type SessionReconnectResponse = {
  previousSessionId: string
  session: SessionRecord
}

export type TerminalCache = {
  chunks: string[]
  lineCount: number
  commandDraft: string
}

export type FilePreviewKind = 'text' | 'image' | 'video' | 'binary'
export type FilePreviewStatus = 'loading' | 'ready' | 'error'
export type FileSortKey = 'name' | 'size' | 'modifiedAt'
export type FileSortDirection = 'asc' | 'desc'

export type FileSortState = {
  key: FileSortKey
  direction: FileSortDirection
}

export type FilePreviewTab = {
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
  draftContent?: string
  isEditing?: boolean
  saveState?: LoadState
  saveMessage?: string
  objectUrl?: string
  error?: string
}

export type MetricChartKey = 'cpuPercent' | 'memoryPercent'

export type HostGroupView = HostGroup & {
  hosts: HostRecord[]
}

export type SaveFilePickerHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>
    close: () => Promise<void>
  }>
}

export type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: (options: { suggestedName?: string }) => Promise<SaveFilePickerHandle>
}

export type AppErrorNotice = {
  id: string
  title: string
  message: string
  occurredAt: string
  detail?: string
  method?: string
  path?: string
  source?: string
  status?: number
}

export type LocalUploadFile = {
  path: string
  name: string
  data: number[] | ArrayBuffer | Uint8Array
}

export type LocalDownloadFile = {
  name: string
  data: number[]
}

export type AIAgentPlanStep = AIAgentStep & {
  id: string
}

export type ConfirmDialogState = {
  title: string
  section?: string
  message: string
  detail?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
} | null

export type AgentCommandWaiter = {
  stepId: string
  sessionId: string
  beforeContext: string
  marker: string
  rawOutput: string
  timeoutId: number
}

export type AIStreamEvent = {
  type: 'thinking' | 'content' | 'done' | 'error'
  text?: string
  commands?: string[]
  response?: AIAssistResponse
  error?: string
  finishReason?: string
}

export type TerminalSelectionAction = {
  text: string
  left: number
  top: number
}

export type AIChatMessageDraft = AIChatMessage & {
  pending?: boolean
}

export type BatchHostResult = {
  hostId: string
  hostName: string
  sessionId?: string
  status: 'pending' | 'connecting' | 'running' | 'success' | 'failed'
  stepCount: number
  summary?: string
  steps?: AIAgentPlanStep[]
}

export type BatchRunRequest = {
  task: string
}

export type TransferTask = {
  id: string
  name: string
  direction: 'upload' | 'download'
  progress: number
  status: string
}

export type DesktopWindow = Window & {
  __TAURI__?: unknown
  __TAURI_INTERNALS__?: unknown
}
