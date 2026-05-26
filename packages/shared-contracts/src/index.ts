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
}

export interface AuthStatusResponse {
  authenticated: boolean
  username?: string
  enabled: boolean
}

export interface LoginRequest {
  username: string
  password: string
}

export interface AppSettings {
  metricsRefreshIntervalSeconds: number
  metricsHistoryWindowMinutes: number
  metricsCompactPointLimit: number
  metricsExpandedPointLimit: number
  terminalRetainedLines: number
  aiBaseUrl: string
  aiApiKey: string
  aiModel: string
  aiPredictionEnabled: boolean
  aiPredictionCount: number
  aiTerminalContextLimit: number
  aiCommandHistoryLimit: number
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

export type TerminalEventType = 'output' | 'status' | 'error' | 'cwd' | 'command'

export interface TerminalEvent {
  type: TerminalEventType
  data?: string
}
