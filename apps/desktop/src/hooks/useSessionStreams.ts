import { type RefObject, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { LogLevel, SessionRecord, TerminalEvent } from '@ai-ssh/shared-contracts'
import type { AgentCommandWaiter } from '../types'

type UseSessionStreamsArgs = {
  activeSessionIdRef: RefObject<string>
  agentWaitersRef: RefObject<Record<string, AgentCommandWaiter>>
  appendLog: (level: LogLevel, source: string, message: string, fields?: Record<string, unknown>) => void
  appendQueryParam: (url: string, key: string, value: string) => string
  appendSessionTerminalOutput: (sessionId: string, data: string) => void
  clearAIPrediction: (options?: { cancelPending?: boolean; sessionId?: string; resetGhost?: boolean }) => void
  desktopTokenRef: RefObject<string>
  finishAgentStep: (stepId: string, sessionId: string, beforeContext: string, timedOut?: boolean, marker?: string) => void
  inputQueuesRef: RefObject<Record<string, Promise<void>>>
  isTauriRuntime: boolean
  leftModeRef: RefObject<string>
  loadFiles: (path?: string, hostId?: string) => Promise<void>
  pendingResizeRef: RefObject<Record<string, number>>
  recordCommand: (sessionId: string, command: string) => void
  resolveApiStreamUrl: (path: string) => string
  sessionsRef: RefObject<SessionRecord[]>
  setErrorMessage: (message: string) => void
  setSessions: React.Dispatch<React.SetStateAction<SessionRecord[]>>
  setTrackedFilePath: (path: string) => void
  trackTerminalPathRef: RefObject<boolean>
  updateAlternateScreenMode: (sessionId: string, data: string) => void
}

export function useSessionStreams({
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
  setErrorMessage,
  setSessions,
  setTrackedFilePath,
  trackTerminalPathRef,
  updateAlternateScreenMode,
}: UseSessionStreamsArgs) {
  const eventSourcesRef = useRef<Record<string, EventSource>>({})

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

  const openSessionStream = async (session: SessionRecord, markConnecting = false) => {
    if (eventSourcesRef.current[session.id]) {
      return
    }
    if (markConnecting) {
      setSessions((current) =>
        current.map((item) => (item.id === session.id ? { ...item, status: 'connecting' } : item)),
      )
    }

    let streamUrl = resolveApiStreamUrl(`/sessions/${session.id}/events`)
    if (isTauriRuntime) {
      const token = desktopTokenRef.current || await invoke<string>('desktop_login_token').catch(() => '')
      desktopTokenRef.current = token
      if (token) {
        streamUrl = appendQueryParam(streamUrl, 'desktopToken', token)
      }
    }
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
      const waiter = agentWaitersRef.current[session.id]
      if (waiter) {
        finishAgentStep(waiter.stepId, waiter.sessionId, waiter.beforeContext, true, waiter.marker)
      }
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
          payload.data === 'connected' ? 'connected' : payload.data === 'closed' ? 'closed' : payload.data === 'error' ? 'error' : ''
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

      if (payload.type === 'prompt') {
        const waiter = agentWaitersRef.current[session.id]
        if (waiter) {
          finishAgentStep(waiter.stepId, waiter.sessionId, waiter.beforeContext, false, waiter.marker)
        }
      }

      if (payload.type === 'command' && payload.data) {
        recordCommand(session.id, payload.data)
      }

      if (payload.type === 'error') {
        const messageText = payload.data ?? '会话发生错误'
        const waiter = agentWaitersRef.current[session.id]
        if (waiter) {
          finishAgentStep(waiter.stepId, waiter.sessionId, waiter.beforeContext, true, waiter.marker)
        }
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
        const waiter = agentWaitersRef.current[session.id]
        if (waiter) {
          finishAgentStep(waiter.stepId, waiter.sessionId, waiter.beforeContext, true, waiter.marker)
        }
        markSessionDisconnected(session.id, '会话输出流已关闭，请重连当前 SSH 会话')
      }
    })
  }

  const closeAllSessionStreams = () => {
    Object.values(eventSourcesRef.current).forEach((source) => source.close())
    eventSourcesRef.current = {}
  }

  return {
    closeAllSessionStreams,
    closeSessionStream,
    eventSourcesRef,
    markSessionDisconnected,
    openSessionStream,
  }
}
