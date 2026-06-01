export const CORE_API_BASE = '/api'
export const CORE_DEFAULT_PORT = 18555

export type HealthStatus = 'ok'
export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'closed'
export type HostAuthType = 'password' | 'privateKey' | 'agent'

export interface HealthResponse {
  status: HealthStatus
  service: string
  version: string
  timestamp: string
  capabilities: string[]
  hostStore?: string
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  source: string
  message: string
  fields?: Record<string, unknown>
}

export interface LogsResponse {
  logs: LogEntry[]
}

export interface LogSettings {
  level: LogLevel
  logHealthChecks: boolean
}

export interface AuthStatusResponse {
  authenticated: boolean
  username?: string
  enabled: boolean
  initialized: boolean
  desktopLoginRequired: boolean
}

export interface LoginRequest {
  username: string
  password: string
}

export interface AuthSetupRequest {
  username: string
  password: string
  desktopLoginRequired?: boolean
}

export interface AuthSettingsResponse {
  desktopLoginRequired: boolean
  webAccessEnabled: boolean
}

export interface AuthSettingsUpdateRequest {
  desktopLoginRequired: boolean
  webAccessEnabled?: boolean
}

export interface AppSettings {
  healthCheckIntervalSeconds: number
  metricsRefreshIntervalSeconds: number
  metricsHistoryWindowMinutes: number
  metricsCompactPointLimit: number
  metricsExpandedPointLimit: number
  terminalRetainedLines: number
  rightServerInfoPanelHeight: number
  rightPanelWidth: number
  aiEnabled: boolean
  aiBaseUrl: string
  aiApiKey: string
  aiModel: string
  aiPredictionEnabled: boolean
  aiPredictionThinkingEnabled: boolean
  aiPredictionCount: number
  aiPredictionTriggerDelayMs: number
  aiTerminalContextLimit: number
  aiCommandHistoryLimit: number
  aiConversationContextLimit: number
  aiSystemPrompt: string
  agentCommandTimeoutSeconds: number
}

export interface HostRecord {
  id: string
  name: string
  address: string
  port: number
  username: string
  authType: HostAuthType
  group?: string
  description?: string
  hasPassword?: boolean
  hasPrivateKey?: boolean
}

export interface HostUpsertRequest {
  name: string
  address: string
  port: number
  username: string
  authType: HostAuthType
  group?: string
  description?: string
  password?: string
  privateKey?: string
}

export interface HostGroup {
  name: string
  previousName?: string
  delete?: boolean
}

export interface HostGroupsResponse {
  groups: HostGroup[]
}

export interface HostGroupsUpdateRequest {
  groups: HostGroup[]
}

export interface HostsImportRequest {
  hosts: HostUpsertRequest[]
  exportKey?: string
  encrypted?: boolean
  groups?: HostGroup[]
}

export interface HostsExportResponse {
  version: number
  encrypted: boolean
  exportKey?: string
  hosts: HostRecord[]
  groups?: HostGroup[]
}

export interface SessionRecord {
  id: string
  hostId: string
  hostName: string
  status: SessionStatus
  createdAt: string
  lastError?: string
}

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modifiedAt: string
}

export interface FileListResponse {
  path: string
  entries: FileEntry[]
}

export interface TransferTask {
  id: string
  direction: 'upload' | 'download'
  name: string
  status: 'queued' | 'running' | 'done' | 'error'
  progress: number
}

export interface ServerMetrics {
  hostId: string
  cpuPercent: number
  memoryPercent: number
  memoryUsedBytes: number
  memoryTotalBytes: number
  diskPercent: number
  disks: DiskMetric[]
  networkRxBytes: number
  networkTxBytes: number
  collectedAt: string
}

export interface SessionCwdResponse {
  path: string
}

export interface DiskMetric {
  mount: string
  filesystem: string
  usedPercent: number
}

export interface SystemInfo {
  hostId: string
  hostname: string
  os: string
  kernel: string
  arch: string
  uptime: string
  collectedAt: string
}

export interface SessionOpenRequest {
  hostId: string
  transientHost?: TransientHostConfig
}

export interface SessionOpenResponse {
  session: SessionRecord
}

export interface TransientHostConfig {
  name?: string
  address: string
  port: number
  username: string
  password?: string
  privateKey?: string
  authType: HostAuthType
}

export interface SessionInputRequest {
  data: string
}

export interface SessionResizeRequest {
  cols: number
  rows: number
}

export interface AIPredictionRequest {
  baseUrl: string
  apiKey?: string
  model: string
  predictionCount: number
  includeThinking?: boolean
  terminalContext: string
  commandHistory: string[]
  currentCommand?: string
  hostName?: string
  hostAddress?: string
  username?: string
}

export interface AIPredictionResponse {
  commands: string[]
}

export type AIAgentMode = 'review' | 'auto'
export type AIRiskLevel = 'low' | 'medium' | 'high'
export type AIAgentStatus = 'command' | 'done' | 'question'
export type AIAgentStepStatus = 'pending' | 'approved' | 'running' | 'executed' | 'skipped' | 'failed'

export interface AIAgentStep {
  command: string
  status: AIAgentStepStatus
  sessionId?: string
  explanation?: string
  riskLevel?: AIRiskLevel
  riskReason?: string
  output?: string
  exitCode?: number
  createdAt?: string
}

export interface AIAssistRequest {
  baseUrl: string
  apiKey?: string
  model: string
  systemPrompt?: string
  prompt: string
  terminalContext?: string
  selectedText?: string
  commandHistory?: string[]
  currentCommand?: string
  cwd?: string
  hostName?: string
  hostAddress?: string
  username?: string
  agentMode?: AIAgentMode
  agentGoal?: string
  agentSteps?: AIAgentStep[]
}

export interface AIAssistResponse {
  answer: string
  commands?: string[]
  warnings?: string[]
  riskLevel?: AIRiskLevel
  riskReason?: string
  agentStatus?: AIAgentStatus
  agentCommand?: string
  agentReason?: string
  summary?: string
}

export type AIChatMessageKind = 'user' | 'thinking' | 'content' | 'assistant' | 'command' | 'agent_step' | 'agent_result' | 'status' | 'error'

export interface AIChatConversation {
  id: string
  title: string
  snippet?: string
  createdAt: string
  updatedAt: string
}

export interface AIChatMessage {
  id: string
  conversationId: string
  kind: AIChatMessageKind
  content: string
  createdAt: string
  response?: AIAssistResponse
  step?: AIAgentStep
}

export interface AIChatConversationListResponse {
  conversations: AIChatConversation[]
}

export interface AIChatMessagesResponse {
  messages: AIChatMessage[]
}

export interface AIChatConversationCreateRequest {
  title?: string
}

export interface AIChatMessageCreateRequest {
  kind: AIChatMessageKind
  content: string
  response?: AIAssistResponse
  step?: AIAgentStep
}

export interface AIChatMessageUpdateRequest {
  content?: string
  response?: AIAssistResponse
  step?: AIAgentStep
}

export interface AIChatConversationUpdateRequest {
  title?: string
}

export type TerminalEventType = 'output' | 'status' | 'error' | 'cwd' | 'command' | 'prompt'

export interface TerminalEvent {
  type: TerminalEventType
  data?: string
}
