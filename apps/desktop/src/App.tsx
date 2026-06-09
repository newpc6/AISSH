import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog'
import { writeFile, readTextFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import '@xterm/xterm/css/xterm.css'
import { FeatureGuide } from './FeatureGuide'
import { AIWorkspacePanel } from './components/ai/AIWorkspacePanel'
import { CommandHistoryPanel } from './components/commands/CommandHistoryPanel'
import { FavoriteCommandsPanel } from './components/commands/FavoriteCommandsPanel'
import { type CodeMirrorEditorHandle } from './components/files/CodeMirrorEditor'
import { FileBrowserPanel } from './components/files/FileBrowserPanel'
import { FilePreviewPanel } from './components/files/FilePreviewPanel'
import { AIInputExpandModal } from './components/modals/AIInputExpandModal'
import { ConfirmModal } from './components/modals/ConfirmModal'
import { GroupModal } from './components/modals/GroupModal'
import { HostDialog } from './components/modals/HostDialog'
import { LogModal } from './components/modals/LogModal'
import { MetricExpandModal } from './components/modals/MetricExpandModal'
import { PendingAgentStepModal } from './components/modals/PendingAgentStepModal'
import { AIModelsDialog } from './components/modals/AIModelsDialog'
import { AISkillsDialog } from './components/modals/AISkillsDialog'
import { SettingsDialog } from './components/modals/SettingsDialog'
import { MetricChart } from './components/right-rail/MetricChart'
import { ServerInfoPanel } from './components/right-rail/ServerInfoPanel'
import { SideErrorNotice } from './components/right-rail/SideErrorNotice'
import { ServersPanel } from './components/servers/ServersPanel'
import { TerminalStage } from './components/sessions/TerminalStage'
import { SessionTabs } from './components/sessions/SessionTabs'
import { useBatchSelection } from './hooks/useBatchSelection'
import { useConfirmDialog } from './hooks/useConfirmDialog'
import { useAIUnifiedInput } from './hooks/useAIUnifiedInput'
import { useAIConversationData } from './hooks/useAIConversationData'
import { useAIConversationStrategy } from './hooks/useAIConversationStrategy'
import { useAgentExecution } from './hooks/useAgentExecution'
import { useAIMessageStore } from './hooks/useAIMessageStore'
import { DEFAULT_SESSION_AGENT_STATE, useSessionAgentState } from './hooks/useSessionAgentState'
import { useSessionLifecycle } from './hooks/useSessionLifecycle'
import { useSessionAIConversationBinding } from './hooks/useSessionAIConversationBinding'
import { useSessionStreams } from './hooks/useSessionStreams'
import { useDesktopOverlays } from './hooks/useDesktopOverlays'
import { useFavoriteCommands } from './hooks/useFavoriteCommands'
import { useFileBrowserSelection } from './hooks/useFileBrowserSelection'
import { useHostGroupDialog } from './hooks/useHostGroupDialog'
import { useHostDialogState } from './hooks/useHostDialogState'
import { useLogDialog } from './hooks/useLogDialog'
import { useMenuDismissals } from './hooks/useMenuDismissals'
import { useTerminalPredictionView } from './hooks/useTerminalPredictionView'
import { useVisibleHostGroups } from './hooks/useVisibleHostGroups'
import { useVisibleLogs } from './hooks/useVisibleLogs'
import { useWorkspaceInteractions } from './hooks/useWorkspaceInteractions'
import { useWorkspaceViewState } from './hooks/useWorkspaceViewState'
import {
  type AISkill,
  type AISkillListResponse,
  type AISkillReplaceRequest,
  type AIPredictionRequest,
  type AIAssistRequest,
  type AIAssistResponse,
  type AIModelConfig,
  type AIModelListResponse,
  type AIModelReplaceRequest,
  type AIModelProvider,
  type AIChatMessage,
  type AIChatMessageKind,
  type AIAssistConversationMessage,
  type AIRiskLevel,
  type AuthSettingsResponse,
  type AuthSettingsUpdateRequest,
  type AuthSetupRequest,
  type AuthStatusResponse,
  type HealthResponse,
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
  type LogSettings,
  type ServerMetrics,
  type SystemInfo,
  type SessionCwdResponse,
  type HostUpsertRequest,
  type SessionOpenResponse,
  type SessionRecord,
  type SessionResizeRequest,
} from '@ai-ssh/shared-contracts'

import {
  type AIPredictionSessionState,
  type AIAgentPlanStep,
  type AIChatMessageDraft,
  type AppErrorNotice,
  type BatchHostResult,
  type FilePreviewTab,
  type HostDialogMode,
  type LeftMode,
  type LoadState,
  type LocalDownloadFile,
  type LocalUploadFile,
  type MetricChartKey,
  type MetricSample,
  type PredictionGhostPosition,
  type RightTool,
  type SettingsSection,
  type TerminalCache,
  type TerminalSelectionAction,
  type TopMenu,
  type TransferTask,
} from './types'

import {
  AI_PREDICT_STREAM_API_PATH,
  AI_ASSIST_STREAM_API_PATH,
  CORE_API_FALLBACK_BASE,
  DEFAULT_AI_SYSTEM_PROMPT,
  DEFAULT_HEALTH_CHECK_INTERVAL_SECONDS,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_PREDICTION_PANEL_HEIGHT,
  DEFAULT_RIGHT_PANEL_WIDTH,
  DEFAULT_RIGHT_SERVER_INFO_HEIGHT,
  FILE_PREVIEW_CONFIRM_BYTES,
  coreCapabilityErrorDetail,
  MAX_RIGHT_PANEL_WIDTH,
  MAX_RIGHT_SERVER_INFO_HEIGHT,
  MIN_RIGHT_PANEL_WIDTH,
  MIN_RIGHT_SERVER_INFO_HEIGHT,
  defaultSettings,
  emptyHostForm,
  emptySetupForm,
  isTauriRuntime,
  agentExitMarker,
  appendQueryParam,
  appendTerminalCache,
  clampPredictionPanelHeight,
  clampRightPanelWidth,
  clampRightServerInfoPanelHeight,
  classifyAgentCommandTimeout,
  classifyCommandRisk,
  detectPreviewKind,
  displayApiPath,
  downloadBlobInBrowser,
  emptyTerminalCache,
  extractAgentExitCode,
  firstString,
  formatBytes,
  formatEditableText,
  formatFullDateTime,
  inferRemotePathFromCommand,
  isLikelyStatic405,
  localFileName,
  missingCoreCapabilities,
  normalizeApiRequestPath,
  normalizeAppSettings,
  normalizeAssistCommands,
  normalizeFavoriteCommands,
  normalizePredictedCommands,
  normalizeHostGroups,
  normalizeRequestPath,
  newOllamaModelConfig,
  newAnthropicClaudeModelConfig,
  newOpenAICompatibleModelConfig,
  parentPath,
  previewMimeType,
  readResponseErrorDetail,
  readSSEStream,
  remoteFileName,
  resolveApiStreamUrl,
  resolveApiUrl,
  riskLabel,
  saveBlobWithFilePicker,
  shouldRecordCommand,
  statusToLabel,
  stripAgentMarker,
  stripTerminalControlSequences,
  compactCommandHistoryForAI,
  normalizeAITextBlock,
  terminalContextTail,
  truncateErrorDetail,
  updateTerminalDraft,
  wrapAgentCommand,
} from './utils'

const APP_CONFIG_BACKUP_STORAGE_KEY = 'ai-ssh:app-config-backup'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const EMPTY_AI_PREDICTION_STATE: AIPredictionSessionState = {
  predictions: [],
  index: 0,
  state: 'idle',
  error: '',
  thinking: '',
  streamingContent: '',
}

export function App() {
  const { t } = useTranslation()
  const [_health, setHealth] = useState<HealthResponse | null>(null)
  const [healthState, setHealthState] = useState<LoadState>('idle')
  const [authState, setAuthState] = useState<LoadState>('loading')
  const [authRequired, setAuthRequired] = useState(true)
  const [authInitialized, setAuthInitialized] = useState(true)
  const [desktopLoginRequired, setDesktopLoginRequired] = useState(false)
  const [webAccessEnabled, setWebAccessEnabled] = useState(true)
  const [changePasswordForm, setChangePasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [changePasswordError, setChangePasswordError] = useState('')
  const [changePasswordSuccess, setChangePasswordSuccess] = useState('')
  const [loginForm, setLoginForm] = useState({ username: 'admin', password: '' })
  const [setupForm, setSetupForm] = useState(emptySetupForm)
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [showSetupPassword, setShowSetupPassword] = useState(false)
  const [showSetupConfirmPassword, setShowSetupConfirmPassword] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [errorNotice, setErrorNotice] = useState<AppErrorNotice | null>(null)
  const [hosts, setHosts] = useState<HostRecord[]>([])
  const [hostGroups, setHostGroups] = useState<HostGroup[]>([{ name: '默认' }])
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false)
  const [groupDrafts, setGroupDrafts] = useState<string[]>(['默认'])
  const [originalGroupDrafts, setOriginalGroupDrafts] = useState<string[]>(['默认'])
  const [deletedGroupDrafts, setDeletedGroupDrafts] = useState<string[]>([])
  const [groupDialogMessage, setGroupDialogMessage] = useState('')
  const [groupDialogError, setGroupDialogError] = useState('')
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [selectedHostId, setSelectedHostId] = useState<string>('')
  const [batchMode, setBatchMode] = useState(false)
  const [batchActive, setBatchActive] = useState(false)
  const [batchTask, setBatchTask] = useState('')
  const [batchHostIndex, setBatchHostIndex] = useState(0)
  const [batchHostResults, setBatchHostResults] = useState<BatchHostResult[]>([])
  const [serverSearch, setServerSearch] = useState('')
  const [activeSessionId, setActiveSessionId] = useState<string>('')
  const [leftMode, setLeftMode] = useState<LeftMode>('servers')
  const [rightTool, setRightTool] = useState<RightTool>('ai')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')
  const [openTopMenu, setOpenTopMenu] = useState<TopMenu>('')
  const [sessionTabMenu, setSessionTabMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null)
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [isServerInfoCollapsed, setIsServerInfoCollapsed] = useState(false)
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [isSkillDialogOpen, setIsSkillDialogOpen] = useState(false)
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false)
  const [isFeatureGuideOpen, setIsFeatureGuideOpen] = useState(false)
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
  const [logHealthChecks, setLogHealthChecks] = useState(false)
  const [logSearch, setLogSearch] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [aiPredictionBySession, setAiPredictionBySession] = useState<Record<string, AIPredictionSessionState>>({})
  const [isPredictionDockCollapsed, setIsPredictionDockCollapsed] = useState(false)
  const [predictionPanelHeight, setPredictionPanelHeight] = useState(DEFAULT_PREDICTION_PANEL_HEIGHT)
  const [expandedPredictionThinkingSessionId, setExpandedPredictionThinkingSessionId] = useState('')
  const [aiUnifiedPrompt, setAiUnifiedPrompt] = useState('')
  const [aiSkills, setAiSkills] = useState<AISkill[]>([])
  const [skillDrafts, setSkillDrafts] = useState<AISkill[]>([])
  const [selectedAISkillIds, setSelectedAISkillIds] = useState<string[]>([])
  const [aiModelConfigs, setAIModelConfigs] = useState<AIModelConfig[]>([])
  const [aiModelDrafts, setAIModelDrafts] = useState<AIModelConfig[]>([])
  const [activeAIModelId, setActiveAIModelId] = useState('')
  const [activeAIAgentModelId, setActiveAIAgentModelId] = useState('')
  const [activeAIPredictionModelId, setActiveAIPredictionModelId] = useState('')
  const [aiAssistantState, setAiAssistantState] = useState<LoadState>('idle')
  const [aiAssistantResponse, setAiAssistantResponse] = useState<AIAssistResponse | null>(null)
  const [aiAssistantError, setAiAssistantError] = useState('')
  const [activeAIConversationId, setActiveAIConversationId] = useState('')
  const [collapsedAIMessageIds, setCollapsedAIMessageIds] = useState<Record<string, boolean>>({})
  const [isAIHistoryOpen, setIsAIHistoryOpen] = useState(false)
  const [isAIInputCollapsed, setIsAIInputCollapsed] = useState(false)
  const [isAIInputExpanded, setIsAIInputExpanded] = useState(false)
  const [terminalSelectionAction, setTerminalSelectionAction] = useState<TerminalSelectionAction | null>(null)
  const [rightServerInfoPanelHeight, setRightServerInfoPanelHeight] = useState(DEFAULT_RIGHT_SERVER_INFO_HEIGHT)
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH)
  const [predictionGhostPosition, setPredictionGhostPosition] = useState<PredictionGhostPosition | null>(null)
  const [terminalCaches, setTerminalCaches] = useState<Record<string, TerminalCache>>({})
  const [filePreviewTabs, setFilePreviewTabs] = useState<FilePreviewTab[]>([])
  const [activeViewId, setActiveViewId] = useState('')
  const [expandedMetric, setExpandedMetric] = useState<MetricChartKey | ''>('')
  const [settingsSavedMessage, setSettingsSavedMessage] = useState('')
  const [filePath, setFilePath] = useState('.')
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([])
  const [fileError, setFileError] = useState('')
  const [isFileDropActive, setIsFileDropActive] = useState(false)
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [leftRailWidth, setLeftRailWidth] = useState(320)
  const [isLeftRailCollapsed, setIsLeftRailCollapsed] = useState(false)
  const [filePathDraft, setFilePathDraft] = useState('.')
  const [trackTerminalPath, setTrackTerminalPath] = useState(true)
  const [transferTasks, setTransferTasks] = useState<TransferTask[]>([])
  const [serverMetrics, setServerMetrics] = useState<ServerMetrics | null>(null)
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [metricHistory, setMetricHistory] = useState<MetricSample[]>([])
  const terminalRef = useRef<HTMLDivElement | null>(null)
  const fileBrowserRef = useRef<HTMLDivElement | null>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const codeMirrorRef = useRef<CodeMirrorEditorHandle | null>(null)
  const commandBufferRef = useRef('')
  const activeSessionIdRef = useRef('')
  const activeAIModelIdRef = useRef('')
  const activeAIAgentModelIdRef = useRef('')
  const activeAIPredictionModelIdRef = useRef('')
  const sessionSettingsRef = useRef(defaultSettings)
  const configLoadedRef = useRef(false)
  const hostsRef = useRef<HostRecord[]>([])
  const sessionsRef = useRef<SessionRecord[]>([])
  const aiModelConfigsRef = useRef<AIModelConfig[]>([])
  const filePreviewTabsRef = useRef<FilePreviewTab[]>([])
  const aiEnabledRef = useRef(true)
  const commandHistoryRef = useRef<string[]>([])
  const terminalCachesRef = useRef<Record<string, TerminalCache>>({})
  const aiPredictionBySessionRef = useRef<Record<string, AIPredictionSessionState>>({})
  const activeAIConversationIdRef = useRef('')
  const aiMessageListRef = useRef<HTMLDivElement | null>(null)
  const leftModeRef = useRef<LeftMode>('servers')
  const trackTerminalPathRef = useRef(true)
  const aiAgentEnabledRef = useRef(true)
  const inputQueuesRef = useRef<Record<string, Promise<void>>>({})
  const pendingResizeRef = useRef<Record<string, number>>({})
  const pendingAIPredictionTimerRef = useRef<Record<string, number>>({})
  const pendingAIPredictionCommandRef = useRef<Record<string, string>>({})
  const aiPredictionRequestRef = useRef<Record<string, number>>({})
  const aiPredictionInFlightRef = useRef<Record<string, number>>({})
  const aiPredictionIgnoredRequestRef = useRef<Record<string, number>>({})
  const aiPredictionCacheRef = useRef<Record<string, { key: string; commands: string[]; thinking: string; content: string }>>({})
  const aiPredictionCursorRef = useRef<Record<string, number>>({})
  const aiPredictionCycleStartedRef = useRef<Record<string, boolean>>({})
  const terminalLineBufferRef = useRef<Record<string, string>>({})
  const aiMessageListPinnedToBottomRef = useRef(true)
  const batchAbortRef = useRef(false)
  const batchHostResultsRef = useRef<BatchHostResult[]>([])
  const batchConversationIdRef = useRef('')
  const batchCardsRef = useRef<HTMLDivElement | null>(null)
  const predictionPositionFrameRef = useRef<number | undefined>(undefined)
  const predictionGhostVisibleRef = useRef(false)
  const terminalReplayTokenRef = useRef(0)
  const terminalReplayQueueRef = useRef<Promise<void>>(Promise.resolve())
  const {
    clearPreviewConversationId,
    getDisplayedConversationId,
    getLiveConversationId,
    isPreviewingHistoryForSession,
    liveConversationIdBySession,
    previewConversationIdBySession,
    removeConversationReferences,
    setLiveConversationId,
    setPreviewConversationId,
  } = useSessionAIConversationBinding()
  const {
    agentStateBySession,
    agentStepsBySession,
    findAgentStepById,
    getAgentStepsForSession,
    getSessionAgentState,
    setAgentStepsForSession,
    updateSessionAgentState,
  } = useSessionAgentState()
  const alternateScreenSessionsRef = useRef<Set<string>>(new Set())
  const previousMetricsRef = useRef<ServerMetrics | null>(null)
  const filePathRef = useRef('.')
  const sessionTabsRef = useRef<HTMLDivElement | null>(null)
  const sessionTabMenuRef = useRef<HTMLDivElement | null>(null)
  const privateKeyFileRef = useRef<HTMLInputElement | null>(null)
  const uploadFileRef = useRef<HTMLInputElement | null>(null)
  const desktopTokenRef = useRef('')
  const {
    closeConfirmDialog,
    confirmAndRun,
    confirmDialog,
    requestConfirm,
    setConfirmDialog,
  } = useConfirmDialog()
  const {
    addFavoriteCommand,
    confirmDeleteFavoriteCommand,
    favoriteCommandDraft,
    favoriteCommands,
    isFavoriteCommand,
    moveFavoriteCommand,
    persistFavoriteCommands,
    setFavoriteCommandDraft,
    setFavoriteCommands,
    toggleFavoriteCommand,
  } = useFavoriteCommands({
    initialCommands: [],
    onPersist: (commands) => {
      void saveAppConfig({ favoriteCommands: commands })
    },
    onRequestConfirm: setConfirmDialog,
  })
  const {
    addGroupDraft: addHostGroupDraft,
    clearGroupDialogMessage: clearHostGroupDialogMessage,
    closeGroupDialog: closeHostGroupDialog,
    confirmDeleteGroupDraft: hostGroupDialogConfirmDeleteGroupDraft,
    groupDraftUsedCounts: hostGroupDraftUsedCounts,
    moveGroupDraft: hostGroupDialogMoveGroupDraft,
    openGroupDialog: openHostGroupDialog,
    syncSavedGroups,
  } = useHostGroupDialog({
    deletedGroupDrafts,
    groupDrafts,
    hostGroups,
    hosts,
    onRequestConfirm: requestConfirm,
    originalGroupDrafts,
    setDeletedGroupDrafts,
    setGroupDialogError,
    setGroupDialogMessage,
    setGroupDrafts,
    setIsGroupDialogOpen,
    setOriginalGroupDrafts,
  })
  const {
    openFeatureGuide,
    openGroupDialog,
    openModelDialog,
    openSettingsDialog,
    openSkillDialog,
  } = useDesktopOverlays({
    openHostGroupDialog,
    setIsFeatureGuideOpen,
    setIsModelDialogOpen,
    setIsSettingsDialogOpen,
    setIsSkillDialogOpen,
    setOpenTopMenu,
    setSettingsSavedMessage,
  })
  const {
    closeHostDialog,
    duplicateHost,
    openAddHostDialog,
    openEditHostDialog,
  } = useHostDialogState({
    defaultGroupName: hostGroups[0]?.name ?? '默认',
    setEditingHostId,
    setHostDialogError,
    setHostDialogMode,
    setHostForm,
    setIsHostDialogOpen,
    setOpenHostMenuId,
    setSavePassword,
    setSavePrivateKey,
  })
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

  const setErrorMessage = (
    message: string,
    options: Partial<Omit<AppErrorNotice, 'id' | 'message' | 'occurredAt'>> = {},
  ) => {
    if (!message) {
      setErrorNotice(null)
      return
    }
    setErrorNotice({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: options.title ?? '操作失败',
      message,
      occurredAt: new Date().toISOString(),
      detail: options.detail,
      method: options.method,
      path: options.path,
      source: options.source,
      status: options.status,
    })
  }

  const clearErrorForRequest = (path: string, method: string) => {
    const normalizedPath = normalizeRequestPath(path)
    setErrorNotice((current) => {
      if (!current?.path || !current.method) {
        return current
      }
      if (current.method === method && normalizeRequestPath(current.path) === normalizedPath) {
        return null
      }
      return current
    })
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

  const updateAIPredictionForSession = (
    sessionId: string,
    updater: Partial<AIPredictionSessionState> | ((current: AIPredictionSessionState) => AIPredictionSessionState),
  ) => {
    if (!sessionId) {
      return
    }
    setAiPredictionBySession((current) => {
      const previous = current[sessionId] ?? EMPTY_AI_PREDICTION_STATE
      const nextState =
        typeof updater === 'function'
          ? updater(previous)
          : { ...previous, ...updater }
      const next = { ...current, [sessionId]: nextState }
      aiPredictionBySessionRef.current = next
      return next
    })
  }

  const getAIPredictionForSession = (sessionId: string) =>
    aiPredictionBySessionRef.current[sessionId] ?? EMPTY_AI_PREDICTION_STATE

  const clearAIPrediction = (
    options: { cancelPending?: boolean; sessionId?: string; resetGhost?: boolean } = {},
  ) => {
    const sessionId = options.sessionId ?? activeSessionIdRef.current
    if (!sessionId) {
      return
    }
    if (options.cancelPending !== false) {
      window.clearTimeout(pendingAIPredictionTimerRef.current[sessionId])
      delete pendingAIPredictionTimerRef.current[sessionId]
      delete pendingAIPredictionCommandRef.current[sessionId]
      aiPredictionIgnoredRequestRef.current[sessionId] = aiPredictionInFlightRef.current[sessionId] ?? 0
    }
    updateAIPredictionForSession(sessionId, EMPTY_AI_PREDICTION_STATE)
    delete aiPredictionCursorRef.current[sessionId]
    delete aiPredictionCycleStartedRef.current[sessionId]
    delete aiPredictionCacheRef.current[sessionId]
    if (options.resetGhost !== false && sessionId === activeSessionIdRef.current) {
      predictionGhostVisibleRef.current = false
      setPredictionGhostPosition(null)
    }
  }

  const copyTerminalSelection = async () => {
    const text = xtermRef.current?.getSelection() ?? ''
    if (!text) {
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      clearErrorForRequest('clipboard', 'COPY')
      appendLog('debug', 'ui.terminal', 'terminal selection copied', { chars: text.length })
    } catch (error) {
      const message = error instanceof Error ? error.message : '复制终端选中文本失败'
      appendLog('warn', 'ui.terminal', 'terminal selection copy failed', { error: message })
      setErrorMessage(message, {
        title: '复制失败',
        method: 'COPY',
        path: 'clipboard',
        source: '终端选区',
      })
    }
  }

  const pasteClipboardToTerminal = async () => {
    const sessionId = activeSessionIdRef.current
    const session = sessionsRef.current.find((item) => item.id === sessionId)
    if (!session) {
      return
    }
    if (session.status !== 'connected') {
      setErrorMessage('当前 SSH 会话已断开，请点击重连后继续输入')
      return
    }
    if (!navigator.clipboard?.readText) {
      setErrorMessage('当前环境不支持读取系统剪贴板', {
        title: '粘贴失败',
        method: 'PASTE',
        path: 'clipboard',
        source: '系统剪贴板',
      })
      return
    }

    try {
      const text = await navigator.clipboard.readText()
      if (!text) {
        return
      }
      xtermRef.current?.focus()
      setActiveViewId(`session:${session.id}`)
      clearAIPrediction({ sessionId: session.id })
      observeTerminalInput(session.id, text)
      queueSessionInput(session.id, text)
      clearErrorForRequest('clipboard', 'PASTE')
      appendLog('debug', 'ui.terminal', 'clipboard pasted into terminal', { chars: text.length })
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取系统剪贴板失败'
      appendLog('warn', 'ui.terminal', 'terminal paste failed', { error: message })
      setErrorMessage(message, {
        title: '粘贴失败',
        method: 'PASTE',
        path: 'clipboard',
        source: '系统剪贴板',
      })
    }
  }

  const updatePredictionGhostPositionNow = () => {
    const terminal = xtermRef.current
    const surface = terminalRef.current
    if (!predictionGhostVisibleRef.current || !terminal || !surface) {
      setPredictionGhostPosition(null)
      return
    }

    const xtermRows = surface.querySelector('.xterm-rows') as HTMLElement | null
    const cursorY = terminal.buffer.active.cursorY
    const cursorRow = xtermRows?.children[cursorY] as HTMLElement | null
    if (!cursorRow) {
      setPredictionGhostPosition(null)
      return
    }

    const wrap = surface.parentElement
    const wrapRect = wrap?.getBoundingClientRect() ?? surface.getBoundingClientRect()
    const surfaceRect = surface.getBoundingClientRect()
    const rowRect = cursorRow.getBoundingClientRect()

    if (rowRect.bottom <= surfaceRect.top || rowRect.top >= surfaceRect.bottom) {
      setPredictionGhostPosition(null)
      return
    }

    const cellWidth = wrapRect.width / Math.max(terminal.cols, 1)
    const cellHeight = rowRect.height

    const cursorX = terminal.buffer.active.cursorX
    const left = Math.min(
      Math.max(8, rowRect.left - wrapRect.left + cursorX * cellWidth + 2),
      Math.max(8, wrapRect.width - 80),
    )
    const top = Math.max(0, rowRect.top - wrapRect.top)

    setPredictionGhostPosition({
      left,
      top,
      maxWidth: Math.max(120, wrapRect.width - left - 12),
      height: Math.max(17, cellHeight),
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

    const replayToken = ++terminalReplayTokenRef.current
    const replay = () => new Promise<void>((resolve) => {
      const currentTerminal = xtermRef.current
      if (!currentTerminal || replayToken !== terminalReplayTokenRef.current) {
        resolve()
        return
      }

      const cache = terminalCachesRef.current[sessionId]
      const output = cache?.chunks.join('') ?? ''
      commandBufferRef.current = cache?.commandDraft ?? ''

      currentTerminal.reset()
      if (!output) {
        currentTerminal.refresh(0, Math.max(0, currentTerminal.rows - 1))
        schedulePredictionGhostPositionUpdate()
        resolve()
        return
      }

      currentTerminal.write(output, () => {
        if (replayToken === terminalReplayTokenRef.current) {
          currentTerminal.refresh(0, Math.max(0, currentTerminal.rows - 1))
          currentTerminal.scrollToBottom()
          schedulePredictionGhostPositionUpdate()
        }
        resolve()
      })
    })

    terminalReplayQueueRef.current = terminalReplayQueueRef.current
      .catch(() => undefined)
      .then(replay)
  }

  const appendSessionTerminalOutput = (sessionId: string, data: string) => {
    const maxLines = sessionSettingsRef.current.terminalRetainedLines
    const waiter = agentWaitersRef.current[sessionId]
    if (waiter) {
      waiter.rawOutput += data
    }
    const buffer = terminalLineBufferRef.current[sessionId] ?? ''
    const combined = buffer + data

    const writeTerminalData = (output: string) => {
      if (!output) return
      setTerminalCaches((current) => {
        const next = {
          ...current,
          [sessionId]: appendTerminalCache(current[sessionId], output, maxLines),
        }
        terminalCachesRef.current = next
        return next
      })
      if (activeSessionIdRef.current === sessionId) {
        xtermRef.current?.write(output)
        schedulePredictionGhostPositionUpdate()
        if (
          pendingAIPredictionCommandRef.current[sessionId] &&
          sessionSettingsRef.current.aiEnabled &&
          sessionSettingsRef.current.aiPredictionEnabled &&
          aiEnabledRef.current &&
          !alternateScreenSessionsRef.current.has(sessionId)
        ) {
          scheduleAIPrediction(commandHistoryRef.current, 700, sessionId)
        }
      }
    }

    const segments = combined.split(/\r?\n/)

    if (segments.length === 1) {
      const isMarkerFragment =
        combined.includes('__AI_SSH_AGENT_DONE') ||
        combined.includes("printf '__AI_SSH_AGENT_DONE_")
      if (isMarkerFragment) {
        terminalLineBufferRef.current[sessionId] = combined
      } else {
        terminalLineBufferRef.current[sessionId] = ''
        writeTerminalData(combined)
      }
      return
    }

    const last = segments[segments.length - 1]
    const completeLines = segments.slice(0, -1)
    const isAgentMarkerLine = (line: string) => line.includes('__AI_SSH_AGENT_DONE_') || /^\s*printf '__AI_SSH_AGENT_DONE_/.test(line)
    const filtered = completeLines.filter((line) => !isAgentMarkerLine(line))
    const visibleOutput: string[] = []
    if (filtered.length > 0) {
      visibleOutput.push(`${filtered.join('\r\n')}\r\n`)
    }

    if (last === '') {
      terminalLineBufferRef.current[sessionId] = ''
    } else if (isAgentMarkerLine(last)) {
      terminalLineBufferRef.current[sessionId] = last
    } else {
      visibleOutput.push(last)
      terminalLineBufferRef.current[sessionId] = ''
    }

    if (visibleOutput.length > 0) {
      writeTerminalData(visibleOutput.join(''))
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
    setAiPredictionBySession((current) => {
      if (!current[sessionId]) {
        return current
      }
      const next = { ...current }
      delete next[sessionId]
      aiPredictionBySessionRef.current = next
      return next
    })
    delete aiPredictionCursorRef.current[sessionId]
    delete aiPredictionCycleStartedRef.current[sessionId]
    window.clearTimeout(pendingAIPredictionTimerRef.current[sessionId])
    delete pendingAIPredictionTimerRef.current[sessionId]
    delete pendingAIPredictionCommandRef.current[sessionId]
    delete aiPredictionRequestRef.current[sessionId]
    delete aiPredictionCacheRef.current[sessionId]
    delete terminalLineBufferRef.current[sessionId]
  }

  const apiFetch = async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const requestPath = normalizeApiRequestPath(path)
    const primaryUrl = resolveApiUrl(requestPath)
    const headers = new Headers(init?.headers)
    if (isTauriRuntime) {
      const token = desktopTokenRef.current || await invoke<string>('desktop_login_token').catch(() => '')
      desktopTokenRef.current = token
      if (token && !headers.has('X-AI-SSH-Desktop-Token')) {
        headers.set('X-AI-SSH-Desktop-Token', token)
      }
    }
    const requestInit: RequestInit = { ...init, headers, credentials: 'include' }
    appendLog('debug', 'ui.api', 'request started', { method, path: requestPath })

    try {
      let response = await fetch(primaryUrl, requestInit)
      if (isLikelyStatic405(response)) {
        appendLog('warn', 'ui.api', 'primary api returned 405, retrying core fallback', {
          method,
          path: requestPath,
          primaryUrl: response.url,
        })
        response = await fetch(`${CORE_API_FALLBACK_BASE}${requestPath}`, requestInit)
      }

      appendLog(response.ok ? 'debug' : 'warn', 'ui.api', 'request completed', {
        method,
        path: requestPath,
        status: response.status,
        url: response.url,
      })
      if (response.ok) {
        clearErrorForRequest(requestPath, method)
      }
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
  const {
    aiMessageConversationIdsRef,
    aiMessages,
    aiMessagesRef,
    aiStreamContent,
    aiStreamContentRef,
    aiStreamThinking,
    aiStreamThinkingRef,
    appendAIMessage,
    persistStreamingArtifacts,
    replaceAndPersistAIMessage,
    resetAIStreamBuffers,
    setAiMessages,
    setAiStreamContent,
    setAiStreamThinking,
    updateStreamingContentMessage,
    updateStreamingThinkingMessage,
  } = useAIMessageStore({
    activeConversationIdRef: activeAIConversationIdRef,
    aiMessageListRef,
    isPinnedToBottomRef: aiMessageListPinnedToBottomRef,
    appendLog,
    apiFetch,
    loadAIConversations: () => {
      void loadAIConversations()
    },
    readResponseErrorDetail,
  })
  const resetSessionAgentState = (sessionId: string) => {
    setAgentStepsForSession(sessionId, [])
    updateSessionAgentState(sessionId, { goal: '', message: '', pendingStepId: '', running: false, state: 'idle' })
  }
  const {
    aiConversations,
    aiConversationsRef,
    createAIConversation,
    hasMoreConversations,
    loadAIConversations,
    loadAIMessages,
    removeAIConversation,
  } = useAIConversationData({
    activeConversationIdRef: activeAIConversationIdRef,
    activeSessionIdRef,
    aiMessagesRef,
    apiFetch,
    readResponseErrorDetail,
    resetAIStreamBuffers,
    resetSessionAgentState,
    setActiveConversationId: (conversationId) => {
      setActiveAIConversationId(conversationId)
      activeAIConversationIdRef.current = conversationId
    },
    setAiAssistantError,
    setAiAssistantResponse: (response) => setAiAssistantResponse(response as AIAssistResponse | null),
    setAiMessages,
    setLiveConversationId,
    clearPreviewConversationId,
    getDisplayedConversationId,
    removeConversationReferences,
    setSessionStepsFromMessages: setAgentStepsForSession,
  })
  const {
    ensureAIConversation,
    recentConversationContext,
    resolveAgentGoal,
    selectAIConversation,
  } = useAIConversationStrategy({
    activeConversationIdRef: activeAIConversationIdRef,
    activeSessionIdRef,
    aiMessagesRef,
    aiUnifiedPrompt,
    aiAssistantResponse,
    clearPreviewConversationId,
    createAIConversation,
    getLiveConversationId,
    getSessionAgentState,
    loadAIMessages,
    setActiveConversationId: (conversationId) => {
      setActiveAIConversationId(conversationId)
      activeAIConversationIdRef.current = conversationId
    },
    setAiAssistantResponse: () => setAiAssistantResponse(null),
    setLiveConversationId,
    resetAIStreamBuffers,
    resetSessionAgentState,
  })
  const {
    loadLogs,
    openLogDialog,
    updateLogSettings: updateLogDialogSettings,
  } = useLogDialog({
    apiFetch,
    logHealthChecks,
    logLevel,
    setErrorMessage,
    setIsLogDialogOpen,
    setLogHealthChecks,
    setLogLevel,
    setLogs,
    setOpenTopMenu,
  })
  useMenuDismissals({
    openHostMenuId,
    openTopMenu,
    sessionTabMenu,
    sessionTabMenuRef,
    setOpenHostMenuId,
    setOpenTopMenu,
    setSessionTabMenu,
  })

  const checkAuthStatus = async () => {
    setAuthState('loading')
    try {
      const response = await apiFetch('/auth/status')
      if (!response.ok) {
        throw new Error(`认证状态检查失败：${response.status}`)
      }
      const status = (await response.json()) as AuthStatusResponse
      const initialized = status.initialized ?? true
      setAuthInitialized(initialized)
      setDesktopLoginRequired(Boolean(status.desktopLoginRequired))
      setSetupForm((current) => ({
        ...current,
        username: status.username || current.username || 'admin',
        desktopLoginRequired: Boolean(status.desktopLoginRequired),
      }))
      if (!initialized) {
        setAuthRequired(true)
        setAuthState('idle')
        setLoginError('')
        return false
      }
      if (!status.enabled || status.authenticated) {
        setAuthRequired(false)
        setAuthState('success')
        setLoginError('')
        return true
      }
      if (status.enabled && !status.authenticated && isTauriRuntime && !status.desktopLoginRequired) {
        const token = desktopTokenRef.current || await invoke<string>('desktop_login_token').catch(() => '')
        desktopTokenRef.current = token
        if (token) {
          const desktopResponse = await apiFetch('/auth/desktop', {
            method: 'POST',
            headers: {
              'X-AI-SSH-Desktop-Token': token,
            },
          })
          if (desktopResponse.ok) {
            setAuthRequired(false)
            setAuthState('success')
            setAuthInitialized(true)
            setLoginError('')
            return true
          }
          const detail = await readResponseErrorDetail(desktopResponse)
          setLoginError(detail || `桌面自动登录失败：${desktopResponse.status}`)
        }
      }
      setAuthRequired(status.enabled && !status.authenticated)
      setAuthState(status.enabled && !status.authenticated ? 'idle' : 'success')
      if (!status.enabled || status.authenticated) {
        setLoginError('')
      }
      return !(status.enabled && !status.authenticated)
    } catch (error) {
      setAuthRequired(true)
      setAuthState('error')
      setLoginError(error instanceof Error ? error.message : '认证状态检查失败')
      return false
    }
  }

  const submitSetup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthState('loading')
    setLoginError('')
    try {
      if (!setupForm.password.trim()) {
        throw new Error('请设置登录密码')
      }
      if (setupForm.password !== setupForm.confirmPassword) {
        throw new Error('两次输入的密码不一致')
      }
      const payload: AuthSetupRequest = {
        username: setupForm.username.trim() || 'admin',
        password: setupForm.password,
        desktopLoginRequired: setupForm.desktopLoginRequired,
      }
      const response = await apiFetch('/auth/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const detail = await readResponseErrorDetail(response)
        throw new Error(detail || `初始化登录密码失败：${response.status}`)
      }
      const status = (await response.json()) as AuthStatusResponse
      setAuthInitialized(status.initialized ?? true)
      setDesktopLoginRequired(Boolean(status.desktopLoginRequired))
      const shouldBypassDesktopLogin = isTauriRuntime && status.enabled && !status.desktopLoginRequired
      setAuthRequired(status.enabled && !status.authenticated && !shouldBypassDesktopLogin)
      setAuthState(status.enabled && !status.authenticated && !shouldBypassDesktopLogin ? 'idle' : 'success')
      setLoginForm((current) => ({ ...current, username: payload.username, password: '' }))
      setSetupForm({ ...emptySetupForm, username: payload.username, desktopLoginRequired: Boolean(status.desktopLoginRequired) })
      setShowSetupPassword(false)
      setShowSetupConfirmPassword(false)
      await Promise.all([checkHealth(), loadHosts(), loadHostGroups()])
    } catch (error) {
      setAuthRequired(true)
      setAuthState('error')
      setLoginError(error instanceof Error ? error.message : '初始化登录密码失败')
    }
  }

  const submitLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const username = loginForm.username.trim()
    const password = loginForm.password
    if (!username) {
      setAuthRequired(true)
      setAuthState('idle')
      setLoginError('请输入用户名')
      return
    }
    if (!password.trim()) {
      setAuthRequired(true)
      setAuthState('idle')
      setLoginError('请输入登录密码')
      return
    }
    setAuthState('loading')
    setLoginError('')
    try {
      const response = await apiFetch('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })
      if (!response.ok) {
        const detail = await readResponseErrorDetail(response)
        throw new Error(detail || `登录失败：${response.status}`)
      }
      setAuthRequired(false)
      setAuthState('success')
      setLoginForm((current) => ({ ...current, password: '' }))
      setShowLoginPassword(false)
      await Promise.all([checkHealth(), loadHosts(), loadHostGroups()])
    } catch (error) {
      setAuthRequired(true)
      setAuthState('error')
      setLoginError(error instanceof Error ? error.message : '登录失败')
    }
  }

  const checkHealth = async () => {
    setHealthState('loading')
    let failedStatus: number | undefined
    try {
      const response = await apiFetch('/health')
      if (!response.ok) {
        failedStatus = response.status
        const detail = await readResponseErrorDetail(response)
        throw new Error(detail || `请求失败：${response.status}`)
      }
      const data = (await response.json()) as HealthResponse
      setHealth(data)
      setHealthState('success')
      const missingCapabilities = missingCoreCapabilities(data)
      if (missingCapabilities.length > 0) {
        setErrorMessage('Go core 版本过旧，请重启客户端', {
          title: 'Go core 能力缺失',
          method: 'GET',
          path: displayApiPath('/health'),
          source: '核心服务',
          detail: coreCapabilityErrorDetail(missingCapabilities),
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      setErrorMessage(message, {
        title: 'Go core 健康检查失败',
        method: 'GET',
        path: '/health',
        source: '核心服务',
        status: failedStatus,
      })
      setHealthState('error')
    }
  }

  const confirmRemoveTransferTask = (task: { id: string; name: string; direction: 'upload' | 'download' }) => {
    requestConfirm({
      section: '传输任务',
      title: '移除传输记录',
      message: `确定移除「${task.name}」这条${task.direction === 'upload' ? '上传' : '下载'}记录吗？`,
      confirmText: '移除',
      danger: true,
      onConfirm: () => setTransferTasks((current) => current.filter((item) => item.id !== task.id)),
    })
  }

  const confirmDeleteGroupDraft = (index: number, group: string) => {
    hostGroupDialogConfirmDeleteGroupDraft(index, group)
  }

  const moveGroupDraft = (index: number, direction: -1 | 1) => {
    hostGroupDialogMoveGroupDraft(index, direction)
  }

  const appendTextToAIInput = (text: string) => {
    const normalized = stripTerminalControlSequences(text).trim()
    if (!normalized) {
      return
    }
    setRightTool('ai')
    setAiUnifiedPrompt((current) => {
      const prefix = current.trim() ? `${current.trim()}\n\n` : ''
      return `${prefix}选中文本：\n${normalized}`
    })
  }

  const addTerminalSelectionToAI = () => {
    if (!terminalSelectionAction?.text) {
      return
    }
    appendTextToAIInput(terminalSelectionAction.text)
    setTerminalSelectionAction(null)
  }

  const saveAppConfig = async (overrides?: Partial<{
    settings?: Partial<AppSettings>
    leftRailWidth?: number
    rightPanelWidth?: number
    rightServerInfoPanelHeight?: number
    predictionPanelHeight?: number
    favoriteCommands?: string[]
  }>) => {
    let existingConfig: Record<string, unknown> = {}
    let existingApp: Record<string, unknown> = {}
    try {
      const response = await apiFetch('/config')
      if (response.ok) {
        existingConfig = (await response.json()) as Record<string, unknown>
        existingApp = isRecord(existingConfig.app) ? existingConfig.app : {}
      }
    } catch (error) {
      appendLog('warn', 'ui.config', 'load config before save failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    const backupApp = loadLocalAppConfigBackup()
    const mergedSettings = {
      ...backupApp,
      ...existingApp,
      ...(overrides?.settings ?? settings),
    } as Partial<AppSettings>
    const normalized = normalizeAppSettings(mergedSettings)
    const appConfig = {
      ...backupApp,
      ...existingApp,
      healthCheckIntervalSeconds: normalized.healthCheckIntervalSeconds,
      metricsRefreshIntervalSeconds: normalized.metricsRefreshIntervalSeconds,
      metricsHistoryWindowMinutes: normalized.metricsHistoryWindowMinutes,
      metricsCompactPointLimit: normalized.metricsCompactPointLimit,
      metricsExpandedPointLimit: normalized.metricsExpandedPointLimit,
      terminalRetainedLines: normalized.terminalRetainedLines,
      rightServerInfoPanelHeight: overrides?.rightServerInfoPanelHeight ?? rightServerInfoPanelHeight,
      rightPanelWidth: overrides?.rightPanelWidth ?? rightPanelWidth,
      leftRailWidth: overrides?.leftRailWidth ?? leftRailWidth,
      predictionPanelHeight: overrides?.predictionPanelHeight ?? predictionPanelHeight,
      aiEnabled: normalized.aiEnabled,
      aiAgentEnabled: normalized.aiAgentEnabled,
      aiPredictionEnabled: normalized.aiPredictionEnabled,
      aiPredictionThinkingEnabled: normalized.aiPredictionThinkingEnabled,
      aiPredictionCount: normalized.aiPredictionCount,
      aiPredictionTriggerDelayMs: normalized.aiPredictionTriggerDelayMs,
      aiPredictionTerminalContextLimit: normalized.aiPredictionTerminalContextLimit,
      aiPredictionCommandHistoryLimit: normalized.aiPredictionCommandHistoryLimit,
      aiPredictionProviderTimeoutSeconds: normalized.aiPredictionProviderTimeoutSeconds,
      aiTerminalContextLimit: normalized.aiTerminalContextLimit,
      aiCommandHistoryLimit: normalized.aiCommandHistoryLimit,
      aiSystemPrompt: normalized.aiSystemPrompt,
      aiAgentThinkingEnabled: normalized.aiAgentThinkingEnabled,
      aiProviderTimeoutSeconds: normalized.aiProviderTimeoutSeconds,
      agentCommandTimeoutSeconds: normalized.agentCommandTimeoutSeconds,
      favoriteCommands: normalizeFavoriteCommands(overrides?.favoriteCommands ?? existingApp.favoriteCommands ?? backupApp.favoriteCommands ?? favoriteCommands),
    }
    const config: Record<string, unknown> = {
      bindHost: '',
      port: 0,
      ...existingConfig,
      app: appConfig,
    }
    try {
      await apiFetch('/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
    } catch (error) {
      appendLog('warn', 'ui.config', 'save config failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    try {
      window.localStorage.setItem(APP_CONFIG_BACKUP_STORAGE_KEY, JSON.stringify(appConfig))
    } catch (error) {
      appendLog('warn', 'ui.config', 'save local config backup failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const loadLocalAppConfigBackup = () => {
    try {
      const raw = window.localStorage.getItem(APP_CONFIG_BACKUP_STORAGE_KEY)
      if (!raw) {
        return {}
      }
      const parsed = JSON.parse(raw) as unknown
      return isRecord(parsed) ? parsed : {}
    } catch (error) {
      appendLog('warn', 'ui.config', 'read local config backup failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return {}
    }
  }

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const resp = await apiFetch('/config')
        if (!resp.ok) return
        const cfg = await resp.json() as Record<string, unknown>
        const rawApp = isRecord(cfg.app) ? cfg.app : undefined
        const backupApp = loadLocalAppConfigBackup()
        const app = rawApp ? { ...rawApp } : backupApp
        if (app) {
          const settings = normalizeAppSettings({
            healthCheckIntervalSeconds: app.healthCheckIntervalSeconds as number,
            metricsRefreshIntervalSeconds: app.metricsRefreshIntervalSeconds as number,
            metricsHistoryWindowMinutes: app.metricsHistoryWindowMinutes as number,
            metricsCompactPointLimit: app.metricsCompactPointLimit as number,
            metricsExpandedPointLimit: app.metricsExpandedPointLimit as number,
            terminalRetainedLines: app.terminalRetainedLines as number,
            rightServerInfoPanelHeight: app.rightServerInfoPanelHeight as number,
            rightPanelWidth: app.rightPanelWidth as number,
            aiEnabled: app.aiEnabled as boolean,
            aiAgentEnabled: app.aiAgentEnabled as boolean,
            aiPredictionEnabled: app.aiPredictionEnabled as boolean,
            aiPredictionThinkingEnabled: app.aiPredictionThinkingEnabled as boolean,
            aiPredictionCount: app.aiPredictionCount as number,
            aiPredictionTriggerDelayMs: app.aiPredictionTriggerDelayMs as number,
            aiPredictionTerminalContextLimit: app.aiPredictionTerminalContextLimit as number,
            aiPredictionCommandHistoryLimit: app.aiPredictionCommandHistoryLimit as number,
            aiPredictionProviderTimeoutSeconds: app.aiPredictionProviderTimeoutSeconds as number,
            aiTerminalContextLimit: app.aiTerminalContextLimit as number,
            aiCommandHistoryLimit: app.aiCommandHistoryLimit as number,
            aiSystemPrompt: (app.aiSystemPrompt ?? '') as string,
            aiAgentThinkingEnabled: app.aiAgentThinkingEnabled as boolean,
            aiProviderTimeoutSeconds: app.aiProviderTimeoutSeconds as number,
            agentCommandTimeoutSeconds: app.agentCommandTimeoutSeconds as number,
          })
          setSettings(settings)
          sessionSettingsRef.current = settings
          if (typeof app.leftRailWidth === 'number') {
            setLeftRailWidth(Math.min(620, Math.max(220, app.leftRailWidth)))
          }
          if (typeof app.rightPanelWidth === 'number') {
            setRightPanelWidth(clampRightPanelWidth(app.rightPanelWidth))
          }
          if (typeof app.rightServerInfoPanelHeight === 'number') {
            setRightServerInfoPanelHeight(clampRightServerInfoPanelHeight(app.rightServerInfoPanelHeight))
          }
          if (typeof app.predictionPanelHeight === 'number') {
            setPredictionPanelHeight(clampPredictionPanelHeight(app.predictionPanelHeight))
          }
          if (Array.isArray(app.favoriteCommands)) {
            setFavoriteCommands(normalizeFavoriteCommands(app.favoriteCommands))
          }
        }
      } catch (error) {
        appendLog('warn', 'ui.config', 'load config from API failed, falling back to localStorage', {
          error: error instanceof Error ? error.message : String(error),
        })
      } finally {
        configLoadedRef.current = true
      }
    }
    void loadConfig()
  }, [])

  useEffect(() => {
    void loadAIModels().catch((error) => {
      appendLog('warn', 'ui.aiModels', 'load ai models failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }, [])

  useEffect(() => {
    void loadAISkills().catch((error) => {
      appendLog('warn', 'ui.aiSkills', 'load ai skills failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }, [])

  useEffect(() => {
    if (!isTauriRuntime) {
      return
    }
    void invoke<string>('desktop_login_token')
      .then((token) => {
        desktopTokenRef.current = token
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (authRequired || !terminalRef.current || xtermRef.current) {
      return undefined
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

    terminal.open(terminalRef.current)
    fitAddon.fit()
    if (activeSessionIdRef.current) {
      replaceTerminalWithCache(activeSessionIdRef.current)
    } else {
      terminal.writeln('AI SSH workspace ready.')
      terminal.writeln('选择左侧服务器并创建会话，或点击左侧 + 添加 SSH 连接。')
    }

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') {
        return true
      }
      const key = event.key.toLowerCase()
      if (event.ctrlKey && !event.shiftKey && key === 'insert') {
        if (!terminal.hasSelection()) {
          return true
        }
        void copyTerminalSelection()
        event.preventDefault()
        return false
      }
      if (event.ctrlKey && !event.shiftKey && key === 'v') {
        void pasteClipboardToTerminal()
        event.preventDefault()
        return false
      }
      if (event.shiftKey && !event.ctrlKey && !event.metaKey && key === 'tab') {
        triggerManualAIPrediction()
        event.preventDefault()
        return false
      }
      return true
    })

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
    const selectionDisposable = terminal.onSelectionChange(() => {
      const text = terminal.getSelection().trim()
      const surface = terminalRef.current
      if (!text || !surface) {
        setTerminalSelectionAction(null)
        return
      }
      const selection = terminal.getSelectionPosition()
      const cellWidth = terminal.cols > 0 ? surface.clientWidth / terminal.cols : 8
      const cellHeight = terminal.rows > 0 ? surface.clientHeight / terminal.rows : 17
      const selectionEndX = selection ? selection.end.x * cellWidth : surface.clientWidth - 92
      const selectionEndY = selection ? selection.end.y * cellHeight : 10
      setTerminalSelectionAction({
        text,
        left: Math.min(Math.max(8, selectionEndX + 8), Math.max(8, surface.clientWidth - 92)),
        top: Math.min(Math.max(8, selectionEndY - 30), Math.max(8, surface.clientHeight - 34)),
      })
    })

    return () => {
      window.removeEventListener('resize', onResize)
      resizeObserver?.disconnect()
      resizeDisposable.dispose()
      cursorDisposable.dispose()
      renderDisposable.dispose()
      selectionDisposable.dispose()
      window.cancelAnimationFrame(predictionPositionFrameRef.current ?? 0)
      closeAllSessionStreams()
      terminal.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [authRequired])

  useEffect(() => {
    const boot = async () => {
      const canLoadWorkspace = await checkAuthStatus()
      if (!canLoadWorkspace) {
        return
      }
      await Promise.all([checkHealth(), loadHosts(), loadHostGroups()])
    }

    void boot()
  }, [])

  useEffect(() => {
    const checkCoreHealth = async () => {
      let failedStatus: number | undefined
      try {
        const response = await apiFetch('/health')
        if (!response.ok) {
          failedStatus = response.status
          const detail = await readResponseErrorDetail(response)
          throw new Error(detail || `请求失败：${response.status}`)
        }
        const data = (await response.json()) as HealthResponse
        setHealth(data)
        setHealthState('success')
        const missingCapabilities = missingCoreCapabilities(data)
        if (missingCapabilities.length > 0) {
          setErrorMessage('Go core 版本过旧，请重启客户端', {
            title: 'Go core 能力缺失',
            method: 'GET',
            path: displayApiPath('/health'),
            source: '核心服务',
            detail: coreCapabilityErrorDetail(missingCapabilities),
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'core 不可用'
        setHealthState('error')
        setErrorMessage(message, {
          title: 'Go core 健康检查失败',
          method: 'GET',
          path: '/health',
          source: '核心服务',
          status: failedStatus,
        })
        sessionsRef.current
          .filter((session) => session.status === 'connected' || session.status === 'connecting')
          .forEach((session) => markSessionDisconnected(session.id, `Go core 连接中断：${message}`))
      }
    }

    const interval = window.setInterval(() => {
      void checkCoreHealth()
    }, normalizeAppSettings(settings).healthCheckIntervalSeconds * 1000)
    return () => window.clearInterval(interval)
  }, [settings.healthCheckIntervalSeconds])

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
    aiMessagesRef.current = aiMessages
    aiConversationsRef.current = aiConversations
    aiMessageConversationIdsRef.current = aiMessages.reduce<Record<string, string>>((map, message) => {
      map[message.id] = message.conversationId
      return map
    }, { ...aiMessageConversationIdsRef.current })
  }, [aiMessages, aiConversations])

  useEffect(() => {
    activeAIConversationIdRef.current = activeAIConversationId
  }, [activeAIConversationId])

  const handleAIMessageListScroll = () => {
    const element = aiMessageListRef.current
    if (!element) {
      return
    }
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    aiMessageListPinnedToBottomRef.current = distanceToBottom <= 72
  }

  const scrollAIMessageListToBottomIfPinned = () => {
    if (!aiMessageListPinnedToBottomRef.current) {
      return
    }
    const current = aiMessageListRef.current
    if (!current) {
      return
    }
    current.scrollTop = current.scrollHeight
  }

  useEffect(() => {
    const element = aiMessageListRef.current
    if (!element) {
      return
    }
    if (!aiMessageListPinnedToBottomRef.current) {
      return
    }
    const frame = window.requestAnimationFrame(() => {
      scrollAIMessageListToBottomIfPinned()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [aiMessages, aiStreamThinking, aiStreamContent, rightTool, activeSessionId, agentStateBySession, agentStepsBySession, isAIHistoryOpen])

  useEffect(() => {
    const element = aiMessageListRef.current
    if (!element || typeof MutationObserver === 'undefined') {
      return
    }
    let frame: number | undefined
    const scheduleScroll = () => {
      if (!aiMessageListPinnedToBottomRef.current) {
        return
      }
      if (frame) {
        window.cancelAnimationFrame(frame)
      }
      frame = window.requestAnimationFrame(() => {
        frame = undefined
        scrollAIMessageListToBottomIfPinned()
      })
    }
    const observer = new MutationObserver(() => {
      scheduleScroll()
    })
    observer.observe(element, {
      childList: true,
      characterData: true,
      subtree: true,
    })
    return () => {
      observer.disconnect()
      if (frame) {
        window.cancelAnimationFrame(frame)
      }
    }
  }, [activeSessionId, activeAIConversationId, isAIHistoryOpen])

  useEffect(() => {
    aiMessageListPinnedToBottomRef.current = true
  }, [activeSessionId, activeAIConversationId, isAIHistoryOpen])

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  useEffect(() => {
    if (authState !== 'success') {
      return
    }
    void (async () => {
      try {
        const conversations = await loadAIConversations()
        if (conversations.length > 0) {
          const first = conversations[0]
          setActiveAIConversationId(first.id)
          activeAIConversationIdRef.current = first.id
          await loadAIMessages(first.id)
        } else {
          await createAIConversation(t('aiWorkspace.newConversation'))
        }
      } catch (error) {
        appendLog('warn', 'ui.ai', 'load ai conversations failed', { error: error instanceof Error ? error.message : String(error) })
      }
    })()
  }, [authState])

  useEffect(() => {
    if (!activeSessionId) {
      setActiveAIConversationId('')
      activeAIConversationIdRef.current = ''
      setAiMessages([])
      aiMessagesRef.current = []
      setAiAssistantResponse(null)
      resetAIStreamBuffers()
      return
    }
    const displayedConversationId = getDisplayedConversationId(activeSessionId)
    if (!displayedConversationId) {
      setActiveAIConversationId('')
      activeAIConversationIdRef.current = ''
      setAiMessages([])
      aiMessagesRef.current = []
      setAiAssistantResponse(null)
      resetAIStreamBuffers()
      return
    }
    if (activeAIConversationIdRef.current === displayedConversationId) {
      return
    }
    void selectAIConversationWithBinding(displayedConversationId, { sessionId: activeSessionId, resetAgentState: false, bindToSession: false })
  }, [activeSessionId, liveConversationIdBySession, previewConversationIdBySession])

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
    if (!activeViewId.startsWith('session:')) {
      return
    }
    const sessionId = activeViewId.slice('session:'.length)
    if (!sessionId || activeSessionId !== sessionId || !xtermRef.current) {
      return
    }
    replaceTerminalWithCache(sessionId)
    window.requestAnimationFrame(() => {
      fitAddonRef.current?.fit()
      syncTerminalSize(sessionId)
      schedulePredictionGhostPositionUpdate()
    })
  }, [activeViewId, activeSessionId, sessions])

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
    aiEnabledRef.current = normalizeAppSettings(settings).aiEnabled
    aiAgentEnabledRef.current = normalizeAppSettings(settings).aiAgentEnabled
  }, [settings])

  useEffect(() => {
    activeAIModelIdRef.current = activeAIModelId
  }, [activeAIModelId])

  useEffect(() => {
    activeAIAgentModelIdRef.current = activeAIAgentModelId
  }, [activeAIAgentModelId])

  useEffect(() => {
    activeAIPredictionModelIdRef.current = activeAIPredictionModelId
  }, [activeAIPredictionModelId])

  useEffect(() => {
    aiModelConfigsRef.current = aiModelConfigs
  }, [aiModelConfigs])

  useEffect(() => {
    const normalized = normalizeAppSettings(settings)
    sessionSettingsRef.current = normalized
    setRightServerInfoPanelHeight(clampRightServerInfoPanelHeight(normalized.rightServerInfoPanelHeight))
    setRightPanelWidth(clampRightPanelWidth(normalized.rightPanelWidth))
  }, [settings])

  useEffect(() => {
    commandHistoryRef.current = commandHistory
  }, [commandHistory])

  useEffect(() => {
    batchHostResultsRef.current = batchHostResults
  }, [batchHostResults])

  useEffect(() => {
    terminalCachesRef.current = terminalCaches
  }, [terminalCaches])

  useEffect(() => {
    aiPredictionBySessionRef.current = aiPredictionBySession
  }, [aiPredictionBySession])

  useEffect(() => {
    filePreviewTabsRef.current = filePreviewTabs
  }, [filePreviewTabs])

  useEffect(() => {
    leftModeRef.current = leftMode
  }, [leftMode])

  useEffect(() => {
    trackTerminalPathRef.current = trackTerminalPath
  }, [trackTerminalPath])

  const {
    batchSelectedHostIds,
    batchSelectedHostIdsRef,
    batchSelectedHosts,
    clearBatchSelection,
    removeBatchSelectedHost,
    toggleBatchHostSelection,
  } = useBatchSelection(hosts)
  const { visibleHostCount, visibleHostGroups } = useVisibleHostGroups(hostGroups, hosts, serverSearch)
  const {
    clearFileSelection,
    fileSort,
    focusedFilePath,
    handleFileBrowserCompositionEnd,
    handleFileBrowserKeyDown,
    selectFileEntry,
    selectedFileEntries,
    selectedFilePaths,
    setFocusedFilePath,
    sortedFileEntries,
    updateFileSort,
  } = useFileBrowserSelection({ fileBrowserRef, fileEntries })
  const {
    activeFilePreview,
    activeHost,
    activeSession,
    isFilePreviewActive,
  } = useWorkspaceViewState({
    activeSessionId,
    activeViewId,
    filePreviewTabs,
    hosts,
    selectedHostId,
    sessions,
  })
  const effectiveLeftRailWidth = !activeSession && !isFilePreviewActive ? Math.min(leftRailWidth, 360) : leftRailWidth
  const {
    activePrediction,
    activePredictions,
    activePredictionIndex,
    isPredictionThinkingExpanded,
    primaryPrediction,
  } = useTerminalPredictionView({
    activeSessionId: activeSession?.id ?? '',
    aiPredictionBySession,
    commandBuffer: commandBufferRef.current,
    expandedPredictionThinkingSessionId,
  })
  useWorkspaceInteractions({
    activeFilePreview,
    activeViewId,
    codeMirrorRef,
    filePreviewTabCount: filePreviewTabs.length,
    sessionCount: sessions.length,
    sessionTabsRef,
  })
  const activeAgentSessionId = activeSession?.id ?? ''
  const activeAgentState = activeAgentSessionId ? getSessionAgentState(activeAgentSessionId) : DEFAULT_SESSION_AGENT_STATE
  const liveAIConversationId = activeAgentSessionId ? getLiveConversationId(activeAgentSessionId) : ''
  const isPreviewingAIHistory = activeAgentSessionId ? isPreviewingHistoryForSession(activeAgentSessionId) : false
  const agentState = activeAgentState.state
  const agentMessage = activeAgentState.message
  const activeAgentMode = activeAgentState.mode
  const agentSteps = activeAgentSessionId ? getAgentStepsForSession(activeAgentSessionId) : []
  const pendingAgentStepId = activeAgentState.pendingStepId

  const toggleBatchMode = () => {
    setBatchMode((current) => !current)
    if (batchMode) {
      clearBatchSelection()
      setBatchTask('')
    }
  }
  const handlePredictionThinkingExpandedChange = (open: boolean, sessionId: string) => {
    setExpandedPredictionThinkingSessionId(open ? sessionId : '')
  }
  const handleAIPredictionEnabledChange = (enabled: boolean) => {
    setSettings((current) => ({ ...current, aiPredictionEnabled: enabled }))
    if (!enabled) {
      clearAIPrediction()
    }
  }
  const handleSelectPrediction = (index: number) => {
    if (!activeSession) {
      return
    }
    aiPredictionCursorRef.current[activeSession.id] = index
    aiPredictionCycleStartedRef.current[activeSession.id] = true
    setActivePredictionIndex(index)
  }
  const recentHosts = useMemo(() => hosts.filter((host) => host.id !== 'local-demo').slice(0, 5), [hosts])
  const latestMetricSample = metricHistory[metricHistory.length - 1] ?? null
  const primaryDisk = serverMetrics?.disks?.find((disk) => disk.mount === '/') ?? serverMetrics?.disks?.[0] ?? null
  const activeAIAgentModelConfig = aiModelConfigs.find((model) => model.id === activeAIAgentModelId) ?? aiModelConfigs[0] ?? null
  const isAIProviderConfigured = Boolean(activeAIAgentModelConfig?.baseUrl.trim() && activeAIAgentModelConfig.model.trim())
  const visibleLogs = useVisibleLogs(logs, logLevel, logSearch)
  const selectedAISkills = useMemo(
    () => selectedAISkillIds
      .map((id) => aiSkills.find((skill) => skill.id === id) ?? null)
      .filter((skill): skill is AISkill => Boolean(skill))
      .sort((left, right) => {
        const leftKey = `${left.name}\u0000${left.id}`.toLocaleLowerCase()
        const rightKey = `${right.name}\u0000${right.id}`.toLocaleLowerCase()
        return leftKey.localeCompare(rightKey)
      }),
    [aiSkills, selectedAISkillIds],
  )
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

  const loadAISkills = async () => {
    const response = await apiFetch('/ai/skills')
    if (!response.ok) {
      throw new Error(`加载 AI skill 失败：${response.status}`)
    }
    const data = (await response.json()) as AISkillListResponse
    const skills = Array.isArray(data.skills) ? data.skills : []
    setAiSkills(skills)
    setSkillDrafts(skills.map((skill) => ({ ...skill })))
    setSelectedAISkillIds((current) => current.filter((id) => skills.some((skill) => skill.id === id)))
    return skills
  }

  const loadAIModels = async () => {
    const response = await apiFetch('/ai/models')
    if (!response.ok) {
      throw new Error(`Load AI models failed: ${response.status}`)
    }
    const data = (await response.json()) as AIModelListResponse
    const models = Array.isArray(data.models) ? data.models : []
    const nextActiveModelId = typeof data.activeModelId === 'string' ? data.activeModelId : ''
    const nextAgentModelId = typeof data.activeAgentModelId === 'string' ? data.activeAgentModelId : nextActiveModelId
    const nextPredictionModelId = typeof data.activePredictionModelId === 'string' ? data.activePredictionModelId : nextActiveModelId
    setAIModelConfigs(models)
    setAIModelDrafts(models.map((model) => ({ ...model })))
    setActiveAIModelId(nextActiveModelId)
    setActiveAIAgentModelId(nextAgentModelId)
    setActiveAIPredictionModelId(nextPredictionModelId)
    setSettings((current) => normalizeAppSettings({
      ...current,
      aiModels: models,
      activeAIModelId: nextActiveModelId,
      activeAIAgentModelId: nextAgentModelId,
      activeAIPredictionModelId: nextPredictionModelId,
    }))
    return { models, activeModelId: nextActiveModelId, activeAgentModelId: nextAgentModelId, activePredictionModelId: nextPredictionModelId }
  }

  const createAISkill = () => {
    setSkillDrafts((current) => [
      {
        id: `skill-draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: t('settings.skills.defaultName', { count: current.length + 1 }),
        prompt: '',
        createdAt: '',
        updatedAt: '',
      },
      ...current,
    ])
  }

  const updateAISkill = (id: string, patch: Partial<Pick<AISkill, 'name' | 'prompt'>>) => {
    setSkillDrafts((current) => current.map((skill) => (skill.id === id ? { ...skill, ...patch } : skill)))
  }

  const removeAISkill = (id: string) => {
    setSkillDrafts((current) => current.filter((skill) => skill.id !== id))
    setSelectedAISkillIds((current) => current.filter((skillId) => skillId !== id))
  }

  const addAIModelConfig = (provider: AIModelProvider) => {
    const nextModel = provider === 'ollama'
      ? newOllamaModelConfig()
      : provider === 'anthropic-claude'
        ? newAnthropicClaudeModelConfig()
        : newOpenAICompatibleModelConfig()
    setAIModelDrafts((current) => [...current, nextModel])
    setActiveAIModelId((current) => current || nextModel.id)
    setActiveAIAgentModelId((current) => current || nextModel.id)
    setActiveAIPredictionModelId((current) => current || nextModel.id)
  }

  const updateAIModelConfig = (id: string, patch: Partial<AIModelConfig>) => {
    setAIModelDrafts((current) => current.map((model) => {
      if (model.id !== id) return model
      const next = { ...model, ...patch }
      if (patch.provider === 'ollama' && !next.baseUrl.trim()) {
        next.baseUrl = DEFAULT_OLLAMA_BASE_URL
      }
      if (patch.provider === 'anthropic-claude' && !next.baseUrl.trim()) {
        next.baseUrl = 'https://api.anthropic.com/v1'
      }
      return next
    }))
  }

  const removeAIModelConfig = (id: string) => {
    setAIModelDrafts((current) => current.filter((model) => model.id !== id))
    setActiveAIModelId((current) => current === id ? '' : current)
    setActiveAIAgentModelId((current) => current === id ? '' : current)
    setActiveAIPredictionModelId((current) => current === id ? '' : current)
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
      closeHostDialog()
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
    if (isTauriRuntime) {
      const suffix = includeCredentials ? '含凭据' : ''
      const filePath = await saveDialog({
        title: `导出服务器列表${suffix}`,
        defaultPath: `ai-ssh-hosts${suffix}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (!filePath) return
      await writeFile(filePath, new TextEncoder().encode(text))
      if (includeCredentials && payload.exportKey) {
        window.alert('已导出加密服务器列表。JSON 中包含 exportKey，导入到其他电脑后可以恢复密码或 SSH Key。请只把这份文件交给可信的人。')
      }
      return
    }
    await navigator.clipboard.writeText(text)
    if (includeCredentials && payload.exportKey) {
      window.alert('已复制加密服务器列表到剪贴板。JSON 中包含 exportKey，导入到其他电脑后可以恢复密码或 SSH Key。请只把这份文件交给可信的人。')
    }
  }

  const importHostsFromClipboard = async () => {
    if (isTauriRuntime) {
      const filePath = await openDialog({
        title: '导入服务器列表',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        multiple: false,
      })
      if (!filePath) return
      const text = await readTextFile(filePath as string)
      await importHostsFromText(text)
      return
    }
    const text = window.prompt('粘贴服务器列表 JSON')
    if (!text) return
    await importHostsFromText(text)
  }

  const importHostsFromText = async (text: string) => {
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
    let coreConfig: Record<string, unknown> | undefined
    try {
      const resp = await apiFetch('/config')
      if (resp.ok) {
        coreConfig = await resp.json() as Record<string, unknown>
      }
    } catch {
      appendLog('warn', 'ui.config', 'failed to fetch core config for export', {})
    }
    const config = {
      settings: normalizeAppSettings(settings),
      leftRailWidth,
      rightServerInfoPanelHeight,
      rightPanelWidth,
      hostGroups,
      favoriteCommands: normalizeFavoriteCommands(favoriteCommands),
      coreConfig,
      exportedAt: new Date().toISOString(),
      version: 1,
    }
    const text = JSON.stringify(config, null, 2)
    if (isTauriRuntime) {
      const filePath = await saveDialog({
        title: '导出软件配置',
        defaultPath: 'ai-ssh-settings.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (!filePath) return
      await writeFile(filePath, new TextEncoder().encode(text))
      return
    }
    await navigator.clipboard.writeText(text)
  }

  const importSoftwareConfig = async () => {
    if (isTauriRuntime) {
      const filePath = await openDialog({
        title: '导入软件配置',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        multiple: false,
      })
      if (!filePath) return
      const text = await readTextFile(filePath as string)
      await importSoftwareConfigFromText(text)
      return
    }
    const text = window.prompt('粘贴软件配置 JSON')
    if (!text) return
    await importSoftwareConfigFromText(text)
  }

  const importSoftwareConfigFromText = async (text: string) => {
    try {
      const parsed = JSON.parse(text) as {
        settings?: Partial<AppSettings>
        leftRailWidth?: number
        rightServerInfoPanelHeight?: number
        rightPanelWidth?: number
        favoriteCommands?: unknown
        coreConfig?: Record<string, unknown>
      }
      if (parsed.settings) {
        setSettings((current) => normalizeAppSettings({ ...current, ...parsed.settings }))
      }
      if (typeof parsed.leftRailWidth === 'number') {
        setLeftRailWidth(Math.min(620, Math.max(220, parsed.leftRailWidth)))
      }
      if (typeof parsed.rightServerInfoPanelHeight === 'number') {
        const height = clampRightServerInfoPanelHeight(parsed.rightServerInfoPanelHeight)
        setRightServerInfoPanelHeight(height)
        setSettings((current) => normalizeAppSettings({ ...current, rightServerInfoPanelHeight: height }))
      }
      if (typeof parsed.rightPanelWidth === 'number') {
        const width = clampRightPanelWidth(parsed.rightPanelWidth)
        setRightPanelWidth(width)
        setSettings((current) => normalizeAppSettings({ ...current, rightPanelWidth: width }))
      }
      if (Array.isArray((parsed as { hostGroups?: HostGroup[] }).hostGroups)) {
        setHostGroups(normalizeHostGroups((parsed as { hostGroups: HostGroup[] }).hostGroups, hosts))
      }
      if (Array.isArray(parsed.favoriteCommands)) {
        persistFavoriteCommands(parsed.favoriteCommands)
      }
      if (parsed.coreConfig && (parsed.coreConfig.bindHost || parsed.coreConfig.port)) {
        const resp = await apiFetch('/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.coreConfig),
        })
        if (!resp.ok) {
          appendLog('warn', 'ui.config', 'core config import failed; restart core manually for changes', {})
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '配置 JSON 解析失败'
      setErrorMessage(message)
    }
  }

  const removeHost = async (host: HostRecord) => {
    setOpenHostMenuId('')

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

  const confirmDeleteHost = (host: HostRecord) => {
    setOpenHostMenuId('')
    requestConfirm({
      section: 'SSH 连接',
      title: '删除服务器',
      message: `确定删除服务器「${host.name}」吗？`,
      detail: `${host.username}@${host.address}:${host.port}`,
      confirmText: '删除',
      danger: true,
      onConfirm: () => removeHost(host),
    })
  }

  const handleMoveHost = async (hostId: string, direction: 'up' | 'down') => {
    const currentHosts = hostsRef.current
    const index = currentHosts.findIndex((host) => host.id === hostId)
    if (index < 0) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= currentHosts.length) return

    const reordered = [...currentHosts]
    ;[reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]]
    setHosts(reordered)

    try {
      const hostIds = reordered.map((host) => host.id)
      await apiFetch('/hosts/reorder', {
        method: 'POST',
        body: JSON.stringify({ hostIds }),
        headers: { 'Content-Type': 'application/json' },
      })
    } catch {
      setHosts(currentHosts)
    }
  }

  const saveHostGroups = async () => {
    const groupEntries: HostGroup[] = []
    const activeNames = new Set<string>()
    const activeOriginalNames = new Set<string>()
    groupDrafts.forEach((name, index) => {
      const trimmedName = name.trim()
      const previousName = originalGroupDrafts[index]?.trim()
      if (!trimmedName) {
        return
      }
      activeNames.add(trimmedName)
      if (previousName) {
        activeOriginalNames.add(previousName)
      }
      groupEntries.push({
        name: trimmedName,
        previousName: previousName && previousName !== trimmedName ? previousName : undefined,
      })
    })
    for (const deletedName of deletedGroupDrafts) {
      if (!activeNames.has(deletedName) && !activeOriginalNames.has(deletedName)) {
        groupEntries.push({ name: deletedName, previousName: deletedName, delete: true })
      }
    }
    const payload: HostGroupsUpdateRequest = {
      groups: groupEntries,
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
    const nextHosts = await loadHosts()
    const nextGroups = normalizeHostGroups(data.groups, nextHosts)
    setHostGroups(nextGroups)
    syncSavedGroups(nextGroups)
  }

  const saveSettings = () => {
    const normalized = normalizeAppSettings(settings)
    setSettings(normalized)
    sessionSettingsRef.current = normalized
    if (!normalized.aiEnabled || !normalized.aiPredictionEnabled) {
      clearAIPrediction()
    }
    if (!normalized.aiSystemPrompt.trim()) {
      normalized.aiSystemPrompt = defaultSettings.aiSystemPrompt
    }
    void saveAppConfig({ settings: normalized })
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
    setSettingsSavedMessage(t('messages.settingsSaved'))
    setErrorMessage('')
    appendLog('info', 'ui.settings', 'settings saved', {
      healthCheckIntervalSeconds: normalized.healthCheckIntervalSeconds,
      metricsRefreshIntervalSeconds: normalized.metricsRefreshIntervalSeconds,
      metricsHistoryWindowMinutes: normalized.metricsHistoryWindowMinutes,
      metricsCompactPointLimit: normalized.metricsCompactPointLimit,
      metricsExpandedPointLimit: normalized.metricsExpandedPointLimit,
      terminalRetainedLines: normalized.terminalRetainedLines,
      rightServerInfoPanelHeight: normalized.rightServerInfoPanelHeight,
      rightPanelWidth: normalized.rightPanelWidth,
      aiEnabled: normalized.aiEnabled,
      aiAgentEnabled: normalized.aiAgentEnabled,
      aiPredictionEnabled: normalized.aiPredictionEnabled,
      aiPredictionThinkingEnabled: normalized.aiPredictionThinkingEnabled,
      aiPredictionCount: normalized.aiPredictionCount,
      aiPredictionTriggerDelayMs: normalized.aiPredictionTriggerDelayMs,
      aiPredictionTerminalContextLimit: normalized.aiPredictionTerminalContextLimit,
      aiPredictionCommandHistoryLimit: normalized.aiPredictionCommandHistoryLimit,
      aiPredictionProviderTimeoutSeconds: normalized.aiPredictionProviderTimeoutSeconds,
      aiTerminalContextLimit: normalized.aiTerminalContextLimit,
      aiCommandHistoryLimit: normalized.aiCommandHistoryLimit,
      aiAgentThinkingEnabled: normalized.aiAgentThinkingEnabled,
      aiProviderTimeoutSeconds: normalized.aiProviderTimeoutSeconds,
      agentCommandTimeoutSeconds: normalized.agentCommandTimeoutSeconds,
    })
    window.setTimeout(() => setSettingsSavedMessage(t('messages.settingsSaved')), 2200)
  }

  const saveAuthSettings = async () => {
    try {
      const payload: AuthSettingsUpdateRequest = { desktopLoginRequired, webAccessEnabled }
      const response = await apiFetch('/auth/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const detail = await readResponseErrorDetail(response)
        throw new Error(detail || `保存安全设置失败：${response.status}`)
      }
      const data = (await response.json()) as AuthSettingsResponse
      setDesktopLoginRequired(data.desktopLoginRequired)
      setWebAccessEnabled(data.webAccessEnabled)
      return true
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存安全设置失败', {
        title: '安全设置保存失败',
        method: 'PUT',
        path: '/auth/settings',
        source: '安全设置',
      })
      return false
    }
  }

  const changePassword = async () => {
    setChangePasswordError('')
    setChangePasswordSuccess('')
    if (!changePasswordForm.oldPassword) {
      setChangePasswordError('请输入旧密码')
      return
    }
    if (!changePasswordForm.newPassword) {
      setChangePasswordError('请输入新密码')
      return
    }
    if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
      setChangePasswordError('两次输入的新密码不一致')
      return
    }
    try {
      const response = await apiFetch('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: changePasswordForm.oldPassword, newPassword: changePasswordForm.newPassword }),
      })
      if (!response.ok) {
        const detail = await readResponseErrorDetail(response)
        throw new Error(detail || '修改密码失败')
      }
      setChangePasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
      setChangePasswordSuccess('密码已修改')
      window.setTimeout(() => setChangePasswordSuccess(''), 2200)
    } catch (error) {
      setChangePasswordError(error instanceof Error ? error.message : '修改密码失败')
    }
  }

  const closeBatchHostCard = (hostId: string) => {
    const hostResult = batchHostResultsRef.current.find((r) => r.hostId === hostId)
    updateBatchHostResults((current) => current.filter((r) => r.hostId !== hostId))
    if (!batchActive) return
    if (hostResult?.sessionId) {
      closeSessionStream(hostResult.sessionId)
      void apiFetch(`/sessions/${hostResult.sessionId}/close`, { method: 'POST' })
    }
  }

  const setBatchHostSteps = (hostId: string, sessionId: string) => {
    const steps = getAgentStepsForSession(sessionId)
    updateBatchHostResults((current) =>
      current.map((r) =>
        r.hostId === hostId
          ? {
              ...r,
              stepCount: steps.length,
              steps,
              summary: summarizeBatchHostSteps(steps),
            }
          : r,
      ),
    )
    return steps
  }

  const setAgentStatusMessage = (message: string, sessionId = activeSessionIdRef.current) => {
    if (!sessionId) {
      return
    }
    updateSessionAgentState(sessionId, { message })
  }

  const updateBatchHostResults = (
    updater: BatchHostResult[] | ((current: BatchHostResult[]) => BatchHostResult[]),
  ) => {
    const next = typeof updater === 'function' ? updater(batchHostResultsRef.current) : updater
    batchHostResultsRef.current = next
    setBatchHostResults(next)
  }

  const findBatchHostBySession = (sessionId: string) =>
    batchHostResultsRef.current.find((result) => result.sessionId === sessionId)

  const waitForSessionConnected = async (sessionId: string, timeoutMs = 30000) => {
    const existing = sessionsRef.current.find((item) => item.id === sessionId)
    if (!existing) {
      throw new Error('当前 SSH 会话不存在')
    }
    if (existing.status === 'connected') {
      return existing
    }
    const start = Date.now()
    return await new Promise<SessionRecord>((resolve, reject) => {
      const check = () => {
        const session = sessionsRef.current.find((item) => item.id === sessionId)
        if (!session) {
          reject(new Error('当前 SSH 会话不存在'))
          return
        }
        if (session.status === 'connected') {
          resolve(session)
          return
        }
        if (session.status === 'error' || session.status === 'closed') {
          reject(new Error(session.lastError || 'SSH 会话不可用'))
          return
        }
        if (Date.now() - start > timeoutMs) {
          reject(new Error('等待 SSH 会话连接超时'))
          return
        }
        window.setTimeout(check, 300)
      }
      check()
    })
  }

  const batchMessagePrefix = (hostName: string, index?: number, total?: number) =>
    `[${typeof index === 'number' && total ? `${index + 1}/${total} ` : ''}${hostName}]`

  const appendBatchMessage = async (
    kind: AIChatMessageKind,
    content: string,
    extras: Partial<AIChatMessage> = {},
  ) => {
    const conversationId = batchConversationIdRef.current || activeAIConversationIdRef.current
    return appendAIMessage(kind, content, extras, conversationId)
  }

  const appendBatchStatusMessage = (hostName: string, status: string, index?: number, total?: number) =>
    appendBatchMessage('status', `${batchMessagePrefix(hostName, index, total)} ${status}`)

  const summarizeBatchHostSteps = (steps: AIAgentPlanStep[]) => {
    if (steps.length === 0) {
      return '未执行命令'
    }
    const latestStepWithOutput = [...steps].find((step) => step.output?.trim())
    const output = stripTerminalControlSequences(latestStepWithOutput?.output ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    const exitCode = typeof latestStepWithOutput?.exitCode === 'number' ? `退出码 ${latestStepWithOutput.exitCode}` : ''
    const outputText = output ? `输出：${output.slice(-220)}` : '无输出摘要'
    return [`执行 ${steps.length} 步`, exitCode, outputText].filter(Boolean).join('；')
  }

  const hasIncompleteAgentStep = (steps: AIAgentPlanStep[]) =>
    steps.some((step) => step.status === 'pending' || step.status === 'approved' || step.status === 'running')

  const summarizeFailedBatchHostSteps = (steps: AIAgentPlanStep[]) => {
    if (steps.some((step) => step.status === 'failed')) {
      return `执行 ${steps.length} 步，存在失败命令`
    }
    if (hasIncompleteAgentStep(steps)) {
      return `执行 ${steps.length} 步，存在未完成命令，可能需要人工确认`
    }
    return summarizeBatchHostSteps(steps)
  }

  const summarizeBatchResults = (results: BatchHostResult[]) => {
    if (results.length === 0) {
      return ''
    }
    const successCount = results.filter((result) => result.status === 'success').length
    const failedResults = results.filter((result) => result.status === 'failed')
    const totalSteps = results.reduce((sum, result) => sum + result.stepCount, 0)
    const detailText = results
      .map((result) => `${result.hostName}：${result.status === 'success' ? '成功' : result.status === 'failed' ? '失败' : result.status}${result.summary ? `（${result.summary}）` : ''}`)
      .join('；')
    return `批量任务完成：共 ${results.length} 台，成功 ${successCount} 台，失败 ${failedResults.length} 台，累计执行 ${totalSteps} 步。${detailText}`
  }

  const buildBatchFinalPrompt = (task: string, results: BatchHostResult[]) => {
    const successCount = results.filter((result) => result.status === 'success').length
    const failedCount = results.filter((result) => result.status === 'failed').length
    const hostBlocks = results.map((result, index) => {
      const statusLabel =
        result.status === 'success' ? '成功'
          : result.status === 'failed' ? '失败'
          : result.status === 'pending' ? '未开始'
          : result.status === 'connecting' ? '连接中断'
          : '执行中断'
      const steps = result.steps ?? []
      const stepLines = steps.length > 0
        ? steps.map((step, stepIndex) => {
            const output = stripTerminalControlSequences(step.output ?? '')
              .replace(/\s+/g, ' ')
              .trim()
            const exitCode = typeof step.exitCode === 'number' ? `退出码 ${step.exitCode}` : '无退出码'
            const outputText = output ? `输出摘要：${output.slice(-1200)}` : '无输出'
            return `  ${stepIndex + 1}. 命令：${step.command}\n     状态：${step.status}；${exitCode}\n     ${outputText}`
          }).join('\n')
        : '  未执行命令'
      return [
        `${index + 1}. 服务器：${result.hostName}`,
        `状态：${statusLabel}`,
        `步骤数：${result.stepCount}`,
        result.summary ? `本地摘要：${result.summary}` : '',
        '执行明细：',
        stepLines,
      ].filter(Boolean).join('\n')
    }).join('\n\n')

    return [
      '请根据下面多台服务器的批量执行结果，直接回答用户最初的问题。',
      '要求：用中文；先给总览结论，再按服务器列出关键结果；如果有失败或未执行命令，说明影响和下一步建议；不要再生成需要执行的 agentCommand。',
      '',
      `用户批量任务：${task}`,
      `执行概况：共 ${results.length} 台，成功 ${successCount} 台，失败 ${failedCount} 台。`,
      '',
      hostBlocks,
    ].join('\n')
  }

  const requestBatchFinalSummary = async (
    task: string,
    results: BatchHostResult[],
    conversationId = batchConversationIdRef.current,
  ) => {
    const targetConversationId = conversationId || await ensureAIConversation(`批量任务：${task.slice(0, 18) || '执行总结'}`)
    const summaryPrompt = buildBatchFinalPrompt(task, results)
    await appendAIMessage('status', '批量执行已完成，正在生成最终总结...', {}, targetConversationId)
    setAiAssistantState('loading')
    setAiAssistantError('')
    resetAIStreamBuffers()
    try {
      const response = await requestAIAssistStream(
        summaryPrompt,
        {
          agentMode: 'review',
          agentGoal: '',
          agentSteps: [],
          ignoreAmbientContext: true,
          ignoreConversationContext: true,
          suppressStreamingMessages: true,
        },
        '',
      )
      setAiAssistantResponse(response)
      setAiAssistantState('success')
      await persistStreamingArtifacts(targetConversationId)
      await appendAIMessage(
        'agent_result',
        response.answer || response.summary || summarizeBatchResults(results) || '批量任务已完成。',
        { response },
        targetConversationId,
      )
      const activeBatchSessionId = results.find((result) => result.sessionId)?.sessionId
      if (activeBatchSessionId) {
        updateSessionAgentState(activeBatchSessionId, { message: '批量任务总结已生成' })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '批量总结生成失败'
      setAiAssistantState('error')
      setAiAssistantError(message)
      await appendAIMessage(
        'agent_result',
        `${summarizeBatchResults(results)}\n\nAI 最终总结生成失败：${message}`,
        {},
        targetConversationId,
      )
      const activeBatchSessionId = results.find((result) => result.sessionId)?.sessionId
      if (activeBatchSessionId) {
        updateSessionAgentState(activeBatchSessionId, { message: '批量任务已完成，但 AI 总结生成失败' })
      }
    }
  }

  const executeBatchPerHost = async (hostId: string, hostName: string, task: string, index: number, total: number) => {
    if (batchAbortRef.current) return

    updateBatchHostResults((current) =>
      current.map((r) => (r.hostId === hostId ? { ...r, status: 'connecting' as const } : r)),
    )
    void appendBatchStatusMessage(hostName, '开始连接 SSH 会话...', index, total)

    let sessionId = ''
    try {
      const response = await apiFetch('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId }),
      })
      if (!response.ok) throw new Error(`创建会话失败：${response.status}`)
      const data = (await response.json()) as SessionOpenResponse
      sessionId = data.session.id
      setSessions((current) => {
        const next = [data.session, ...current.filter((session) => session.id !== data.session.id)]
        sessionsRef.current = next
        return next
      })
      openSessionStream(data.session, false)

      updateBatchHostResults((current) =>
        current.map((r) => (r.hostId === hostId ? { ...r, sessionId } : r)),
      )
      void appendBatchStatusMessage(hostName, 'SSH 会话已创建，等待连接成功...', index, total)

      await new Promise<void>((resolve, reject) => {
        const start = Date.now()
        const check = () => {
          if (batchAbortRef.current) { reject(new Error('aborted')); return }
          const session = sessionsRef.current.find((s) => s.id === sessionId)
          if (session?.status === 'connected') { resolve(); return }
          if (session?.status === 'error') { reject(new Error(session.lastError || '连接失败')); return }
          if (Date.now() - start > 30000) { reject(new Error('连接超时（30 秒）')); return }
          window.setTimeout(check, 500)
        }
        check()
      })

      updateBatchHostResults((current) =>
        current.map((r) => (r.hostId === hostId ? { ...r, status: 'running' as const, stepCount: 0 } : r)),
      )
      void appendBatchStatusMessage(hostName, `连接成功，开始执行任务：${task}`, index, total)

      updateSessionAgentState(sessionId, {
        goal: task,
        mode: 'auto',
        state: 'loading',
        running: true,
        message: `[${index + 1}/${total}] 正在 ${hostName} 上执行：${task}`,
        pendingStepId: '',
      })
      setAgentStepsForSession(sessionId, [])
      setActiveSession(sessionId)
      replaceTerminalWithCache(sessionId)
      fitAddonRef.current?.fit()
      syncTerminalSize(sessionId)
      void requestAgentNextStep([], sessionId)

      await new Promise<void>((resolve) => {
        const lastStepCountRef = { value: 0 }
        const check = () => {
          if (batchAbortRef.current || !getSessionAgentState(sessionId).running) {
            setBatchHostSteps(hostId, sessionId)
            resolve()
            return
          }
          const steps = getAgentStepsForSession(sessionId)
          if (steps.length !== lastStepCountRef.value) {
            lastStepCountRef.value = steps.length
            updateBatchHostResults((current) =>
              current.map((r) => (r.hostId === hostId ? { ...r, stepCount: steps.length } : r)),
            )
          }
          window.setTimeout(check, 500)
        }
        check()
      })

      updateBatchHostResults((current) =>
        current.map((r) =>
          r.hostId === hostId
            ? (() => {
                const steps = getAgentStepsForSession(sessionId)
                const hasFailedStep = steps.some((step) => step.status === 'failed')
                const hasIncompleteStep = hasIncompleteAgentStep(steps)
                const status = batchAbortRef.current || steps.length === 0 || hasFailedStep || hasIncompleteStep
                  ? 'failed' as const
                  : 'success' as const
                return {
                  ...r,
                  status,
                  stepCount: steps.length,
                  steps,
                  summary: batchAbortRef.current
                    ? '已取消'
                    : steps.length === 0
                      ? '未执行命令，AI 未给出可执行步骤'
                      : status === 'success'
                        ? summarizeBatchHostSteps(steps)
                        : summarizeFailedBatchHostSteps(steps),
                }
              })()
            : r,
        ),
      )
      const result = batchHostResultsRef.current.find((r) => r.hostId === hostId)
      void appendBatchMessage(
        result?.status === 'success' ? 'status' : 'agent_result',
        `${batchMessagePrefix(hostName, index, total)} ${result?.status === 'success' ? '执行完成' : '执行未完成'}：${result?.summary ?? '无执行摘要'}`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行失败'
      updateBatchHostResults((current) =>
        current.map((r) =>
          r.hostId === hostId
            ? {
                ...r,
                status: 'failed' as const,
                steps: sessionId ? getAgentStepsForSession(sessionId) : r.steps,
                summary: message,
              }
            : r,
        ),
      )
      void appendBatchMessage('agent_result', `${batchMessagePrefix(hostName, index, total)} 执行失败：${message}`)
    }
  }

  const startBatchExecution = async () => {
    const ids = batchSelectedHostIdsRef.current
    if (ids.length === 0 || !batchTask.trim()) return
    batchAbortRef.current = false
    batchConversationIdRef.current = ''
    const task = batchTask.trim()
    const hosts = ids
      .map((id) => hostsRef.current.find((host) => host.id === id))
      .filter((host): host is HostRecord => Boolean(host))
    const results: BatchHostResult[] = hosts.map((h) => ({ hostId: h.id, hostName: h.name, status: 'pending' as const, stepCount: 0 }))
    updateBatchHostResults(results)
    setBatchActive(true)
    setBatchHostIndex(0)
    setRightTool('ai')
    clearAgentWaiter()
    setAgentStatusMessage('')
    try {
      const conversation = await createAIConversation(`批量任务：${task.slice(0, 18) || '执行'}`)
      batchConversationIdRef.current = conversation.id
      await appendAIMessage('user', `批量任务：${task}`, {}, conversation.id)
      await appendAIMessage('status', `批量任务开始：共 ${hosts.length} 台服务器，将按勾选顺序逐台执行。`, {}, conversation.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建批量任务对话失败'
      setAiAssistantError(message)
      setAgentStatusMessage(message)
    }

    for (let i = 0; i < hosts.length; i++) {
      setBatchHostIndex(i)
      await executeBatchPerHost(hosts[i].id, hosts[i].name, task, i, hosts.length)
      if (batchAbortRef.current) break
    }

    setBatchActive(false)
    setBatchHostIndex(0)
    const finalResults = batchHostResultsRef.current
    const summary = summarizeBatchResults(finalResults)
    const activeBatchSessionId = finalResults.find((result) => result.sessionId)?.sessionId
    if (activeBatchSessionId) {
      updateSessionAgentState(activeBatchSessionId, {
        message: summary ? '批量执行完成，正在生成最终总结...' : '批量任务已全部完成',
      })
    }
    if (summary) {
      await requestBatchFinalSummary(task, finalResults, batchConversationIdRef.current)
    }
  }

  useEffect(() => {
    if (!batchActive || !batchCardsRef.current || batchHostResults.length <= 3) return
    const container = batchCardsRef.current
    const currentCard = container.querySelector('.batch-current') as HTMLElement | null
    if (!currentCard) return
    const containerRect = container.getBoundingClientRect()
    const cardRect = currentCard.getBoundingClientRect()
    const offset = cardRect.top - containerRect.top - container.clientHeight / 2 + cardRect.height / 2
    container.scrollBy({ top: offset, behavior: 'smooth' })
  }, [batchHostIndex, batchActive, batchHostResults.length])

  const saveAIModels = async () => {
    const payload: AIModelReplaceRequest = {
      models: aiModelDrafts,
      activeModelId: activeAIModelId,
      activeAgentModelId: activeAIAgentModelId,
      activePredictionModelId: activeAIPredictionModelId,
    }
    const response = await apiFetch('/ai/models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const detail = await readResponseErrorDetail(response)
      throw new Error(detail || `Save AI models failed: ${response.status}`)
    }
    const data = (await response.json()) as AIModelListResponse
    const models = Array.isArray(data.models) ? data.models : []
    const nextActiveModelId = typeof data.activeModelId === 'string' ? data.activeModelId : ''
    const nextAgentModelId = typeof data.activeAgentModelId === 'string' ? data.activeAgentModelId : nextActiveModelId
    const nextPredictionModelId = typeof data.activePredictionModelId === 'string' ? data.activePredictionModelId : nextActiveModelId
    setAIModelConfigs(models)
    setAIModelDrafts(models.map((model) => ({ ...model })))
    setActiveAIModelId(nextActiveModelId)
    setActiveAIAgentModelId(nextAgentModelId)
    setActiveAIPredictionModelId(nextPredictionModelId)
    setSettings((current) => normalizeAppSettings({
      ...current,
      aiModels: models,
      activeAIModelId: nextActiveModelId,
      activeAIAgentModelId: nextAgentModelId,
      activeAIPredictionModelId: nextPredictionModelId,
    }))
    setSettingsSavedMessage(t('messages.modelsSaved'))
    window.setTimeout(() => setSettingsSavedMessage(''), 2200)
  }

  const saveAISkills = async () => {
    const payload: AISkillReplaceRequest = {
      skills: skillDrafts.map((skill) => ({ id: skill.id, name: skill.name, prompt: skill.prompt })),
    }
    const response = await apiFetch('/ai/skills', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const detail = await readResponseErrorDetail(response)
      throw new Error(detail || `Save AI skills failed: ${response.status}`)
    }
    const data = (await response.json()) as AISkillListResponse
    const skills = Array.isArray(data.skills) ? data.skills : []
    setAiSkills(skills)
    setSkillDrafts(skills.map((skill) => ({ ...skill })))
    setSelectedAISkillIds((current) => current.filter((id) => skills.some((skill) => skill.id === id)))
    setSettingsSavedMessage(t('messages.skillsSaved'))
    window.setTimeout(() => setSettingsSavedMessage(''), 2200)
  }

  const saveAllSettings = async () => {
    saveSettings()
    try {
      await loadAISkills()
    } catch (error) {
      appendLog('warn', 'ui.aiSkills', 'reload ai skills after save failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    if (authInitialized) {
      const saved = await saveAuthSettings()
      if (saved) {
        setSettingsSavedMessage(t('messages.settingsSaved'))
        window.setTimeout(() => setSettingsSavedMessage(t('messages.settingsSaved')), 2200)
      }
    }
  }

  const updateLogSettings = async (nextSettings: Partial<LogSettings>) => {
    return updateLogDialogSettings(nextSettings)
  }

  const loadFiles = async (path = filePath, hostId = activeSession?.hostId ?? selectedHostId) => {
    if (!hostId || hostId === 'local-demo') {
      setFileEntries([])
      clearFileSelection()
      setFocusedFilePath('')
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
      clearFileSelection()
      setFocusedFilePath('')
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

  const downloadFilesToDirectory = async (entries: FileEntry[], targetDirectory?: string) => {
    const hostId = activeSession?.hostId ?? selectedHostId
    if (!hostId || entries.length === 0) {
      return
    }

    let directory = targetDirectory
    if (!directory) {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: '选择下载保存目录',
      })
      directory = Array.isArray(selected) ? selected[0] : selected || undefined
    }
    if (!directory) {
      return
    }

    const taskID = `${Date.now()}-download-selected`
    setTransferTasks((current) => [
      { id: taskID, name: `${entries.length} 个文件`, direction: 'download', progress: 5, status: 'running' },
      ...current,
    ])

    try {
      for (const [index, entry] of entries.entries()) {
        const response = await apiFetch(`/files/${hostId}?download=1&path=${encodeURIComponent(entry.path)}`)
        if (!response.ok) {
          const detail = await response.text()
          throw new Error(detail.trim() || `下载 ${entry.name} 失败：${response.status}`)
        }
        const bytes = Array.from(new Uint8Array(await response.arrayBuffer()))
        const file: LocalDownloadFile = { name: entry.name, data: bytes }
        await invoke('write_local_download_files', { directory, files: [file] })
        setTransferTasks((current) =>
          current.map((task) => (
            task.id === taskID
              ? { ...task, progress: Math.max(10, Math.round(((index + 1) / entries.length) * 100)) }
              : task
          )),
        )
      }
      setTransferTasks((current) =>
        current.map((task) => (task.id === taskID ? { ...task, progress: 100, status: 'done' } : task)),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '批量下载失败'
      setErrorMessage(message)
      setTransferTasks((current) =>
        current.map((task) => (task.id === taskID ? { ...task, status: 'error' } : task)),
      )
    }
  }

  const downloadSelectedFiles = async () => {
    if (selectedFileEntries.length === 0) {
      return
    }
    if (selectedFileEntries.length === 1) {
      await downloadFile(selectedFileEntries[0])
      return
    }
    if (isTauriRuntime) {
      await downloadFilesToDirectory(selectedFileEntries)
      return
    }
    for (const entry of selectedFileEntries) {
      await downloadFile(entry)
    }
  }

  const openFilePreview = async (entry: FileEntry, confirmed = false) => {
    const session = activeSession
    const hostId = session?.hostId ?? selectedHostId
    if (!hostId || entry.type !== 'file') {
      return
    }

    const kind = detectPreviewKind(entry)
    if (entry.size > FILE_PREVIEW_CONFIRM_BYTES && !confirmed) {
      requestConfirm({
        section: '远程文件',
        title: '打开大文件预览',
        message: `文件 ${entry.name} 大小为 ${formatBytes(entry.size)}，确定要打开预览吗？`,
        confirmText: '打开',
        onConfirm: () => openFilePreview(entry, true),
      })
      return
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
          current.map((tab) => (
            tab.id === tabID
              ? { ...tab, status: 'ready', content, draftContent: content, isEditing: false, saveState: 'idle', saveMessage: '' }
              : tab
          )),
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

  const openFilePreviewAsText = async (tab: FilePreviewTab) => {
    if (tab.status === 'loading') {
      return
    }

    setFilePreviewTabs((current) =>
      current.map((item) => (
        item.id === tab.id
          ? { ...item, kind: 'text', status: 'loading', error: '', saveState: 'idle', saveMessage: '' }
          : item
      )),
    )

    try {
      const response = await apiFetch(`/files/${tab.hostId}?download=1&path=${encodeURIComponent(tab.path)}`)
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail.trim() || `以文本方式打开失败：${response.status}`)
      }
      const content = await response.text()
      setFilePreviewTabs((current) =>
        current.map((item) => (
          item.id === tab.id
            ? {
                ...item,
                kind: 'text',
                status: 'ready',
                content,
                draftContent: content,
                isEditing: false,
                saveState: 'idle',
                saveMessage: '',
                error: '',
                objectUrl: undefined,
              }
            : item
        )),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '以文本方式打开失败'
      setFilePreviewTabs((current) =>
        current.map((item) => (
          item.id === tab.id ? { ...item, status: 'error', error: message, kind: 'binary' } : item
        )),
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

  const updateFilePreviewDraft = (tabID: string, content: string) => {
    setFilePreviewTabs((current) =>
      current.map((tab) => (
        tab.id === tabID
          ? { ...tab, draftContent: content, saveState: 'idle', saveMessage: '' }
          : tab
      )),
    )
  }

  const setFilePreviewEditMode = (tabID: string, isEditing: boolean) => {
    setFilePreviewTabs((current) =>
      current.map((tab) => {
        if (tab.id !== tabID) return tab
        return {
          ...tab,
          isEditing,
          draftContent: tab.draftContent ?? tab.content ?? '',
          saveState: 'idle',
          saveMessage: '',
        }
      }),
    )
  }

  const formatFilePreviewDraft = (tab: FilePreviewTab) => {
    if (tab.kind !== 'text') {
      return
    }
    try {
      const result = formatEditableText(tab.name, tab.draftContent ?? tab.content ?? '')
      setFilePreviewTabs((current) =>
        current.map((item) => (
          item.id === tab.id
            ? { ...item, draftContent: result.content, saveState: 'success', saveMessage: result.message }
            : item
        )),
      )
    } catch (error) {
      const detail = error instanceof Error ? error.message : '文本格式不合法'
      setFilePreviewTabs((current) =>
        current.map((item) => (
          item.id === tab.id
            ? { ...item, saveState: 'error', saveMessage: `格式化失败：${detail}` }
            : item
        )),
      )
    }
  }

  const resetFilePreviewDraft = (tab: FilePreviewTab) => {
    if (tab.kind !== 'text') {
      return
    }
    setFilePreviewTabs((current) =>
      current.map((item) => (
        item.id === tab.id
          ? {
              ...item,
              draftContent: item.content ?? '',
              saveState: 'success',
              saveMessage: '已还原为保存内容',
            }
          : item
      )),
    )
  }

  const copyFilePreviewDraft = async (tab: FilePreviewTab) => {
    if (tab.kind !== 'text') {
      return
    }
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('当前环境不支持剪贴板写入')
      }
      await navigator.clipboard.writeText(tab.draftContent ?? tab.content ?? '')
      setFilePreviewTabs((current) =>
        current.map((item) => (
          item.id === tab.id ? { ...item, saveState: 'success', saveMessage: '已复制到剪贴板' } : item
        )),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '复制失败'
      setFilePreviewTabs((current) =>
        current.map((item) => (
          item.id === tab.id ? { ...item, saveState: 'error', saveMessage: message } : item
        )),
      )
    }
  }

  const saveFilePreview = async (tab: FilePreviewTab) => {
    if (tab.kind !== 'text') {
      return
    }
    const content = tab.draftContent ?? tab.content ?? ''
    const remoteDir = parentPath(tab.path)
    const fileName = remoteFileName(tab.path)
    const formData = new FormData()
    formData.append('files', new File([content], fileName, { type: previewMimeType({ name: tab.name }, 'text') }))
    setFilePreviewTabs((current) =>
      current.map((item) => (
        item.id === tab.id ? { ...item, saveState: 'loading', saveMessage: '正在保存...' } : item
      )),
    )
    try {
      const response = await apiFetch(`/files/${tab.hostId}?path=${encodeURIComponent(remoteDir)}`, {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail.trim() || `保存失败：${response.status}`)
      }
      const savedAt = new Date().toISOString()
      setFilePreviewTabs((current) =>
        current.map((item) => (
          item.id === tab.id
            ? {
                ...item,
                content,
                draftContent: content,
                isEditing: false,
                saveState: 'success',
                saveMessage: '保存成功',
                size: new Blob([content]).size,
                modifiedAt: savedAt,
              }
            : item
        )),
      )
      if (tab.hostId === (activeSession?.hostId ?? selectedHostId)) {
        await loadFiles(remoteDir, tab.hostId)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败'
      setFilePreviewTabs((current) =>
        current.map((item) => (
          item.id === tab.id ? { ...item, saveState: 'error', saveMessage: message } : item
        )),
      )
      setErrorMessage(message, {
        title: '远程文件保存失败',
        method: 'POST',
        path: `/files/${tab.hostId}`,
        source: '远程文件',
      })
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

  const uploadLocalPaths = async (paths: string[]) => {
    const localPaths = paths.filter(Boolean)
    if (localPaths.length === 0) {
      return
    }

    try {
      const localFiles = await invoke<LocalUploadFile[]>('read_local_upload_files', { paths: localPaths })
      const files = localFiles.map((file) => {
        const bytes =
          file.data instanceof Uint8Array
            ? file.data
            : file.data instanceof ArrayBuffer
              ? new Uint8Array(file.data)
              : Uint8Array.from(file.data)
        return new File([bytes as BlobPart], file.name || localFileName(file.path))
      })
      await uploadFiles(files)
    } catch (error) {
      const message = error instanceof Error ? error.message : '拖拽上传失败'
      appendLog('error', 'ui.files', 'tauri local file upload failed', {
        error: message,
        count: localPaths.length,
      })
      setFileError(`拖拽上传失败：${message}`)
      setErrorMessage(`拖拽上传失败：${message}`, {
        title: '本地文件上传失败',
        source: '远程文件',
      })
    }
  }

  const remoteFileDownloadUrl = (entry: FileEntry) => {
    const hostId = activeSession?.hostId ?? selectedHostId
    let url = resolveApiUrl(`/files/${hostId}?download=1&path=${encodeURIComponent(entry.path)}`)
    if (isTauriRuntime) {
      const token = desktopTokenRef.current
      if (token) {
        url = appendQueryParam(url, 'desktopToken', token)
      }
    }
    return url
  }

  const setupRemoteFileDrag = (entry: FileEntry, event: React.DragEvent<HTMLButtonElement>) => {
    if (entry.type !== 'file') {
      return
    }
    const draggedEntries =
      selectedFilePaths.includes(entry.path) && selectedFileEntries.length > 0 ? selectedFileEntries : [entry]
    const urls = draggedEntries.map((item) => remoteFileDownloadUrl(item))
    const [url] = urls
    const downloadEntry = draggedEntries[0] ?? entry
    event.dataTransfer.clearData()
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.dropEffect = 'copy'
    event.dataTransfer.setData('text/uri-list', urls.join('\n'))
    event.dataTransfer.setData('text/plain', urls.join('\n'))
    if (!isTauriRuntime || !/Windows/i.test(window.navigator.userAgent)) {
      event.dataTransfer.setData('DownloadURL', `application/octet-stream:${downloadEntry.name}:${url}`)
    }
  }

  const handleRemoteFileDragEnd = (entry: FileEntry, event: React.DragEvent<HTMLButtonElement>) => {
    if (!isTauriRuntime || entry.type !== 'file' || event.dataTransfer.dropEffect !== 'none') {
      return
    }
    const draggedEntries =
      selectedFilePaths.includes(entry.path) && selectedFileEntries.length > 0 ? selectedFileEntries : [entry]
    window.setTimeout(() => {
      void (async () => {
        try {
          const directory = await invoke<string | null>('active_explorer_directory')
          if (directory) {
            await downloadFilesToDirectory(draggedEntries, directory)
          }
        } catch (error) {
          appendLog('debug', 'ui.files', 'explorer drag-out fallback skipped', {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      })()
    }, 120)
  }

  const chooseUploadFiles = async () => {
    if (!isTauriRuntime) {
      uploadFileRef.current?.click()
      return
    }

    try {
      const selected = await openDialog({
        multiple: true,
        directory: false,
        title: '选择要上传的文件',
      })
      const paths = Array.isArray(selected) ? selected : selected ? [selected] : []
      await uploadLocalPaths(paths)
    } catch (error) {
      const message = error instanceof Error ? error.message : '选择上传文件失败'
      appendLog('error', 'ui.files', 'tauri upload file dialog failed', { error: message })
      setErrorMessage(message, {
        title: '选择上传文件失败',
        source: '远程文件',
      })
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

  const loadSystemInfo = async () => {
    const hostId = activeSession?.hostId
    if (!hostId || hostId === "local-demo") {
      setSystemInfo(null)
      return
    }
    const response = await apiFetch(`/system-info/${hostId}`)
    if (!response.ok) {
      setSystemInfo(null)
      return
    }
    const info = (await response.json()) as SystemInfo
    setSystemInfo(info)
  }

  const recordCommand = (sessionId: string, command: string) => {
    const normalized = stripTerminalControlSequences(command).trim()
    if (!shouldRecordCommand(normalized)) {
      return
    }
    const session = sessionsRef.current.find((item) => item.id === sessionId)
    const hostId = session?.hostId
    const isAgentExecuting = Boolean(session?.id && agentWaitersRef.current[session.id])

    const inferredPath = inferRemotePathFromCommand(normalized, filePathRef.current)
    if (
      inferredPath &&
      trackTerminalPathRef.current &&
      hostId &&
      hostId !== 'local-demo' &&
      activeSessionIdRef.current === sessionId
    ) {
      setTrackedFilePath(inferredPath)
      if (leftModeRef.current === 'files') {
        void loadFiles(inferredPath, hostId)
      }
    }

    const nextHistory = [normalized, ...commandHistoryRef.current].slice(0, 200)
    commandHistoryRef.current = nextHistory
    setCommandHistory(nextHistory)
    if (
      !isAgentExecuting &&
      sessionSettingsRef.current.aiEnabled &&
      sessionSettingsRef.current.aiPredictionEnabled &&
      aiEnabledRef.current
    ) {
      pendingAIPredictionCommandRef.current[sessionId] = normalized
      if (!aiPredictionInFlightRef.current[sessionId]) {
        updateAIPredictionForSession(sessionId, {
          predictions: [],
          index: 0,
          state: 'loading',
          error: '',
          thinking: '',
          streamingContent: '',
        })
        scheduleAIPrediction(nextHistory, sessionSettingsRef.current.aiPredictionTriggerDelayMs, sessionId)
      }
    }
  }

  const scheduleAIPrediction = (
    history = commandHistoryRef.current,
    delayMs = defaultSettings.aiPredictionTriggerDelayMs,
    sessionId = activeSessionIdRef.current,
  ) => {
    if (!sessionId) {
      return
    }
    window.clearTimeout(pendingAIPredictionTimerRef.current[sessionId])
    pendingAIPredictionTimerRef.current[sessionId] = window.setTimeout(() => {
      delete pendingAIPredictionTimerRef.current[sessionId]
      void requestAIPredictions(history, sessionId)
    }, delayMs)
  }

  const formatAIPredictionRawPreview = (content: string, thinking: string) => {
    const parts: string[] = []
    if (content.trim()) {
      parts.push(`content:\n${content.trim()}`)
    }
    if (thinking.trim()) {
      parts.push(`thinking:\n${thinking.trim()}`)
    }
    return truncateErrorDetail(parts.join('\n\n'))
  }

  useEffect(
    () => () => {
      Object.values(pendingAIPredictionTimerRef.current).forEach((timer) => window.clearTimeout(timer))
    },
    [],
  )

  const requestAIPredictions = async (
    history = commandHistoryRef.current,
    sessionId = activeSessionIdRef.current,
    options: { manual?: boolean } = {},
  ) => {
    const normalized = normalizeAppSettings(sessionSettingsRef.current)
    const existingPrediction = getAIPredictionForSession(sessionId)
    const inFlightRequestID = aiPredictionInFlightRef.current[sessionId]
    const session = sessionsRef.current.find((item) => item.id === sessionId)
    const host = hostsRef.current.find((item) => item.id === session?.hostId)
    if (
      !normalized.aiEnabled ||
      !aiEnabledRef.current ||
      (!normalized.aiPredictionEnabled && !options.manual) ||
      !session ||
      !host ||
      Boolean(agentWaitersRef.current[sessionId])
    ) {
      if (!inFlightRequestID || existingPrediction.state !== 'loading') {
        clearAIPrediction({ sessionId })
      }
      return
    }
    if (inFlightRequestID) {
      return
    }
    const activeModel = aiModelConfigsRef.current.find((model) => model.id === activeAIPredictionModelIdRef.current) ?? aiModelConfigsRef.current[0] ?? null
    if (!activeModel?.baseUrl.trim() || !activeModel.model.trim()) {
      updateAIPredictionForSession(sessionId, {
        predictions: [],
        index: 0,
        state: 'error',
        error: '请先在设置中填写大模型地址和模型',
        thinking: '',
        streamingContent: '',
      })
      return
    }

    const requestID = (aiPredictionRequestRef.current[sessionId] ?? 0) + 1
    aiPredictionRequestRef.current[sessionId] = requestID
    aiPredictionInFlightRef.current[sessionId] = requestID
    updateAIPredictionForSession(sessionId, {
      predictions: [],
      index: 0,
      state: 'loading',
      error: '',
      thinking: '',
      streamingContent: '',
    })

    const compactHistory = compactCommandHistoryForAI(history, normalized.aiPredictionCommandHistoryLimit).reverse()
    const payload: AIPredictionRequest = {
      modelId: activeModel.id,
      baseUrl: activeModel.baseUrl,
      apiKey: activeModel.apiKey,
      model: activeModel.model,
      provider: activeModel.provider,
      thinkingEnabled: activeModel.thinkingEnabled,
      timeoutSeconds: normalized.aiPredictionProviderTimeoutSeconds,
      predictionCount: normalized.aiPredictionCount,
      includeThinking: normalized.aiPredictionThinkingEnabled,
      terminalContext: terminalContextTail(terminalCachesRef.current[session.id], normalized.aiPredictionTerminalContextLimit),
      commandHistory: compactHistory,
      currentCommand: commandBufferRef.current,
      hostName: session.hostName,
      hostAddress: host.address,
      username: host.username,
    }
    const predictionCacheKey = JSON.stringify({
      modelId: payload.modelId,
      thinkingEnabled: payload.thinkingEnabled,
      includeThinking: payload.includeThinking,
      predictionCount: payload.predictionCount,
      hostName: payload.hostName,
      currentCommand: (payload.currentCommand ?? '').trim(),
      commandHistory: compactHistory,
      terminalContext: payload.terminalContext,
    })
    const cachedPrediction = aiPredictionCacheRef.current[sessionId]
    if (cachedPrediction && cachedPrediction.key === predictionCacheKey && cachedPrediction.commands.length > 0) {
      aiPredictionCursorRef.current[sessionId] = 0
      aiPredictionCycleStartedRef.current[sessionId] = false
      updateAIPredictionForSession(sessionId, {
        predictions: cachedPrediction.commands,
        index: 0,
        state: 'success',
        error: '',
        thinking: cachedPrediction.thinking,
        streamingContent: '',
      })
      if (activeSessionIdRef.current === sessionId) {
        schedulePredictionGhostPositionUpdate()
      }
      return
    }
    const requestCommand = history[0] ?? ''
    const hasNewerPredictionCommand = () => {
      const nextCommand = pendingAIPredictionCommandRef.current[sessionId]
      return Boolean(nextCommand && nextCommand !== requestCommand)
    }

    let failedStatus: number | undefined
    let failedDetail = '这是调用 Go core 的 /api/ai/predict 接口失败。通常表示 Go core 调用大模型 provider 失败、provider 返回内容无法解析，或模型没有返回有效 commands。可在“工具 -> 日志”里查看 source=ai 的详细响应片段。'
    let rawPredictionContent = ''
    let rawPredictionThinking = ''
    try {
      const response = await apiFetch(AI_PREDICT_STREAM_API_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        failedStatus = response.status
        const detail = await readResponseErrorDetail(response)
        failedDetail = detail || failedDetail
        throw new Error(detail || `AI 预测请求失败：${response.status}`)
      }
      let commands: string[] = []
      await readSSEStream(response, (event) => {
        if (aiPredictionIgnoredRequestRef.current[sessionId] === requestID) {
          return
        }
        if (event.type === 'thinking' && event.text && normalized.aiPredictionThinkingEnabled) {
          rawPredictionThinking += event.text
          updateAIPredictionForSession(sessionId, (current) => ({
            ...current,
            thinking: `${current.thinking}${event.text}`,
          }))
        }
        if (event.type === 'content' && event.text) {
          rawPredictionContent += event.text
          updateAIPredictionForSession(sessionId, (current) => ({
            ...current,
            streamingContent: `${current.streamingContent}${event.text}`,
          }))
        }
        if (event.type === 'done') {
          commands = normalizePredictedCommands(event.commands, normalized.aiPredictionCount)
        }
        if (event.type === 'error') {
          failedDetail = event.error || failedDetail
        }
      })
      if (aiPredictionIgnoredRequestRef.current[sessionId] === requestID) {
        return
      }
      if (commands.length === 0) {
        const rawPreview = formatAIPredictionRawPreview(rawPredictionContent, rawPredictionThinking)
        failedDetail = rawPreview
          ? `${failedDetail}\n\n模型返回片段：\n${rawPreview}`
          : failedDetail || 'Go core 流式预测结束后没有返回可执行命令。'
        throw new Error('AI 返回的预测命令无效，已过滤结构化残片')
      }
      if (hasNewerPredictionCommand()) {
        return
      }
      aiPredictionCursorRef.current[sessionId] = 0
      aiPredictionCycleStartedRef.current[sessionId] = false
      aiPredictionCacheRef.current[sessionId] = {
        key: predictionCacheKey,
        commands,
        thinking: rawPredictionThinking,
        content: rawPredictionContent,
      }
      updateAIPredictionForSession(sessionId, {
        predictions: commands,
        index: 0,
        state: 'success',
        error: '',
        streamingContent: '',
      })
      if (pendingAIPredictionCommandRef.current[sessionId] === requestCommand) {
        delete pendingAIPredictionCommandRef.current[sessionId]
      }
      clearErrorForRequest(AI_PREDICT_STREAM_API_PATH, 'POST')
      if (activeSessionIdRef.current === sessionId) {
        schedulePredictionGhostPositionUpdate()
      }
    } catch (error) {
      if (aiPredictionIgnoredRequestRef.current[sessionId] === requestID) {
        return
      }
      if (hasNewerPredictionCommand()) {
        return
      }
      updateAIPredictionForSession(sessionId, {
        predictions: [],
        index: 0,
        state: 'error',
        error: error instanceof Error ? error.message : 'AI 预测失败',
        streamingContent: rawPredictionContent,
        thinking: rawPredictionThinking || getAIPredictionForSession(sessionId).thinking,
      })
      delete pendingAIPredictionCommandRef.current[sessionId]
      appendLog('warn', 'ui.ai', 'prediction failed', {
        error: error instanceof Error ? error.message : String(error),
        model: activeModel.model,
        endpoint: activeModel.baseUrl,
        predictionCount: normalized.aiPredictionCount,
        terminalContextChars: payload.terminalContext.length,
        commandHistoryCount: payload.commandHistory.length,
        contentSnippet: rawPredictionContent.slice(0, 1200),
        thinkingSnippet: rawPredictionThinking.slice(0, 1200),
      })
      if (pendingAIPredictionCommandRef.current[sessionId] === requestCommand) {
        delete pendingAIPredictionCommandRef.current[sessionId]
      }
      setErrorMessage(error instanceof Error ? error.message : 'AI 预测失败', {
        title: 'AI 预测请求失败',
        method: 'POST',
        path: displayApiPath(AI_PREDICT_STREAM_API_PATH),
        source: 'AI 大模型',
        status: failedStatus,
        detail: failedDetail,
      })
    } finally {
      if (aiPredictionInFlightRef.current[sessionId] === requestID) {
        delete aiPredictionInFlightRef.current[sessionId]
        if (aiPredictionIgnoredRequestRef.current[sessionId] === requestID) {
          delete aiPredictionIgnoredRequestRef.current[sessionId]
        }
        const nextCommand = pendingAIPredictionCommandRef.current[sessionId]
        if (
          nextCommand &&
          nextCommand !== requestCommand &&
          normalized.aiEnabled &&
          normalized.aiPredictionEnabled &&
          !agentWaitersRef.current[sessionId]
        ) {
          scheduleAIPrediction(commandHistoryRef.current, normalized.aiPredictionTriggerDelayMs, sessionId)
        }
      }
    }
  }

  const triggerManualAIPrediction = (sessionId = activeSessionIdRef.current) => {
    if (!sessionId) {
      return
    }
    const session = sessionsRef.current.find((item) => item.id === sessionId)
    if (!session) {
      return
    }
    if (session.status !== 'connected') {
      setErrorMessage('当前 SSH 会话已断开，请点击重连后再触发 AI 预测')
      return
    }
    window.clearTimeout(pendingAIPredictionTimerRef.current[sessionId])
    delete pendingAIPredictionTimerRef.current[sessionId]
    void requestAIPredictions(commandHistoryRef.current, sessionId, { manual: true })
  }

  const buildAIContextPayload = (sessionId = activeSessionIdRef.current) => {
    const normalized = normalizeAppSettings(sessionSettingsRef.current)
    const session = sessionsRef.current.find((item) => item.id === sessionId)
    const host = hostsRef.current.find((item) => item.id === session?.hostId)
    return {
      normalized,
      session,
      host,
      terminalContext: session
        ? terminalContextTail(terminalCachesRef.current[session.id], normalized.aiTerminalContextLimit)
        : '',
      commandHistory: compactCommandHistoryForAI(commandHistoryRef.current, normalized.aiCommandHistoryLimit).reverse(),
    }
  }

  const selectAIConversationWithBinding = (
    conversationId: string,
    options: { sessionId?: string; resetAgentState?: boolean; bindToSession?: boolean } = {},
  ) => selectAIConversation(conversationId, options, setPreviewConversationId)

  const confirmDeleteAIConversation = (conversationId: string) => {
    const conversation = aiConversations.find((item) => item.id === conversationId)
    requestConfirm({
      section: 'AI 对话',
      title: '删除历史对话',
      message: `确认删除对话“${conversation?.title ?? '未命名对话'}”吗？`,
      detail: '对应的本地消息记录也会从数据库删除。',
      confirmText: '删除',
      danger: true,
      onConfirm: () =>
        removeAIConversation(conversationId, async (nextConversationId, sessionId) => {
          await selectAIConversationWithBinding(nextConversationId, { sessionId, resetAgentState: false, bindToSession: false })
        }),
    })
  }

  const requestAIAssistStream = async (
    prompt: string,
    options: Partial<AIAssistRequest> & {
      conversationId?: string
      ignoreAmbientContext?: boolean
      ignoreConversationContext?: boolean
      suppressStreamingMessages?: boolean
    } = {},
    sessionId = activeSessionIdRef.current,
  ): Promise<AIAssistResponse> => {
    const { normalized, session, host, terminalContext, commandHistory } = buildAIContextPayload(sessionId)
    if (!normalized.aiEnabled || !normalized.aiAgentEnabled || !aiAgentEnabledRef.current) {
      throw new Error('AI Agent 已关闭，请先在设置中开启')
    }
    const activeModel = activeAIAgentModelConfig
    if (!activeModel?.baseUrl.trim() || !activeModel.model.trim()) {
      throw new Error('请先在设置中填写大模型地址和模型')
    }
    const { conversationId, ignoreAmbientContext, ignoreConversationContext, suppressStreamingMessages, ...requestOptions } = options
    const activeConversation = conversationId || activeAIConversationIdRef.current
    const assistContextMode = activeModel.assistContextMode ?? 'compact'
    const assistContextWindow = Math.max(2, Math.min(64, Number(activeModel.assistContextWindow ?? 6) || 6))
    const recentContext = ignoreConversationContext ? '' : normalizeAITextBlock(recentConversationContext(activeConversation, assistContextWindow), 4000)
    const agentSteps = [...(requestOptions.agentSteps ?? getAgentStepsForSession(sessionId))].reverse()
    const selectedInlineText = ignoreAmbientContext ? '' : normalizeAITextBlock(window.getSelection()?.toString() ?? '', 4000)
    const conversationMessages: AIAssistConversationMessage[] = ignoreConversationContext || assistContextMode !== 'history'
      ? []
      : aiMessagesRef.current
        .filter(
          (message) =>
            message.conversationId === activeConversation &&
            !message.pending &&
            ['user', 'assistant', 'command', 'agent_result'].includes(message.kind),
        )
        .slice(-assistContextWindow)
        .map((message): AIAssistConversationMessage => ({
          role: message.kind === 'user' ? 'user' : 'assistant',
          content: normalizeAITextBlock(message.content, 4000),
        }))
        .filter((message) => message.content)
    const payload: AIAssistRequest = {
      baseUrl: activeModel.baseUrl,
      apiKey: activeModel.apiKey,
      model: activeModel.model,
      provider: activeModel.provider,
      agentThinkingEnabled: normalized.aiAgentThinkingEnabled && activeModel.thinkingEnabled,
      timeoutSeconds: normalized.aiProviderTimeoutSeconds,
      systemPrompt: normalized.aiSystemPrompt,
      systemPromptOverride: normalized.aiSystemPromptOverride,
      prompt,
      terminalContext,
      selectedText: normalizeAITextBlock(
        [
          selectedInlineText,
          recentContext ? `Recent conversation:\n${recentContext}` : '',
        ]
          .filter((item) => item.trim())
          .join('\n\n'),
        8000,
      ),
      commandHistory: ignoreAmbientContext ? [] : commandHistory,
      currentCommand: ignoreAmbientContext ? '' : commandBufferRef.current,
      cwd: ignoreAmbientContext ? '' : filePathRef.current,
      hostName: session?.hostName,
      hostAddress: host?.address,
      username: host?.username,
      agentMode: requestOptions.agentMode ?? getSessionAgentState(sessionId).mode,
      agentGoal: requestOptions.agentGoal ?? resolveAgentGoal(prompt, sessionId),
      agentSteps,
      selectedSkills: selectedAISkills,
      contextMode: assistContextMode,
      conversationMessages,
      ...requestOptions,
    }
    const response = await apiFetch(AI_ASSIST_STREAM_API_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const detail = await readResponseErrorDetail(response)
      throw new Error(detail || `AI 请求失败：${response.status}`)
    }
    let finalResponse: AIAssistResponse | null = null
    let streamError = ''
    await readSSEStream(response, (event) => {
      if (event.type === 'thinking' && event.text) {
        if (!suppressStreamingMessages) {
          aiStreamThinkingRef.current = `${aiStreamThinkingRef.current}${event.text}`
          setAiStreamThinking((current) => `${current}${event.text}`)
          updateStreamingThinkingMessage(event.text, conversationId)
        }
      }
      if (event.type === 'content' && event.text) {
        if (!suppressStreamingMessages) {
          aiStreamContentRef.current = `${aiStreamContentRef.current}${event.text}`
          setAiStreamContent((current) => `${current}${event.text}`)
          updateStreamingContentMessage(event.text, conversationId)
        }
      }
      if (event.type === 'done' && event.response) {
        finalResponse = event.response
      }
      if (event.type === 'error') {
        streamError = event.error || 'AI 流式请求失败'
      }
    })
    if (streamError) {
      throw new Error(streamError)
    }
    if (!finalResponse) {
      throw new Error('AI 没有返回最终结果')
    }
    clearErrorForRequest(AI_ASSIST_STREAM_API_PATH, 'POST')
    return finalResponse
  }

  const requestAIUnifiedStream = (prompt: string, options: Partial<AIAssistRequest> = {}) => {
    return requestAIAssistStream(
      prompt,
      {
        agentMode: activeAgentMode,
        agentGoal: prompt,
        agentSteps,
        ...options,
      },
    )
  }

  const addAgentStepFromAIResponse = (
    response: AIAssistResponse,
    sessionId = activeSessionIdRef.current,
    conversationId = getLiveConversationId(sessionId) || activeAIConversationIdRef.current,
  ) => {
    const command = stripTerminalControlSequences(response.agentCommand || firstString(response.commands)).trim()
    if (response.agentStatus === 'done') {
      updateSessionAgentState(sessionId, {
        running: false,
        state: 'success',
        message: '',
      })
      return
    }
    if (response.agentStatus === 'question' || !command) {
      if (response.agentStatus === 'question') {
        updateSessionAgentState(sessionId, {
          running: false,
          state: 'idle',
          message: '',
        })
      }
      return
    }
    if (response.agentStatus !== 'command') {
      return
    }
    const riskLevel = response.riskLevel || classifyCommandRisk(command)
    const step: AIAgentPlanStep = {
      id: `step-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      command,
      status: 'pending',
      sessionId,
      explanation: response.agentReason || response.answer,
      riskLevel,
      riskReason: response.riskReason,
      createdAt: new Date().toISOString(),
    }
    const currentAgentState = getSessionAgentState(sessionId)
    updateSessionAgentState(sessionId, {
      state: 'success',
      message: response.answer || response.agentReason || 'AI 已给出下一步命令',
    })
    if (currentAgentState.mode === 'review' || !currentAgentState.running) {
      updateSessionAgentState(sessionId, { running: false })
      return
    }
    void appendAIMessage('agent_step', command, { step }, conversationId).then((message) => {
      const messageStep = { ...step, id: message.id }
      setAgentStepsForSession(sessionId, (current) => [messageStep, ...current].slice(0, 30))
      const latestAgentState = getSessionAgentState(sessionId)
      if (
        latestAgentState.running &&
        (latestAgentState.mode === 'full-auto' || (latestAgentState.mode === 'auto' && riskLevel !== 'high'))
      ) {
        updateSessionAgentState(sessionId, { running: true })
        void executeAgentStep(messageStep.id, true, true)
      } else if (riskLevel === 'high') {
        updateSessionAgentState(sessionId, {
          running: false,
          pendingStepId: messageStep.id,
          message: '检测到高风险命令，请人工确认后执行',
        })
      }
    })
  }

  const runUnifiedAI = async () => {
    if (aiAssistantState === 'loading' || !settings.aiEnabled || !settings.aiAgentEnabled) {
      return
    }
    const sessionId = activeSessionIdRef.current
    const prompt = aiUnifiedPrompt.trim()
    const selectedText = window.getSelection()?.toString().trim() ?? ''
    const requestPrompt = prompt || selectedText
    if (!prompt && !selectedText) {
      setAiAssistantError('请输入问题、目标，或先选中终端文本')
      return
    }
    let conversationId = activeAIConversationIdRef.current
    try {
      conversationId = await ensureAIConversation(requestPrompt.slice(0, 24) || t('aiWorkspace.newConversation'), sessionId)
    } catch (error) {
      setAiAssistantError(error instanceof Error ? error.message : '创建 AI 对话失败')
      return
    }
    setAiAssistantState('loading')
    setAiAssistantError('')
    setAiAssistantResponse(null)
    resetAIStreamBuffers()
    updateSessionAgentState(sessionId, { message: '' })
    setAiUnifiedPrompt('')
    await appendAIMessage('user', requestPrompt, {}, conversationId)
    updateSessionAgentState(sessionId, (current) => ({
      ...current,
      goal: requestPrompt,
      running: current.mode !== 'review',
    }))
    try {
      const response = await requestAIUnifiedStream(requestPrompt)
      response.commands = normalizeAssistCommands(response.commands)
      setAiAssistantResponse(response)
      setAiAssistantState('success')
      await persistStreamingArtifacts(conversationId)
      if (response.agentStatus === 'command' && normalizeAssistCommands(response.commands).length > 0) {
        await appendAIMessage('command', response.answer || response.agentReason || 'AI 已生成可执行命令。', { response }, conversationId)
      } else {
        await appendAIMessage('assistant', response.answer || response.summary || response.agentReason || 'AI 已返回结果。', { response }, conversationId)
      }
      addAgentStepFromAIResponse(response, sessionId, conversationId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 请求失败'
      await appendAIMessage('error', message, {}, conversationId)
      const detail =
        message.includes('404') || message.includes('not found')
          ? 'AI provider 返回 404。请先检查当前启用模型的地址是否为 OpenAI 兼容地址；Ollama 需要填写到 /v1，例如 http://111.4.141.154:41000/v1。只填 host:port 会请求 /chat/completions，常见结果就是 404。'
          : '这是通过 Go core 调用大模型的统一 AI 接口失败，可在“工具 -> 日志”搜索 source=ai 查看详情。'
      setAiAssistantState('error')
      setErrorMessage(message, {
        title: 'AI 请求失败',
        method: 'POST',
        path: displayApiPath(AI_ASSIST_STREAM_API_PATH),
        source: 'AI 大模型',
        detail,
      })
    }
  }
  const {
    aiUnifiedInputPlaceholder,
    aiUnifiedInputValue,
    submitAiUnifiedInput,
    updateAiUnifiedInputValue,
  } = useAIUnifiedInput({
    aiUnifiedPrompt,
    batchActive,
    batchMode,
    batchSelectedHostCount: batchSelectedHostIds.length,
    batchTask,
    onRunUnifiedAI: runUnifiedAI,
    onSetAiUnifiedPrompt: setAiUnifiedPrompt,
    onSetBatchTask: setBatchTask,
    onStartBatchExecution: startBatchExecution,
  })

  const requestAgentNextStep = async (steps = getAgentStepsForSession(activeSessionIdRef.current), sessionId = activeSessionIdRef.current) => {
    const goal = resolveAgentGoal('', sessionId)
    const batchHost = findBatchHostBySession(sessionId)
    const isBatchSession = Boolean(batchHost)
    const batchConversationId = isBatchSession ? batchConversationIdRef.current : ''
    const liveConversationId = isBatchSession ? batchConversationId : getLiveConversationId(sessionId) || activeAIConversationIdRef.current
    const batchHostName = batchHost?.hostName || sessionsRef.current.find((item) => item.id === sessionId)?.hostName || '服务器'
    const batchPrefix = isBatchSession ? `【${batchHostName}】` : ''
    if (!goal) {
      updateSessionAgentState(sessionId, {
        message: '请先输入任务目标，或先让 AI 生成一个命令',
        running: false,
      })
      return
    }
    const session = sessionsRef.current.find((item) => item.id === sessionId)
    if (!session || session.status !== 'connected') {
      appendLog('warn', 'ui.agent', 'agent next step skipped because session is unavailable', {
        sessionID: sessionId,
        status: session?.status,
      })
      return
    }
    updateSessionAgentState(sessionId, { state: 'loading' })
    resetAIStreamBuffers()
    updateSessionAgentState(sessionId, { message: '正在让 Agent 规划下一步...' })
    try {
      const response = await requestAIAssistStream(
        goal,
        {
          conversationId: liveConversationId,
          agentGoal: goal,
          agentMode: getSessionAgentState(sessionId).mode,
          agentSteps: steps,
          ignoreConversationContext: isBatchSession,
          suppressStreamingMessages: isBatchSession,
        },
        sessionId,
      )
      if (response.agentStatus === 'done') {
        updateSessionAgentState(sessionId, {
          state: 'success',
          running: false,
        })
        if (isBatchSession) {
          await appendAIMessage(
            'agent_result',
            `${batchPrefix} ${response.answer || response.summary || response.agentReason || '已根据命令输出生成执行结论。'}`,
            { response },
            batchConversationId,
          )
        } else {
          await persistStreamingArtifacts(liveConversationId)
          await appendAIMessage('agent_result', response.answer || response.summary || response.agentReason || '已根据命令输出生成执行结论。', { response }, liveConversationId)
        }
        updateSessionAgentState(sessionId, { message: '已根据命令输出生成执行结论。' })
        return
      }
      if (response.agentStatus === 'question' || !response.agentCommand) {
        updateSessionAgentState(sessionId, {
          state: 'idle',
          running: false,
        })
        if (isBatchSession) {
          await appendAIMessage(
            'agent_result',
            `${batchPrefix} ${response.answer || response.agentReason || 'AI 需要更多信息。'}`,
            { response },
            batchConversationId,
          )
        } else {
          await persistStreamingArtifacts(liveConversationId)
          await appendAIMessage('agent_result', response.answer || response.agentReason || 'AI 需要更多信息。', { response }, liveConversationId)
        }
        updateSessionAgentState(sessionId, { message: 'AI 需要更多信息，已生成说明。' })
        return
      }
      const command = stripTerminalControlSequences(response.agentCommand).trim()
      const riskLevel = response.riskLevel || classifyCommandRisk(command)
      const step: AIAgentPlanStep = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        command,
        status: 'pending',
        sessionId,
        explanation: isBatchSession
          ? `${batchPrefix} ${response.agentReason || response.answer || 'Agent 已给出下一步命令'}`
          : response.agentReason || response.answer,
        riskLevel,
        riskReason: response.riskReason,
        createdAt: new Date().toISOString(),
      }
      updateSessionAgentState(sessionId, { state: 'success' })
      if (!isBatchSession) {
        await persistStreamingArtifacts(liveConversationId)
        await appendAIMessage('command', response.answer || response.agentReason || 'Agent 已给出下一步命令。', { response }, liveConversationId)
      }
      const latestAgentState = getSessionAgentState(sessionId)
      if (latestAgentState.mode === 'review' || !latestAgentState.running) {
        updateSessionAgentState(sessionId, {
          running: false,
          message: response.answer || response.agentReason || 'Agent 已给出下一步命令，等待人工执行。',
        })
        return
      }
      if (isBatchSession) {
        const stepMessage = await appendAIMessage('agent_step', command, { step }, batchConversationId)
        step.id = stepMessage.id
      } else {
        const stepMessage = await appendAIMessage('agent_step', command, { step }, liveConversationId)
        step.id = stepMessage.id
      }
      setAgentStepsForSession(sessionId, [step, ...steps].slice(0, 30))
      updateSessionAgentState(sessionId, {
        message: response.answer || response.agentReason || 'Agent 已给出下一步命令',
      })
      const latestAutoState = getSessionAgentState(sessionId)
      if (
        latestAutoState.running &&
        (latestAutoState.mode === 'full-auto' || (latestAutoState.mode === 'auto' && riskLevel !== 'high'))
      ) {
        updateSessionAgentState(sessionId, { running: true })
        void executeAgentStep(step.id, true, true)
      } else if (riskLevel === 'high') {
        updateSessionAgentState(sessionId, {
          running: false,
          pendingStepId: step.id,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent 请求失败'
      updateSessionAgentState(sessionId, {
        state: 'error',
        message,
        running: false,
      })
      if (isBatchSession) {
        void appendAIMessage('agent_result', `${batchPrefix} Agent 请求失败：${message}`, {}, batchConversationId)
      }
      setErrorMessage(message, {
        title: 'Agent 请求失败',
        method: 'POST',
        path: displayApiPath(AI_ASSIST_STREAM_API_PATH),
        source: 'AI 大模型',
      })
    }
  }

  const continueAgentTask = (sessionId = activeSessionIdRef.current) => {
    updateSessionAgentState(sessionId, { running: true })
    void requestAgentNextStep(getAgentStepsForSession(sessionId), sessionId)
  }

  const stopAgentTask = (sessionId = activeSessionIdRef.current) => {
    updateSessionAgentState(sessionId, {
      running: false,
      state: 'idle',
      message: 'Agent 已停止',
      pendingStepId: '',
    })
    clearAgentWaiter(sessionId)
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

  const setActivePredictionIndex = (index: number) => {
    const sessionId = activeSessionIdRef.current
    if (!sessionId) {
      return
    }
    updateAIPredictionForSession(sessionId, { index })
  }

  const cyclePrediction = () => {
    const sessionId = activeSessionIdRef.current
    const sessionPrediction = getAIPredictionForSession(sessionId)
    if (commandBufferRef.current.trim() || sessionPrediction.predictions.length === 0) {
      return
    }
    const nextIndex = aiPredictionCycleStartedRef.current[sessionId]
      ? ((aiPredictionCursorRef.current[sessionId] ?? 0) + 1) % sessionPrediction.predictions.length
      : 0
    aiPredictionCycleStartedRef.current[sessionId] = true
    aiPredictionCursorRef.current[sessionId] = nextIndex
    setActivePredictionIndex(nextIndex)
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
      if (data === '\u001b[Z') {
        triggerManualAIPrediction(activeSession.id)
        return
      }
      if (data === '\t' && activePredictions.length > 0 && !commandBufferRef.current.trim()) {
        cyclePrediction()
        return
      }
      const isEnter = data === '\r' || data === '\n' || data === '\r\n'
      if (isEnter && primaryPrediction && !commandBufferRef.current.trim()) {
        const command = primaryPrediction
        writeCommand(command)
        setCommandDraft(activeSession.id, '')
        clearAIPrediction({ cancelPending: false, sessionId: activeSession.id })
        queueSessionInput(activeSession.id, '\r')
        return
      }
      if (!isEnter && data !== '\u0003') {
        clearAIPrediction()
      }
      observeTerminalInput(activeSession.id, data)
      queueSessionInput(activeSession.id, data)
    })

    return () => {
      disposable.dispose()
    }
  }, [
    activeSession,
    activeSession?.status,
    primaryPrediction,
    activePredictions,
    activePredictionIndex,
    settings.aiEnabled,
    settings.aiPredictionEnabled,
  ])

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
    void loadSystemInfo()
    if (!activeSession?.hostId || activeSession.hostId === 'local-demo') {
      return
    }

    const interval = window.setInterval(
      () => void loadServerMetrics(),
      Math.max(1, settings.metricsRefreshIntervalSeconds) * 1000,
    )
    return () => window.clearInterval(interval)
  }, [activeSession?.hostId, settings.metricsRefreshIntervalSeconds, settings.metricsHistoryWindowMinutes])

  const closeSession = async (session: SessionRecord) => {
    requestConfirm({
      section: 'SSH 会话',
      title: '关闭会话',
      message: `确定关闭「${session.hostName}」会话吗？`,
      confirmText: '关闭',
      danger: true,
      onConfirm: () => closeSessionNow(session),
    })
  }

  const copySessionSSHInfoWithFeedback = async (session: SessionRecord) => {
    try {
      const text = await copySessionSSHInfo(session)
      updateSessionAgentState(session.id, { message: `已复制 SSH 信息：${text}` })
    } catch (error) {
      const message = error instanceof Error ? error.message : '复制 SSH 信息失败'
      setErrorMessage(message, {
        title: '复制失败',
        method: 'COPY',
        path: 'clipboard',
        source: '浏览器剪贴板',
      })
    }
  }

  const writeCommand = (command: string) => {
    xtermRef.current?.focus()
    if (activeSession) {
      if (activeSession.status !== 'connected') {
        setErrorMessage('当前 SSH 会话已断开，请点击重连后继续输入')
        return
      }
      setActiveViewId(`session:${activeSession.id}`)
      const next = commandBufferRef.current + command
      commandBufferRef.current = next
      setSessionCommandDraft(activeSession.id, next)
      queueSessionInput(activeSession.id, command)
    }
  }

  const executeCommandToSession = (
    command: string,
    targetSessionId = activeSession?.id ?? '',
    options: { preserveActiveView?: boolean } = {},
  ) => {
    const normalized = stripTerminalControlSequences(command).trim()
    const session = sessionsRef.current.find((item) => item.id === targetSessionId)
    if (!normalized || !session) {
      return
    }
    if (session.status !== 'connected') {
      setErrorMessage('当前 SSH 会话已断开，请点击重连后继续执行')
      return
    }
    clearAIPrediction()
    if (!options.preserveActiveView) {
      xtermRef.current?.focus()
      setActiveViewId(`session:${session.id}`)
    }
    const sessionDraft = terminalCachesRef.current[session.id]?.commandDraft ?? ''
    const input = `${sessionDraft ? '\u0015' : ''}${normalized}\r`
    if (session.id === activeSessionIdRef.current) {
      commandBufferRef.current = ''
    }
    setSessionCommandDraft(session.id, '')
    queueSessionInput(session.id, input)
  }

  const executeCommand = (command: string, targetSessionId = activeSession?.id ?? '') => {
    executeCommandToSession(command, targetSessionId)
  }

  const copyCommand = async (command: string) => {
    const normalized = stripTerminalControlSequences(command).trim()
    if (!normalized) {
      return
    }
    try {
      await navigator.clipboard.writeText(normalized)
      clearErrorForRequest('clipboard', 'COPY')
      appendLog('debug', 'ui.commands', 'command copied', { chars: normalized.length })
    } catch (error) {
      const message = error instanceof Error ? error.message : '复制命令失败'
      appendLog('warn', 'ui.commands', 'command copy failed', { error: message })
      setErrorMessage(message, {
        title: '复制命令失败',
        method: 'COPY',
        path: 'clipboard',
        source: '命令卡片',
      })
    }
  }

  const executeAICommand = async (command: string, riskLevel?: AIRiskLevel, confirmed = false) => {
    const normalized = stripTerminalControlSequences(command).trim()
    if (!normalized) {
      return
    }
    const sessionId = activeSessionIdRef.current
    const conversationId = getLiveConversationId(sessionId) || activeAIConversationIdRef.current
    const normalizedRisk = riskLevel || classifyCommandRisk(normalized)
    if (normalizedRisk === 'high' && !confirmed && getSessionAgentState(sessionId).mode !== 'full-auto') {
      requestConfirm({
        section: 'AI 命令',
        title: '确认高风险命令',
        message: 'AI 生成的命令风险较高，确认执行吗？',
        detail: normalized,
        confirmText: '确认执行',
        danger: true,
        onConfirm: () => executeAICommand(normalized, riskLevel, true),
      })
      return
    }
    const goal = resolveAgentGoal(`执行命令并根据结果回答用户：${normalized}`, sessionId)
    updateSessionAgentState(sessionId, (current) => ({
      ...current,
      goal,
      running: true,
      message: '命令已发送到终端，执行完成后会继续读取结果并让 AI 判断下一步。',
    }))
    const lastCommandMessage = [...aiMessagesRef.current].reverse().find((message) => message.kind === 'command' && message.response)
    const commandResponse = lastCommandMessage?.response
    const step: AIAgentPlanStep = {
      id: `step-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      command: normalized,
      status: 'pending',
      sessionId,
      explanation: commandResponse?.answer || commandResponse?.agentReason || aiAssistantResponse?.answer || aiAssistantResponse?.agentReason || '用户已确认执行 AI 生成命令',
      riskLevel: normalizedRisk,
      riskReason: commandResponse?.riskReason || aiAssistantResponse?.riskReason,
      createdAt: new Date().toISOString(),
    }
    const stepMessage = await appendAIMessage('agent_step', normalized, { step }, conversationId)
    step.id = stepMessage.id
    setAgentStepsForSession(sessionId, (current) => [step, ...current].slice(0, 30))
    void executeAgentStep(step.id, getSessionAgentState(sessionId).mode !== 'review', true)
  }

  const updateAgentStep = (stepId: string, patch: Partial<AIAgentPlanStep>) => {
    const located = findAgentStepById(stepId)
    if (!located) {
      return
    }
    setAgentStepsForSession(located.sessionId, (current) =>
      current.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    )
  }

  const {
    agentWaitersRef,
    clearAgentWaiter,
    executeAgentStep,
    finishAgentStep,
  } = useAgentExecution({
    activeSessionIdRef,
    agentExitMarker,
    appendLog,
    classifyAgentCommandTimeout,
    classifyCommandRisk,
    clearAIPrediction,
    executeCommandToSession,
    extractAgentExitCode,
    findAgentStepById,
    getAgentStepsForSession,
    getSessionAgentState,
    normalizeAgentTimeoutSeconds: () => normalizeAppSettings(sessionSettingsRef.current).agentCommandTimeoutSeconds,
    onRequestNextStep: (steps, sessionId) => {
      void requestAgentNextStep(steps, sessionId)
    },
    onStepCompleted: (stepId, completedStep) => {
      replaceAndPersistAIMessage(stepId, { content: completedStep.command, step: completedStep })
    },
    setAgentStatusMessage,
    sessionsRef,
    stripAgentMarker,
    terminalContextTail,
    terminalCachesRef,
    updateAgentStep,
    updateSessionAgentState,
    waitForSessionConnected,
    wrapAgentCommand,
  })
  const {
    closeAllSessionStreams,
    closeSessionStream,
    eventSourcesRef,
    markSessionDisconnected,
    openSessionStream,
  } = useSessionStreams({
    activeSessionIdRef,
    agentWaitersRef,
    appendLog,
    appendQueryParam,
    appendSessionTerminalOutput,
    clearAIPrediction,
    desktopTokenRef,
    finishAgentStep,
    inputQueuesRef,
    isTauriRuntime,
    leftModeRef,
    loadFiles,
    pendingResizeRef,
    recordCommand,
    resolveApiStreamUrl,
    sessionsRef,
    setErrorMessage: (message) => setErrorMessage(message),
    setSessions,
    setTrackedFilePath,
    trackTerminalPathRef,
    updateAlternateScreenMode,
  })
  const {
    activateSession,
    closeAllSessions,
    closeOtherSessions,
    closeSessionNow,
    closeSessionsToRight,
    copySessionSSHInfo,
    createSession,
    reconnectSession,
  } = useSessionLifecycle({
    activeSessionId,
    activeViewId,
    apiFetch,
    appendLog,
    appendSessionTerminalOutput,
    appendTerminalCache,
    clearAIPrediction,
    closeSessionStream,
    commandBufferRef,
    emptyTerminalCache,
    fitAddonRef,
    hostsRef,
    openSessionStream,
    previousMetricsRef,
    removeTerminalCache,
    replaceTerminalWithCache,
    schedulePredictionGhostPositionUpdate,
    selectedHostId,
    sessionRetainedLines: () => sessionSettingsRef.current.terminalRetainedLines,
    sessionsRef,
    setActiveSession,
    setErrorMessage,
    setFileEntries,
    setMetricHistory,
    setSelectedHostId,
    setServerMetrics,
    setSessions,
    setSystemInfo,
    setTerminalCaches,
    syncTerminalSize,
    terminalCachesRef,
    xtermRef,
  })

  const applyPrediction = () => {
    if (!primaryPrediction) {
      return
    }
    writeCommand(primaryPrediction)
    clearAIPrediction()
  }

  const renderMarkdown = (content: string, fallback = '') => (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || fallback}</ReactMarkdown>
    </div>
  )

  const toggleAIMessageCollapsed = (messageId: string) => {
    setCollapsedAIMessageIds((current) => ({ ...current, [messageId]: !current[messageId] }))
  }

  const renderAIMessageHeader = (messageId: string, label: string, createdAt: string, badge?: string, extra?: ReactNode) => {
    const collapsed = Boolean(collapsedAIMessageIds[messageId])
    return (
    <header className="ai-message-header">
      <button
        className="ai-message-toggle"
        type="button"
        title={collapsed ? '展开消息' : '折叠消息'}
        onClick={() => toggleAIMessageCollapsed(messageId)}
      >
        <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
        {badge ? <span className="ai-message-badge">{badge}</span> : null}
        <strong>{label}</strong>
      </button>
      <span className="ai-message-header-meta">
        <time dateTime={createdAt}>{formatFullDateTime(createdAt)}</time>
        {extra}
      </span>
    </header>
  )
  }

  const isAIMessageCollapsed = (messageId: string) => Boolean(collapsedAIMessageIds[messageId])
  const normalizedAgentMessage = agentMessage.trim()
  const isAgentMessageDuplicated = normalizedAgentMessage
    ? aiMessages.slice(-6).some((message) => {
      const candidates = [
        message.content,
        message.response?.answer,
        message.response?.summary,
        message.response?.agentReason,
        message.step?.command,
        message.step?.explanation,
        message.step?.riskReason,
      ]
      return candidates.some((candidate) => candidate?.trim() === normalizedAgentMessage)
    })
    : false
  const shouldRenderAgentMessageCard = Boolean(normalizedAgentMessage) && !isAgentMessageDuplicated

  const renderAIResponseMessage = (message: AIChatMessageDraft, label: string) => {
    const response = message.response
    const commands = normalizeAssistCommands(response?.commands)
    const collapsed = isAIMessageCollapsed(message.id)
    const messageKindClass = message.kind === 'command' ? 'message-command' : 'message-assistant'
    return (
      <article className={`ai-response-card ai-message-card ${messageKindClass} ${response?.agentStatus === 'command' ? `risk-${response.riskLevel ?? 'low'}` : ''}`}>
        {renderAIMessageHeader(message.id, label, message.createdAt, message.kind === 'command' ? 'CMD' : 'AI')}
        {!collapsed ? (
          <>
            {message.content ? renderMarkdown(message.content) : null}
            {response?.agentStatus === 'command' && response.riskLevel ? (
              <span className={`risk-badge risk-${response.riskLevel}`}>{riskLabel(response.riskLevel)}</span>
            ) : null}
            {response?.warnings?.map((warning) => <small key={warning}>{warning}</small>)}
            {commands.map((command, index) => {
              const favorited = isFavoriteCommand(command)
              return (
                <div className="command-row compact" key={`${message.id}-${index}-${command}`}>
                  <button className="command-main" type="button" title={`输入命令：${command}`} onClick={() => writeCommand(command)}>
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
                  <button className="copy-command-button" type="button" title={`复制命令：${command}`} onClick={() => void copyCommand(command)}>
                    ⧉
                  </button>
                  <button
                    className="execute-command-button"
                    disabled={!activeSession || activeSession.status !== 'connected'}
                    type="button"
                    title={`执行命令：${command}`}
                    onClick={() => void executeAICommand(command, response?.riskLevel)}
                  >
                    ↵
                  </button>
                </div>
              )
            })}
          </>
        ) : null}
      </article>
    )
  }

  const renderAIMessage = (message: AIChatMessageDraft) => {
    const collapsed = isAIMessageCollapsed(message.id)
    if (message.kind === 'user') {
      return (
        <article className="ai-message-card user-message" key={message.id}>
          {renderAIMessageHeader(message.id, '我', message.createdAt, 'YOU')}
          {!collapsed ? renderMarkdown(message.content) : null}
        </article>
      )
    }
    if (message.kind === 'thinking') {
      return (
        <article className="ai-stream-card ai-message-card message-thinking" key={message.id} data-ai-message-id={message.id}>
          {renderAIMessageHeader(message.id, '思考', message.createdAt, 'THINK')}
          {!collapsed ? renderMarkdown(message.content, '思考中...') : null}
        </article>
      )
    }
    if (message.kind === 'content') {
      return (
        <article className="ai-stream-card ai-message-card message-content" key={message.id}>
          {renderAIMessageHeader(message.id, '实时输出', message.createdAt, 'LIVE')}
          {!collapsed ? renderMarkdown(message.content) : null}
        </article>
      )
    }
    if (message.kind === 'command') {
      return <div key={message.id}>{renderAIResponseMessage(message, 'AI 命令')}</div>
    }
    if (message.kind === 'agent_result') {
      return (
        <article className="ai-response-card agent-final-card ai-message-card message-agent-result" key={message.id}>
          {renderAIMessageHeader(message.id, '执行结论', message.createdAt, 'DONE')}
          {!collapsed ? (
            <>
              {renderMarkdown(message.content)}
              {message.response?.warnings?.map((warning) => <small key={warning}>{warning}</small>)}
            </>
          ) : null}
        </article>
      )
    }
    if (message.kind === 'agent_step') {
      const step = message.step ? ({ ...message.step, id: message.id } as AIAgentPlanStep) : undefined
      const liveStep = step ? agentSteps.find((item) => item.id === step.id) : undefined
      const displayedStep = step && liveStep ? { ...step, ...liveStep } : step
      const stepSession = displayedStep?.sessionId ? sessions.find((session) => session.id === displayedStep.sessionId) : undefined
      const stepBatchHost = displayedStep?.sessionId
        ? batchHostResults.find((result) => result.sessionId === displayedStep.sessionId)
        : undefined
      const stepHostName = stepBatchHost?.hostName || stepSession?.hostName || ''
      const stepMeta = [stepHostName, displayedStep?.status ?? 'pending'].filter(Boolean).join(' · ')
      const canExecuteStep =
        displayedStep &&
        displayedStep.status !== 'executed' &&
        displayedStep.status !== 'running' &&
        activeSession &&
        activeSession.status === 'connected'
      return (
        <article className={`agent-step ai-message-card message-agent-step risk-${displayedStep?.riskLevel ?? 'low'}`} key={message.id}>
          {renderAIMessageHeader(
            message.id,
            `执行步骤 · ${riskLabel(displayedStep?.riskLevel)}`,
            message.createdAt,
            'STEP',
            <small>{stepMeta}</small>,
          )}
          {!collapsed ? (
            <>
              <code>{displayedStep?.command ?? message.content}</code>
              {displayedStep?.explanation ? renderMarkdown(displayedStep.explanation) : null}
              {displayedStep?.riskReason ? <small>{displayedStep.riskReason}</small> : null}
              {typeof displayedStep?.exitCode === 'number' ? <small>退出码：{displayedStep.exitCode}</small> : null}
              {displayedStep?.output ? <pre className="agent-step-output">{displayedStep.output}</pre> : null}
              {displayedStep ? (
                <div className="agent-step-actions">
                  <button
                    className="ai-icon-button"
                    type="button"
                    title={`复制 AI 命令：${displayedStep.command}`}
                    onClick={() => void copyCommand(displayedStep.command)}
                  >
                    ⧉
                  </button>
                  <button
                    className="ai-icon-button"
                    disabled={!canExecuteStep}
                    type="button"
                    title={`执行 AI 命令：${displayedStep.command}`}
                    onClick={() => {
                      if (!displayedStep.sessionId) {
                        return
                      }
                      updateSessionAgentState(displayedStep.sessionId, (current) => ({
                        ...current,
                        goal: resolveAgentGoal(`执行命令并根据结果回答用户：${displayedStep.command}`, displayedStep.sessionId),
                        running: true,
                      }))
                      void executeAgentStep(displayedStep.id)
                    }}
                  >
                    ↵
                  </button>
                  {displayedStep.status === 'executed' ? (
                    <button
                      className="ai-icon-button"
                      type="button"
                      title="让 AI 根据该步骤输出继续判断"
                      onClick={() => {
                        if (!displayedStep.sessionId) {
                          return
                        }
                        void requestAgentNextStep(getAgentStepsForSession(displayedStep.sessionId), displayedStep.sessionId)
                      }}
                    >
                      ↻
                    </button>
                  ) : null}
                  <button className="ai-icon-button" type="button" title="跳过这一步" onClick={() => updateAgentStep(displayedStep.id, { status: 'skipped' })}>
                    ⤼
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </article>
      )
    }
    if (message.kind === 'error') {
      return (
        <article className="ai-message-card ai-error-card message-error" key={message.id}>
          {renderAIMessageHeader(message.id, '错误', message.createdAt, 'ERR')}
          {!collapsed ? renderMarkdown(message.content) : null}
        </article>
      )
    }
    if (message.kind === 'status') {
      return (
        <article className="ai-message-card ai-status-line message-status" key={message.id}>
          {renderAIMessageHeader(message.id, '状态', message.createdAt, 'STAT')}
          {!collapsed ? (
            <div className="ai-status-content loading">
              <span aria-hidden="true" className="file-loading-spinner" />
              {renderMarkdown(message.content)}
            </div>
          ) : null}
        </article>
      )
    }
    return <div key={message.id}>{renderAIResponseMessage(message, 'AI')}</div>
  }

  const startLeftRailResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = leftRailWidth
    let nextWidth = startWidth

    const handlePointerMove = (moveEvent: PointerEvent) => {
      nextWidth = Math.min(620, Math.max(220, startWidth + moveEvent.clientX - startX))
      setLeftRailWidth(nextWidth)
    }

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      void saveAppConfig({ leftRailWidth: nextWidth })
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const startPredictionPanelResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = predictionPanelHeight
    let nextHeight = startHeight

    const handlePointerMove = (moveEvent: PointerEvent) => {
      nextHeight = clampPredictionPanelHeight(startHeight + startY - moveEvent.clientY)
      setPredictionPanelHeight(nextHeight)
      window.requestAnimationFrame(() => {
        fitAddonRef.current?.fit()
        syncTerminalSize()
      })
    }

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      void saveAppConfig({ predictionPanelHeight: nextHeight })
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const startRightToolResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = rightServerInfoPanelHeight
    let nextHeight = startHeight

    const handlePointerMove = (moveEvent: PointerEvent) => {
      nextHeight = clampRightServerInfoPanelHeight(startHeight + moveEvent.clientY - startY)
      setRightServerInfoPanelHeight(nextHeight)
    }

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      const height = clampRightServerInfoPanelHeight(nextHeight)
      setSettings((current) => normalizeAppSettings({ ...current, rightServerInfoPanelHeight: height }))
      void saveAppConfig({ rightServerInfoPanelHeight: height })
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const startRightPanelWidthResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = rightPanelWidth
    let nextWidth = startWidth

    const handlePointerMove = (moveEvent: PointerEvent) => {
      nextWidth = clampRightPanelWidth(startWidth + startX - moveEvent.clientX)
      setRightPanelWidth(nextWidth)
    }

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      const width = clampRightPanelWidth(nextWidth)
      setSettings((current) => normalizeAppSettings({ ...current, rightPanelWidth: width }))
      void saveAppConfig({ settings: { ...sessionSettingsRef.current, rightPanelWidth: width } })
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const expandedMetricLabel = expandedMetric === 'cpuPercent' ? 'CPU 使用率' : '内存使用率'

  if (authRequired) {
    if (!authInitialized) {
      return (
        <div className="login-shell">
          <form className="login-panel" onSubmit={submitSetup}>
            <div>
              <span>AI SSH 初始化</span>
              <h1>设置登录密码</h1>
              <p>首次启动需要先设置网页登录密码。桌面客户端默认可直接进入，也可以勾选启动时要求登录。</p>
            </div>
            <label>
              <span>用户名</span>
              <input
                autoComplete="username"
                value={setupForm.username}
                onChange={(event) => setSetupForm((current) => ({ ...current, username: event.target.value }))}
              />
            </label>
            <label>
              <span>密码</span>
              <div className="password-field">
                <input
                  autoComplete="new-password"
                  type={showSetupPassword ? 'text' : 'password'}
                  value={setupForm.password}
                  onChange={(event) => setSetupForm((current) => ({ ...current, password: event.target.value }))}
                />
                <button
                  aria-label={showSetupPassword ? '隐藏密码' : '显示密码'}
                  className="password-toggle"
                  title={showSetupPassword ? '隐藏密码' : '显示密码'}
                  type="button"
                  onClick={() => setShowSetupPassword((current) => !current)}
                >
                  <span aria-hidden="true" className={`eye-icon ${showSetupPassword ? '' : 'hidden'}`} />
                </button>
              </div>
            </label>
            <label>
              <span>确认密码</span>
              <div className="password-field">
                <input
                  autoComplete="new-password"
                  type={showSetupConfirmPassword ? 'text' : 'password'}
                  value={setupForm.confirmPassword}
                  onChange={(event) => setSetupForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                />
                <button
                  aria-label={showSetupConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                  className="password-toggle"
                  title={showSetupConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                  type="button"
                  onClick={() => setShowSetupConfirmPassword((current) => !current)}
                >
                  <span aria-hidden="true" className={`eye-icon ${showSetupConfirmPassword ? '' : 'hidden'}`} />
                </button>
              </div>
            </label>
            {isTauriRuntime ? (
              <label className="checkbox-row login-checkbox-row">
                <input
                  checked={setupForm.desktopLoginRequired}
                  type="checkbox"
                  onChange={(event) =>
                    setSetupForm((current) => ({ ...current, desktopLoginRequired: event.target.checked }))
                  }
                />
                <span>桌面客户端启动时也要求登录</span>
              </label>
            ) : null}
            {loginError ? <div className="login-error">{loginError}</div> : null}
            <button disabled={authState === 'loading'} type="submit">
              {authState === 'loading' ? '保存中...' : '保存并进入'}
            </button>
          </form>
        </div>
      )
    }
    return (
      <div className="login-shell">
        <form className="login-panel" onSubmit={submitLogin}>
          <div>
            <span>AI SSH Web</span>
            <h1>登录后继续</h1>
            <p>{isTauriRuntime ? '当前桌面客户端已设置为启动时要求登录。' : '网页访问需要先登录。'}</p>
          </div>
          <label>
            <span>用户名</span>
            <input
              autoComplete="username"
              value={loginForm.username}
              onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
            />
          </label>
          <label>
            <span>密码</span>
            <div className="password-field">
              <input
                autoComplete="current-password"
                type={showLoginPassword ? 'text' : 'password'}
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
              />
              <button
                aria-label={showLoginPassword ? '隐藏密码' : '显示密码'}
                className="password-toggle"
                title={showLoginPassword ? '隐藏密码' : '显示密码'}
                type="button"
                onClick={() => setShowLoginPassword((current) => !current)}
              >
                <span aria-hidden="true" className={`eye-icon ${showLoginPassword ? '' : 'hidden'}`} />
              </button>
            </div>
          </label>
          {loginError ? <div className="login-error">{loginError}</div> : null}
          <button disabled={authState === 'loading' || !loginForm.username.trim() || !loginForm.password.trim()} type="submit">
            {authState === 'loading' ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    )
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
            ['file', t('appMenu.file')],
            ['edit', t('appMenu.edit')],
            ['session', t('appMenu.session')],
            ['transfer', t('appMenu.transfer')],
            ['tools', t('appMenu.tools')],
            ['settings', t('appMenu.settings')],
          ].map(([key, label]) => (
            <div className="menu-item" key={key}>
              <button
                title={t('appMenu.openMenu', { label })}
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
                      <button type="button" title={t('appMenu.addConnection')} onClick={openAddHostDialog}>{t('appMenu.addConnection')}</button>
                      <button type="button" title={t('appMenu.exportHosts')} onClick={() => void exportHosts(false)}>{isTauriRuntime ? t('appMenu.exportHostsToFile') : t('appMenu.exportHostsCopy')}</button>
                      <button type="button" title={t('appMenu.exportHostsWithSecrets')} onClick={() => void exportHosts(true)}>{isTauriRuntime ? t('appMenu.exportHostsToFileWithSecrets') : t('appMenu.exportHostsCopyWithSecrets')}</button>
                      <button type="button" title={t('appMenu.exportConfig')} onClick={() => void exportSoftwareConfig()}>{isTauriRuntime ? t('appMenu.exportConfigToFile') : t('appMenu.exportConfigCopy')}</button>
                      <button type="button" title={isTauriRuntime ? t('appMenu.importHostsFromFile') : t('appMenu.importHosts')} onClick={() => void importHostsFromClipboard()}>{isTauriRuntime ? t('appMenu.importHostsFromFile') : t('appMenu.importHosts')}</button>
                      <button type="button" title={isTauriRuntime ? t('appMenu.importConfigFromFile') : t('appMenu.importConfig')} onClick={() => void importSoftwareConfig()}>{isTauriRuntime ? t('appMenu.importConfigFromFile') : t('appMenu.importConfig')}</button>
                    </>
                  ) : null}
                  {key === 'session' ? (
                    <>
                      <button type="button" title={t('appMenu.newSession')} onClick={() => void createSession()}>{t('appMenu.newSession')}</button>
                      <button
                        disabled={!activeSession || (activeSession.status !== 'error' && activeSession.status !== 'closed')}
                        title={t('appMenu.reconnectCurrent')}
                        type="button"
                        onClick={() => activeSession && void reconnectSession(activeSession)}
                      >
                        {t('appMenu.reconnectCurrent')}
                      </button>
                      <button type="button" title={t('appMenu.manageGroups')} onClick={openGroupDialog}>{t('appMenu.manageGroups')}</button>
                      <button disabled={!activeSession} title={t('appMenu.closeCurrent')} type="button" onClick={() => activeSession && void closeSession(activeSession)}>
                        {t('appMenu.closeCurrent')}
                      </button>
                    </>
                  ) : null}
                  {key === 'transfer' ? (
                    <>
                      <button type="button" title={t('appMenu.uploadFiles')} onClick={() => void chooseUploadFiles()}>{t('appMenu.uploadFiles')}</button>
                      <button type="button" title={t('appMenu.openFiles')} onClick={() => setLeftMode('files')}>{t('appMenu.openFiles')}</button>
                    </>
                  ) : null}
                  {key === 'tools' ? <button type="button" title={t('appMenu.logs')} onClick={openLogDialog}>{t('appMenu.logs')}</button> : null}
                  {key === 'settings' ? (
                    <>
                      <button type="button" title={t('appMenu.featureGuide')} onClick={openFeatureGuide}>{t('appMenu.featureGuide')}</button>
                      <button type="button" title={t('appMenu.appSettings')} onClick={openSettingsDialog}>{t('appMenu.appSettings')}</button>
                      <button type="button" title={t('appMenu.aiModels')} onClick={openModelDialog}>{t('appMenu.aiModels')}</button>
                      <button type="button" title={t('appMenu.aiSkills')} onClick={openSkillDialog}>{t('appMenu.aiSkills')}</button>
                    </>
                  ) : null}
                  {key === 'edit' ? <button type="button" title={t('appMenu.copySelection')} disabled>{t('appMenu.copy')}</button> : null}
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
        className={`workbench-grid${isLeftRailCollapsed ? ' left-collapsed' : ''}`}
        style={{
          '--left-rail-width': `${effectiveLeftRailWidth}px`,
          '--right-server-info-height': `${rightServerInfoPanelHeight}px`,
          '--right-panel-width': `${rightPanelWidth}px`,
          gridTemplateColumns: isLeftRailCollapsed ? `40px minmax(0, 1fr) ${rightPanelWidth}px` : `${effectiveLeftRailWidth}px minmax(0, 1fr) ${rightPanelWidth}px`,
        } as React.CSSProperties}
      >
        <aside className="left-rail">
          {isLeftRailCollapsed ? (
            <div className="rail-collapsed">
              <button
                className="rail-toggle-button"
                type="button"
                title={t('appMenu.expandLeftPanel')}
                onClick={() => setIsLeftRailCollapsed(false)}
              >
                ▸
              </button>
            </div>
          ) : (
          <div className="rail-tabs">
            <button
              className={leftMode === 'servers' ? 'active' : ''}
              title={t('appMenu.showServerList')}
              type="button"
              onClick={() => setLeftMode('servers')}
            >
              SSH
            </button>
            <button
              className={leftMode === 'files' ? 'active' : ''}
              title={t('appMenu.showFilePanel')}
              type="button"
              onClick={() => setLeftMode('files')}
            >
              {t('appMenu.files')}
            </button>
          </div>
          )}

          {!isLeftRailCollapsed ? (leftMode === 'servers' ? (
            <ServersPanel
              batchMode={batchMode}
              batchSelectedHostIds={batchSelectedHostIds}
              openHostMenuId={openHostMenuId}
              selectedHostId={selectedHostId}
              serverSearch={serverSearch}
              visibleHostCount={visibleHostCount}
              visibleHostGroups={visibleHostGroups}
              onCollapse={() => setIsLeftRailCollapsed(true)}
              onConfirmDeleteHost={confirmDeleteHost}
              onCreateSession={(hostId) => createSession(hostId)}
              onDuplicateHost={duplicateHost}
              onExportHosts={(includeSecrets) => exportHosts(includeSecrets)}
              onMoveHost={handleMoveHost}
              onOpenAddHostDialog={openAddHostDialog}
              onOpenEditHostDialog={openEditHostDialog}
              onOpenGroupDialog={openGroupDialog}
              onOpenHostMenuChange={setOpenHostMenuId}
              onSelectHost={(hostId) => {
                setSelectedHostId(hostId)
                setOpenHostMenuId('')
              }}
              onServerSearchChange={setServerSearch}
              onToggleBatchHost={toggleBatchHostSelection}
              onToggleBatchMode={toggleBatchMode}
            />
          ) : (
            <FileBrowserPanel
              fileBrowserRef={fileBrowserRef}
              fileEntries={sortedFileEntries}
              fileError={fileError}
              filePath={filePath}
              filePathDraft={filePathDraft}
              fileSort={fileSort}
              focusedFilePath={focusedFilePath}
              isFileDropActive={isFileDropActive}
              isLoadingFiles={isLoadingFiles}
              selectedFileCount={selectedFileEntries.length}
              selectedFilePaths={selectedFilePaths}
              trackTerminalPath={trackTerminalPath}
              transferTasks={transferTasks}
              uploadFileRef={uploadFileRef}
              onChooseUploadFiles={chooseUploadFiles}
              onCollapse={() => setIsLeftRailCollapsed(true)}
              onConfirmRemoveTransferTask={confirmRemoveTransferTask}
              onDownloadEntry={downloadFile}
              onDownloadSelectedFiles={downloadSelectedFiles}
              onFilePathDraftChange={setFilePathDraft}
              onFileSortChange={updateFileSort}
              onFocusFilePath={setFocusedFilePath}
              onHandleBrowserCompositionEnd={handleFileBrowserCompositionEnd}
              onHandleBrowserKeyDown={handleFileBrowserKeyDown}
              onHandleRemoteFileDragEnd={handleRemoteFileDragEnd}
              onLoadFiles={loadFiles}
              onOpenFilePreview={(entry) => openFilePreview(entry)}
              onResetSelection={clearFileSelection}
              onSelectEntry={selectFileEntry}
              onSetIsFileDropActive={setIsFileDropActive}
              onSetTrackTerminalPath={setTrackTerminalPath}
              onSetupRemoteFileDrag={setupRemoteFileDrag}
              onUploadInputChange={(files) => {
                if (files) {
                  return uploadFiles(files)
                }
                return undefined
              }}
            />
          )) : null}
        </aside>
        {!isLeftRailCollapsed ? (
        <div
          aria-label={t('appMenu.resizeLeftPanel')}
          className="rail-resizer"
          role="separator"
          tabIndex={0}
          onPointerDown={startLeftRailResize}
        />
        ) : null}

        <main className="center-workspace">
          <SessionTabs
            activeViewId={activeViewId}
            filePreviewTabs={filePreviewTabs}
            sessionTabMenu={sessionTabMenu}
            sessionTabMenuRef={sessionTabMenuRef}
            sessionTabsRef={sessionTabsRef}
            sessions={sessions}
            onActivateFilePreview={(tabId) => setActiveViewId(`file:${tabId}`)}
            onActivateSession={activateSession}
            onCloseAllSessions={closeAllSessions}
            onCloseFilePreview={closeFilePreview}
            onCloseOtherSessions={closeOtherSessions}
            onCloseSession={closeSession}
            onCloseSessionsToRight={closeSessionsToRight}
            onCopySessionSSHInfo={copySessionSSHInfoWithFeedback}
            onCreateSession={() => createSession()}
            onSessionTabMenuChange={setSessionTabMenu}
          />

          <TerminalStage
            activeHost={activeHost}
            activePrediction={activePrediction}
            activePredictions={activePredictions}
            activePredictionIndex={activePredictionIndex}
            activeSession={activeSession}
            activeSessionConnected={Boolean(activeSession && activeSession.status === 'connected')}
            aiEnabled={settings.aiEnabled}
            aiPredictionEnabled={settings.aiPredictionEnabled}
            isFavoriteCommand={isFavoriteCommand}
            isFilePreviewActive={isFilePreviewActive}
            isPredictionDockCollapsed={isPredictionDockCollapsed}
            isPredictionThinkingExpanded={isPredictionThinkingExpanded}
            predictionGhostPosition={predictionGhostPosition}
            predictionPanelHeight={predictionPanelHeight}
            primaryPrediction={primaryPrediction}
            recentHosts={recentHosts}
            terminalRef={terminalRef}
            terminalSelectionAction={terminalSelectionAction}
            onAddTerminalSelectionToAI={addTerminalSelectionToAI}
            onApplyPrediction={applyPrediction}
            onCopyCommand={(command) => copyCommand(command)}
            onCreateSession={(hostId) => createSession(hostId)}
            onExecuteCommand={executeCommand}
            onOpenAddHostDialog={openAddHostDialog}
            onReconnectSession={reconnectSession}
            onSelectPrediction={handleSelectPrediction}
            onSetAIPredictionEnabled={handleAIPredictionEnabledChange}
            onSetIsPredictionDockCollapsed={setIsPredictionDockCollapsed}
            onSetPredictionThinkingExpanded={handlePredictionThinkingExpandedChange}
            onStartPredictionPanelResize={startPredictionPanelResize}
            onToggleFavoriteCommand={toggleFavoriteCommand}
          />
            {activeFilePreview ? (
              <FilePreviewPanel
                codeMirrorRef={codeMirrorRef}
                tab={activeFilePreview}
                onCopyDraft={(tab) => copyFilePreviewDraft(tab)}
                onDownloadFile={(file) => downloadFile(file)}
                onFormatDraft={formatFilePreviewDraft}
                onOpenAsText={(tab) => openFilePreviewAsText(tab)}
                onResetDraft={resetFilePreviewDraft}
                onSaveFile={(tab) => saveFilePreview(tab)}
                onSetEditMode={setFilePreviewEditMode}
                onUpdateDraft={updateFilePreviewDraft}
              />
            ) : null}

        </main>

        <div
          aria-label={t('appMenu.resizeRightPanelWidth')}
          className="right-rail-width-resizer"
          role="separator"
          tabIndex={0}
          title={t('appMenu.resizeRightPanelWidth')}
          onPointerDown={startRightPanelWidthResize}
        />

        <aside className="right-rail">
          <ServerInfoPanel
            activeHost={activeHost}
            activeSession={activeSession}
            compactMetricWidth={Math.max(260, rightPanelWidth - 82)}
            expandedMetricPointLimit={settings.metricsExpandedPointLimit}
            height={rightServerInfoPanelHeight}
            isCollapsed={isServerInfoCollapsed}
            latestMetricSample={latestMetricSample}
            metricCompactPointLimit={settings.metricsCompactPointLimit}
            metricHistory={metricHistory}
            onExpandMetric={setExpandedMetric}
            primaryDisk={primaryDisk}
            serverMetrics={serverMetrics}
            systemInfo={systemInfo}
            onToggleCollapsed={() => setIsServerInfoCollapsed((current) => !current)}
          />

          <div
            aria-label={t('appMenu.resizeRightPanelHeight')}
            className="right-panel-resizer"
            role="separator"
            tabIndex={0}
            title={t('appMenu.resizeRightPanelHeight')}
            onPointerDown={startRightToolResize}
          />

          <section className="tool-panel">
            <div className="tool-tabs">
              <button
                className={rightTool === 'ai' ? 'active' : ''}
                title={t('appMenu.showAI')}
                type="button"
                onClick={() => setRightTool('ai')}
              >
                AI
              </button>
              <button
                className={rightTool === 'history' ? 'active' : ''}
                title={t('appMenu.showHistory')}
                type="button"
                onClick={() => setRightTool('history')}
              >
                {t('appMenu.history')}
              </button>
              <button
                className={rightTool === 'favorites' ? 'active' : ''}
                title={t('appMenu.showFavorites')}
                type="button"
                onClick={() => setRightTool('favorites')}
              >
                {t('appMenu.favorites')}
              </button>
            </div>

            {rightTool === 'ai' ? (
              <AIWorkspacePanel
                activeSessionName={activeSession?.hostName ?? ''}
                activeAIConversationId={activeAIConversationId}
                liveAIConversationId={liveAIConversationId}
                isPreviewingHistory={isPreviewingAIHistory}
                activeAIModelLabel={activeAIAgentModelConfig?.model || activeAIAgentModelConfig?.name || t('appMenu.unconfigured')}
                activeAIModelTitle={activeAIAgentModelConfig
                  ? t('appMenu.currentModel', { model: activeAIAgentModelConfig.model || activeAIAgentModelConfig.name })
                  : t('appMenu.unconfiguredModel')}
                agentMode={activeAgentMode}
                agentState={agentState}
                aiAssistantError={aiAssistantError}
                aiAssistantState={aiAssistantState}
                aiConversations={aiConversations}
                aiMessageListRef={aiMessageListRef}
                onAiMessageListScroll={handleAIMessageListScroll}
                aiMessages={aiMessages}
                aiUnifiedInputPlaceholder={aiUnifiedInputPlaceholder}
                aiUnifiedInputValue={aiUnifiedInputValue}
                aiSkills={aiSkills}
                batchActive={batchActive}
                batchCardsRef={batchCardsRef}
                batchHostIndex={batchHostIndex}
                batchHostResults={batchHostResults}
                batchMode={batchMode}
                batchSelectedHosts={batchSelectedHosts}
                batchTask={batchTask}
                hasMoreConversations={hasMoreConversations}
                isAIHistoryOpen={isAIHistoryOpen}
                isAIInputCollapsed={isAIInputCollapsed}
                isAIProviderConfigured={isAIProviderConfigured}
                normalizedAgentMessage={normalizedAgentMessage}
                renderAIMessage={renderAIMessage}
                renderMarkdown={renderMarkdown}
                selectedAISkillIds={selectedAISkillIds}
                settingsAiEnabled={settings.aiEnabled && settings.aiAgentEnabled}
                shouldRenderAgentMessageCard={shouldRenderAgentMessageCard}
                onClearAiInput={() => { updateAiUnifiedInputValue(''); setAiAssistantError('') }}
                onCloseBatchHostCard={closeBatchHostCard}
                onContinueAgentTask={() => continueAgentTask(activeAgentSessionId)}
                onCreateConversation={() => { void createAIConversation(t('aiWorkspace.newConversation')) }}
                onDeleteConversation={confirmDeleteAIConversation}
                onLoadMoreConversations={() => { void loadAIConversations(false) }}
                onRemoveBatchSelectedHost={removeBatchSelectedHost}
                onReturnToLiveConversation={() => {
                  if (!activeAgentSessionId || !liveAIConversationId) {
                    return
                  }
                  clearPreviewConversationId(activeAgentSessionId)
                  void selectAIConversationWithBinding(liveAIConversationId, {
                    sessionId: activeAgentSessionId,
                    resetAgentState: false,
                    bindToSession: false,
                  })
                }}
                onSelectConversation={(conversationId) => {
                  if (!activeAgentSessionId) {
                    void selectAIConversationWithBinding(conversationId, { resetAgentState: false, bindToSession: false })
                    return
                  }
                  void selectAIConversationWithBinding(conversationId, {
                    sessionId: activeAgentSessionId,
                    resetAgentState: false,
                    bindToSession: false,
                  })
                }}
                onToggleAISkill={(skillId) => {
                  setSelectedAISkillIds((current) => (
                    current.includes(skillId)
                      ? current.filter((id) => id !== skillId)
                      : [...current, skillId]
                  ))
                }}
                onSetAgentMode={(mode) => {
                  if (!activeAgentSessionId) {
                    return
                  }
                  updateSessionAgentState(activeAgentSessionId, { mode })
                }}
                onSetIsAIInputCollapsed={setIsAIInputCollapsed}
                onSetIsAIInputExpanded={setIsAIInputExpanded}
                onStartBatchExecution={() => { void startBatchExecution() }}
                onStopAgentTask={() => stopAgentTask(activeAgentSessionId)}
                onSubmitAiUnifiedInput={() => { void submitAiUnifiedInput() }}
                onToggleAIHistory={() => setIsAIHistoryOpen((current) => !current)}
                onUpdateAiUnifiedInputValue={updateAiUnifiedInputValue}
              />
            ) : rightTool === 'history' ? (
              <CommandHistoryPanel
                activeSessionConnected={Boolean(activeSession && activeSession.status === 'connected')}
                commandHistory={commandHistory}
                isFavoriteCommand={isFavoriteCommand}
                onCopyCommand={(command) => { void copyCommand(command) }}
                onExecuteCommand={executeCommand}
                onToggleFavoriteCommand={toggleFavoriteCommand}
                onWriteCommand={writeCommand}
              />
            ) : (
              <FavoriteCommandsPanel
                activeSessionConnected={Boolean(activeSession && activeSession.status === 'connected')}
                favoriteCommandDraft={favoriteCommandDraft}
                favoriteCommands={favoriteCommands}
                onAddFavoriteCommand={addFavoriteCommand}
                onConfirmDeleteFavoriteCommand={confirmDeleteFavoriteCommand}
                onCopyCommand={(command) => { void copyCommand(command) }}
                onExecuteCommand={executeCommand}
                onFavoriteCommandDraftChange={setFavoriteCommandDraft}
                onMoveFavoriteCommand={moveFavoriteCommand}
                onWriteCommand={writeCommand}
              />
            )}
          </section>

          <SideErrorNotice errorNotice={errorNotice} onClose={() => setErrorNotice(null)} />

        </aside>
      </div>

      <HostDialog
        hostDialogError={hostDialogError}
        hostDialogMode={hostDialogMode}
        hostForm={hostForm}
        hostGroups={hostGroups}
        isSavingHost={isSavingHost}
        open={isHostDialogOpen}
        privateKeyFileRef={privateKeyFileRef}
        savePassword={savePassword}
        savePrivateKey={savePrivateKey}
        onClose={closeHostDialog}
        onHostFormChange={(updater) => setHostForm((current) => updater(current))}
        onSavePasswordChange={setSavePassword}
        onSavePrivateKeyChange={setSavePrivateKey}
        onSelectPrivateKeyFile={(file) => { void selectPrivateKeyFile(file) }}
        onSubmit={() => { void saveHost() }}
      />

      <GroupModal
        groupDialogError={groupDialogError}
        groupDialogMessage={groupDialogMessage}
        groupDrafts={groupDrafts}
        open={isGroupDialogOpen}
        originalGroupDrafts={originalGroupDrafts}
        usedCounts={hostGroupDraftUsedCounts}
        onAddGroup={addHostGroupDraft}
        onClearGroupDialogMessage={clearHostGroupDialogMessage}
        onClose={closeHostGroupDialog}
        onConfirmDeleteGroupDraft={confirmDeleteGroupDraft}
        onGroupDraftsChange={setGroupDrafts}
        onMoveGroupDraft={moveGroupDraft}
        onSave={() => { void saveHostGroups() }}
      />

      <LogModal
        logHealthChecks={logHealthChecks}
        logLevel={logLevel}
        logSearch={logSearch}
        open={isLogDialogOpen}
        visibleLogs={visibleLogs}
        onClose={() => setIsLogDialogOpen(false)}
        onLogSearchChange={setLogSearch}
        onRefresh={() => { void loadLogs() }}
        onUpdateLogHealthChecks={(enabled) => { void updateLogSettings({ logHealthChecks: enabled }) }}
        onUpdateLogLevel={(level) => { void updateLogSettings({ level }) }}
      />

      {isFeatureGuideOpen ? <FeatureGuide onClose={() => setIsFeatureGuideOpen(false)} /> : null}

      <SettingsDialog
        authInitialized={authInitialized}
        changePasswordError={changePasswordError}
        changePasswordForm={changePasswordForm}
        changePasswordSuccess={changePasswordSuccess}
        defaultAiCommandHistoryLimit={defaultSettings.aiCommandHistoryLimit}
        defaultAiPredictionCommandHistoryLimit={defaultSettings.aiPredictionCommandHistoryLimit}
        defaultAiPredictionProviderTimeoutSeconds={defaultSettings.aiPredictionProviderTimeoutSeconds}
        defaultAiPredictionTerminalContextLimit={defaultSettings.aiPredictionTerminalContextLimit}
        defaultAiPredictionTriggerDelayMs={defaultSettings.aiPredictionTriggerDelayMs}
        defaultAiProviderTimeoutSeconds={defaultSettings.aiProviderTimeoutSeconds}
        defaultAiSystemPrompt={DEFAULT_AI_SYSTEM_PROMPT}
        defaultAiTerminalContextLimit={defaultSettings.aiTerminalContextLimit}
        defaultAgentCommandTimeoutSeconds={defaultSettings.agentCommandTimeoutSeconds}
        defaultHealthCheckIntervalSeconds={DEFAULT_HEALTH_CHECK_INTERVAL_SECONDS}
        defaultRightPanelWidth={DEFAULT_RIGHT_PANEL_WIDTH}
        defaultRightServerInfoHeight={DEFAULT_RIGHT_SERVER_INFO_HEIGHT}
        defaultSettings={defaultSettings}
        desktopLoginRequired={desktopLoginRequired}
        maxRightPanelWidth={MAX_RIGHT_PANEL_WIDTH}
        maxRightServerInfoHeight={MAX_RIGHT_SERVER_INFO_HEIGHT}
        minRightPanelWidth={MIN_RIGHT_PANEL_WIDTH}
        minRightServerInfoHeight={MIN_RIGHT_SERVER_INFO_HEIGHT}
        onChangePassword={changePassword}
        onChangePasswordFormChange={(updater) => setChangePasswordForm((current) => updater(current))}
        onClearPrediction={clearAIPrediction}
        onClose={() => setIsSettingsDialogOpen(false)}
        onDesktopLoginRequiredChange={setDesktopLoginRequired}
        onSave={() => { void saveAllSettings() }}
        onSettingsChange={(updater) => setSettings((current) => updater(current))}
        onSettingsSectionChange={setSettingsSection}
        onWebAccessEnabledChange={setWebAccessEnabled}
        open={isSettingsDialogOpen}
        settings={settings}
        settingsSavedMessage={settingsSavedMessage}
        settingsSection={settingsSection}
        webAccessEnabled={webAccessEnabled}
      />

      <AIModelsDialog
        activeModelId={activeAIModelId}
        activeAgentModelId={activeAIAgentModelId}
        activePredictionModelId={activeAIPredictionModelId}
        defaultOllamaBaseUrl={DEFAULT_OLLAMA_BASE_URL}
        models={aiModelDrafts}
        onActiveChange={setActiveAIModelId}
        onAgentModelChange={setActiveAIAgentModelId}
        onAdd={addAIModelConfig}
        onClose={() => setIsModelDialogOpen(false)}
        onPredictionModelChange={setActiveAIPredictionModelId}
        onRemove={removeAIModelConfig}
        onSave={() => { void saveAIModels() }}
        onUpdate={updateAIModelConfig}
        open={isModelDialogOpen}
        savedMessage={settingsSavedMessage}
      />

      <AISkillsDialog
        onAdd={createAISkill}
        onClose={() => setIsSkillDialogOpen(false)}
        onRemove={removeAISkill}
        onSave={() => { void saveAISkills() }}
        onUpdate={updateAISkill}
        open={isSkillDialogOpen}
        savedMessage={settingsSavedMessage}
        skills={skillDrafts}
      />

      <ConfirmModal
        dialog={confirmDialog}
        onClose={closeConfirmDialog}
        onConfirm={confirmAndRun}
      />

      <PendingAgentStepModal
        open={Boolean(pendingAgentStepId)}
        step={pendingAgentStepId ? agentSteps.find((item) => item.id === pendingAgentStepId) ?? null : null}
        onClose={() => updateSessionAgentState(activeAgentSessionId, { pendingStepId: '' })}
        onConfirm={() => {
          const stepId = pendingAgentStepId
          updateSessionAgentState(activeAgentSessionId, {
            pendingStepId: '',
            running: activeAgentMode === 'auto',
          })
          void executeAgentStep(stepId, false, true)
        }}
      />

      <MetricExpandModal
        label={expandedMetricLabel}
        open={Boolean(expandedMetric)}
        onClose={() => setExpandedMetric('')}
      >
        {expandedMetric ? (
          <MetricChart
            compact={false}
            compactPointLimit={settings.metricsCompactPointLimit}
            compactWidth={Math.max(260, rightPanelWidth - 82)}
            expandedPointLimit={settings.metricsExpandedPointLimit}
            keyName={expandedMetric}
            label={expandedMetricLabel}
            metricHistory={metricHistory}
            serverMetrics={serverMetrics}
          />
        ) : null}
      </MetricExpandModal>

      <AIInputExpandModal
        open={isAIInputExpanded}
        canSubmit={!(aiAssistantState === 'loading' || !settings.aiEnabled || !settings.aiAgentEnabled)}
        placeholder={aiUnifiedInputPlaceholder}
        value={aiUnifiedInputValue}
        onChange={updateAiUnifiedInputValue}
        onClose={() => setIsAIInputExpanded(false)}
        onSubmit={() => { void submitAiUnifiedInput() }}
      />
    </div>
  )
}
