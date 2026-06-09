import { type RefObject } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import type { FileEntry, HostRecord, SessionOpenRequest, SessionOpenResponse, SessionRecord, ServerMetrics, SystemInfo } from '@ai-ssh/shared-contracts'
import type { MetricSample, SessionReconnectResponse, TerminalCache } from '../types'

type UseSessionLifecycleArgs = {
  activeSessionId: string
  activeViewId: string
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
  appendLog: (level: 'debug' | 'info' | 'warn' | 'error', source: string, message: string, fields?: Record<string, unknown>) => void
  appendSessionTerminalOutput: (sessionId: string, data: string) => void
  appendTerminalCache: (
    current: TerminalCache | undefined,
    output: string,
    maxLines: number,
  ) => TerminalCache
  clearAIPrediction: (options?: { cancelPending?: boolean; sessionId?: string; resetGhost?: boolean }) => void
  closeSessionStream: (sessionId: string) => void
  emptyTerminalCache: () => TerminalCache
  fitAddonRef: RefObject<FitAddon | null>
  hostsRef: RefObject<HostRecord[]>
  openSessionStream: (session: SessionRecord, markConnecting?: boolean) => Promise<void>
  previousMetricsRef: RefObject<ServerMetrics | null>
  removeTerminalCache: (sessionId: string) => void
  replaceTerminalWithCache: (sessionId: string) => void
  schedulePredictionGhostPositionUpdate: () => void
  selectedHostId: string
  sessionRetainedLines: () => number
  sessionsRef: RefObject<SessionRecord[]>
  setActiveSession: (sessionId: string) => void
  setErrorMessage: (message: string, options?: Record<string, unknown>) => void
  setFileEntries: React.Dispatch<React.SetStateAction<FileEntry[]>>
  setMetricHistory: React.Dispatch<React.SetStateAction<MetricSample[]>>
  setSelectedHostId: React.Dispatch<React.SetStateAction<string>>
  setServerMetrics: React.Dispatch<React.SetStateAction<ServerMetrics | null>>
  setSessions: React.Dispatch<React.SetStateAction<SessionRecord[]>>
  setSystemInfo: React.Dispatch<React.SetStateAction<SystemInfo | null>>
  setTerminalCaches: React.Dispatch<React.SetStateAction<Record<string, TerminalCache>>>
  syncTerminalSize: (sessionId?: string) => void
  terminalCachesRef: RefObject<Record<string, TerminalCache>>
  xtermRef: RefObject<Terminal | null>
  commandBufferRef: RefObject<string>
}

