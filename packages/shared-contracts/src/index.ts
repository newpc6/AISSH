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

export interface AppSettings {
  metricsRefreshIntervalSeconds: number
  metricsHistoryWindowMinutes: number
  aiBaseUrl: string
  aiApiKey: string
  aiModel: string
  aiPredictionEnabled: boolean
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

export interface HostsImportRequest {
  hosts: HostUpsertRequest[]
  exportKey?: string
  encrypted?: boolean
}

export interface HostsExportResponse {
  version: number
  encrypted: boolean
  exportKey?: string
  hosts: HostRecord[]
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

export type TerminalEventType = 'output' | 'status' | 'error' | 'cwd'

export interface TerminalEvent {
  type: TerminalEventType
  data?: string
}