export function useSessionLifecycle({
  activeSessionId,
  activeViewId,
  apiFetch,
  appendLog,
  appendSessionTerminalOutput,
  appendTerminalCache,
  clearAIPrediction,
  closeSessionStream,
  emptyTerminalCache,
  fitAddonRef,
  hostsRef,
  openSessionStream,
  previousMetricsRef,
  removeTerminalCache,
  replaceTerminalWithCache,
  schedulePredictionGhostPositionUpdate,
  selectedHostId,
  sessionRetainedLines,
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
  commandBufferRef,
}: UseSessionLifecycleArgs) {
  const activateSession = (session: SessionRecord) => {
    if (activeViewId === `session:${session.id}` && session.id === activeSessionId) {
      return
    }

    setActiveSession(session.id)
    replaceTerminalWithCache(session.id)
    if (session.status === 'connected' || session.status === 'connecting') {
      void openSessionStream(session)
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
        throw new Error(`创建会话失败: ${response.status}`)
      }

      const data = (await response.json()) as SessionOpenResponse
      const initialOutput = `正在为主机 ${hostId} 创建会话...\r\n\r\nSession: ${data.session.id}\r\nHost: ${data.session.hostName}\r\n正在连接会话输出流...\r\n`
      setTerminalCaches((current) => {
        const next = {
          ...current,
          [data.session.id]: appendTerminalCache(emptyTerminalCache(), initialOutput, sessionRetainedLines()),
        }
        terminalCachesRef.current = next
        return next
      })
      setSessions((current) => [data.session, ...current])
      setActiveSession(data.session.id)
      xtermRef.current?.clear()
      xtermRef.current?.write(initialOutput)
      await openSessionStream(data.session, true)
      fitAddonRef.current?.fit()
      syncTerminalSize(data.session.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建会话失败'
      setErrorMessage(message)
      xtermRef.current?.writeln('')
      xtermRef.current?.writeln(`ERROR: ${message}`)
    }
  }

  const resetSessionWorkspace = () => {
    commandBufferRef.current = ''
    clearAIPrediction()
    setServerMetrics(null)
    setSystemInfo(null)
    setMetricHistory([])
    previousMetricsRef.current = null
    setFileEntries([])
    xtermRef.current?.clear()
  }

  const focusNextSession = (remainingSessions: SessionRecord[]) => {
    const next = remainingSessions[0]
    setActiveSession(next?.id ?? '')
    if (next) {
      replaceTerminalWithCache(next.id)
      if (next.status === 'connected' || next.status === 'connecting') {
        void openSessionStream(next)
      }
      fitAddonRef.current?.fit()
      syncTerminalSize(next.id)
      return
    }
    resetSessionWorkspace()
  }

  const closeSessionNow = async (session: SessionRecord) => {
    closeSessionStream(session.id)
    await apiFetch(`/sessions/${session.id}/close`, { method: 'POST' })
    const remainingSessions = sessionsRef.current.filter((item) => item.id !== session.id)
    sessionsRef.current = remainingSessions
    setSessions(remainingSessions)
    removeTerminalCache(session.id)
    if (activeSessionId === session.id) {
      focusNextSession(remainingSessions)
    }
  }

  const closeSessionsNow = async (targetSessions: SessionRecord[]) => {
    if (targetSessions.length === 0) {
      return
    }
    await Promise.all(targetSessions.map((session) => {
      closeSessionStream(session.id)
      return apiFetch(`/sessions/${session.id}/close`, { method: 'POST' })
    }))
    const closeIds = new Set(targetSessions.map((session) => session.id))
    const remainingSessions = sessionsRef.current.filter((item) => !closeIds.has(item.id))
    sessionsRef.current = remainingSessions
    setSessions(remainingSessions)
    targetSessions.forEach((session) => removeTerminalCache(session.id))
    if (closeIds.has(activeSessionId)) {
      focusNextSession(remainingSessions)
    }
  }

  const closeOtherSessions = async (session: SessionRecord) => {
    const targets = sessionsRef.current.filter((item) => item.id !== session.id)
    await closeSessionsNow(targets)
    setActiveSession(session.id)
    replaceTerminalWithCache(session.id)
  }

  const closeSessionsToRight = async (session: SessionRecord) => {
    const sessionList = sessionsRef.current
    const index = sessionList.findIndex((item) => item.id === session.id)
    if (index < 0) {
      return
    }
    await closeSessionsNow(sessionList.slice(index + 1))
  }

  const closeAllSessions = async () => {
    await closeSessionsNow(sessionsRef.current)
  }

  const reconnectSession = async (session: SessionRecord) => {
    closeSessionStream(session.id)
    const reconnectOutput = `\r\n正在重新连接 ${session.hostName}...\r\n`
    const previousCache = appendTerminalCache(
      terminalCachesRef.current[session.id] ?? emptyTerminalCache(),
      reconnectOutput,
      sessionRetainedLines(),
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
        throw new Error(detail.trim() || `重连失败: ${response.status}`)
      }

      const data = (await response.json()) as SessionReconnectResponse | SessionOpenResponse
      const nextSession = data.session
      const connectedOutput = `Session: ${nextSession.id}\r\n正在连接会话输出流...\r\n`
      const nextCache = appendTerminalCache(
        terminalCachesRef.current[session.id] ?? previousCache,
        connectedOutput,
        sessionRetainedLines(),
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
      await openSessionStream(nextSession, true)
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

  const copySessionSSHInfo = async (session: SessionRecord) => {
    const host = hostsRef.current.find((item) => item.id === session.hostId)
    const text = host
      ? (host.protocol === 'wsl'
          ? `wsl${host.wslDistro ? ` -d ${host.wslDistro}` : ''}${host.username ? ` -u ${host.username}` : ''}`
          : `ssh -p ${host.port} ${host.username}@${host.address}`)
      : session.hostName
    await navigator.clipboard.writeText(text)
    return text
  }

  return {
    activateSession,
    closeAllSessions,
    closeOtherSessions,
    closeSessionNow,
    closeSessionsNow,
    closeSessionsToRight,
    copySessionSSHInfo,
    createSession,
    reconnectSession,
  }
}
