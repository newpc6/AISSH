import { useRef, type RefObject } from 'react'
import type { AIAgentAuditEventCreateRequest, AIRiskLevel, SessionRecord } from '@ai-ssh/shared-contracts'
import type { AgentCommandWaiter, AIAgentPlanStep, SessionAgentState } from '../types'

type UseAgentExecutionArgs = {
  activeSessionIdRef: RefObject<string>
  agentExitMarker: (stepId: string) => string
  appendLog: (level: 'debug' | 'info' | 'warn' | 'error', source: string, message: string, details?: Record<string, unknown>) => void
  classifyAgentCommandTimeout: (command: string, baseTimeoutSeconds: number) => number
  classifyCommandRisk: (command: string) => AIRiskLevel
  clearAIPrediction: (options?: { cancelPending?: boolean; sessionId?: string; resetGhost?: boolean }) => void
  executeCommandToSession: (command: string, targetSessionId?: string, options?: { preserveActiveView?: boolean }) => void
  extractAgentExitCode: (output: string, marker: string) => number | undefined
  findAgentStepById: (stepId: string) => { sessionId: string; step: AIAgentPlanStep } | null
  getAgentStepsForSession: (sessionId: string) => AIAgentPlanStep[]
  getSessionAgentState: (sessionId: string) => SessionAgentState
  normalizeAgentTimeoutSeconds: () => number
  onRequestNextStep: (steps: AIAgentPlanStep[], sessionId: string) => void
  onStepCompleted: (stepId: string, completedStep: AIAgentPlanStep) => void
  onAuditEvent: (event: AIAgentAuditEventCreateRequest, sessionId?: string) => void
  setAgentStatusMessage: (message: string, sessionId?: string) => void
  sessionsRef: RefObject<SessionRecord[]>
  stripAgentMarker: (output: string, marker: string) => string
  terminalContextTail: (cache: { chunks: string[]; lineCount: number; commandDraft: string } | undefined, maxChars: number) => string
  terminalCachesRef: RefObject<Record<string, { chunks: string[]; lineCount: number; commandDraft: string }>>
  updateAgentStep: (stepId: string, patch: Partial<AIAgentPlanStep>) => void
  updateSessionAgentState: (
    sessionId: string,
    updater: Partial<SessionAgentState> | ((current: SessionAgentState) => SessionAgentState),
  ) => void
  waitForSessionConnected: (sessionId: string, timeoutMs?: number) => Promise<SessionRecord>
  wrapAgentCommand: (command: string, marker: string) => string
}

export function useAgentExecution({
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
  normalizeAgentTimeoutSeconds,
  onRequestNextStep,
  onStepCompleted,
  onAuditEvent,
  setAgentStatusMessage,
  sessionsRef,
  stripAgentMarker,
  terminalContextTail,
  terminalCachesRef,
  updateAgentStep,
  updateSessionAgentState,
  waitForSessionConnected,
  wrapAgentCommand,
}: UseAgentExecutionArgs) {
  const agentWaitersRef = useRef<Record<string, AgentCommandWaiter>>({})

  const clearAgentWaiter = (sessionId?: string) => {
    if (sessionId) {
      const waiter = agentWaitersRef.current[sessionId]
      if (waiter) {
        window.clearTimeout(waiter.timeoutId)
        delete agentWaitersRef.current[sessionId]
      }
      return
    }
    Object.values(agentWaitersRef.current).forEach((waiter) => window.clearTimeout(waiter.timeoutId))
    agentWaitersRef.current = {}
  }

  const finishAgentStep = (stepId: string, sessionId: string, beforeContext: string, timedOut = false, marker = '') => {
    const latestContext = terminalContextTail(terminalCachesRef.current[sessionId], 20000)
    const waiter = agentWaitersRef.current[sessionId]
    const capturedRawOutput = waiter?.stepId === stepId ? waiter.rawOutput : ''
    const rawOutput = capturedRawOutput || (latestContext.startsWith(beforeContext) ? latestContext.slice(beforeContext.length) : latestContext)
    if (waiter?.stepId === stepId) {
      window.clearTimeout(waiter.timeoutId)
      delete agentWaitersRef.current[sessionId]
    }
    const exitCode = marker ? extractAgentExitCode(rawOutput, marker) : undefined
    const output = marker ? stripAgentMarker(rawOutput, marker) : rawOutput
    const exitedWithError = exitCode !== undefined && exitCode !== 0
    const failed = timedOut
    updateAgentStep(stepId, {
      status: failed ? 'failed' : 'executed',
      output: output.trim().slice(-8000),
      exitCode,
    })
    const completedStep = getAgentStepsForSession(sessionId).find((step) => step.id === stepId)
    if (completedStep) {
      onStepCompleted(stepId, completedStep)
    }
    appendLog(timedOut ? 'warn' : 'info', 'ui.agent', timedOut ? 'agent command timed out' : 'agent command completed', {
      stepID: stepId,
      sessionID: sessionId,
      outputChars: output.length,
      exitCode,
      timedOut,
    })
    onAuditEvent({
      eventType: timedOut ? 'timed_out' : 'completed',
      messageId: stepId,
      sessionId,
      command: completedStep?.command,
      agentMode: getSessionAgentState(sessionId).mode,
      riskLevel: completedStep?.riskLevel,
      riskReason: completedStep?.riskReason,
      status: failed ? 'failed' : 'executed',
      exitCode,
      outputSummary: output.trim().slice(-8000),
      actor: 'system',
      reason: timedOut ? '命令等待超时，Agent 暂停' : exitedWithError ? `命令退出码 ${exitCode}` : '命令执行完成',
    }, sessionId)
    if (timedOut) {
      updateSessionAgentState(sessionId, {
        running: false,
        state: 'idle',
        message: '命令等待超时，Agent 已暂停。请确认终端状态后点击继续。',
      })
      return
    }
    if (getSessionAgentState(sessionId).running) {
      updateSessionAgentState(sessionId, {
        message: exitedWithError
          ? `命令退出码 ${exitCode}，正在让 AI 根据输出判断结论或下一步...`
          : '命令已完成，正在规划下一步...',
      })
      onRequestNextStep(getAgentStepsForSession(sessionId), sessionId)
    } else {
      updateSessionAgentState(sessionId, {
        state: 'success',
        message: exitedWithError ? `命令已完成，退出码 ${exitCode}` : '命令已完成',
      })
    }
  }

  const handleAgentPrompt = (sessionId: string) => {
    const waiter = agentWaitersRef.current[sessionId]
    if (!waiter) {
      return
    }
    finishAgentStep(waiter.stepId, waiter.sessionId, waiter.beforeContext, false, waiter.marker)
  }

  const executeAgentStep = async (stepId: string, fromAuto = false, confirmed = false) => {
    const located = findAgentStepById(stepId)
    const step = located?.step
    const sessionId = step?.sessionId || located?.sessionId || activeSessionIdRef.current || ''
    if (!step) {
      setAgentStatusMessage('当前 SSH 会话不可执行命令', sessionId)
      appendLog('warn', 'ui.agent', 'agent command skipped because step is unavailable', {
        stepID: stepId,
        sessionID: sessionId,
      })
      return
    }
    let session = sessionsRef.current.find((item) => item.id === sessionId)
    if (session?.status === 'connecting') {
      updateSessionAgentState(sessionId, {
        state: 'loading',
        message: 'SSH 会话连接中，正在等待连接完成后执行命令...',
      })
      try {
        session = await waitForSessionConnected(sessionId)
      } catch (error) {
        const message = error instanceof Error ? error.message : '等待 SSH 会话连接失败'
        updateSessionAgentState(sessionId, {
          running: false,
          state: 'idle',
          message,
        })
        appendLog('warn', 'ui.agent', 'agent command skipped while waiting for session connection', {
          stepID: stepId,
          sessionID: sessionId,
          error: message,
        })
        return
      }
    }
    if (!session || session.status !== 'connected') {
      setAgentStatusMessage('当前 SSH 会话不可执行命令', sessionId)
      appendLog('warn', 'ui.agent', 'agent command skipped because session is unavailable', {
        stepID: stepId,
        sessionID: sessionId,
        status: session?.status,
      })
      return
    }
    const riskLevel = step.riskLevel || classifyCommandRisk(step.command)
    if (riskLevel === 'high' && !confirmed && getSessionAgentState(sessionId).mode !== 'full-auto') {
      onAuditEvent({
        eventType: 'blocked',
        messageId: step.id,
        sessionId,
        command: step.command,
        agentMode: getSessionAgentState(sessionId).mode,
        riskLevel,
        riskReason: step.riskReason,
        status: step.status,
        actor: 'system',
        reason: fromAuto ? '自动执行遇到高风险命令，等待人工确认' : '高风险命令需要人工确认',
      }, sessionId)
      updateSessionAgentState(sessionId, {
        running: false,
        pendingStepId: step.id,
        message: fromAuto ? '检测到高风险命令，已暂停自动执行，请人工确认。' : '检测到高风险命令，请确认后执行',
      })
      return
    }
    const beforeContext = terminalContextTail(terminalCachesRef.current[sessionId], 12000)
    const marker = agentExitMarker(step.id)
    const baseTimeoutSeconds = normalizeAgentTimeoutSeconds()
    const timeoutSeconds = classifyAgentCommandTimeout(step.command, baseTimeoutSeconds)
    const timeoutMs = timeoutSeconds * 1000
    clearAgentWaiter(sessionId)
    onAuditEvent({
      eventType: fromAuto ? 'auto_approved' : 'approved',
      messageId: step.id,
      sessionId,
      command: step.command,
      agentMode: getSessionAgentState(sessionId).mode,
      riskLevel,
      riskReason: step.riskReason,
      status: 'approved',
      actor: fromAuto ? 'system' : 'user',
      reason: fromAuto ? 'Agent 自动模式批准执行' : '用户批准执行',
    }, sessionId)
    updateAgentStep(step.id, { status: 'running', riskLevel, sessionId })
    onAuditEvent({
      eventType: 'started',
      messageId: step.id,
      sessionId,
      command: step.command,
      agentMode: getSessionAgentState(sessionId).mode,
      riskLevel,
      riskReason: step.riskReason,
      status: 'running',
      actor: 'system',
      reason: `等待超时 ${timeoutSeconds} 秒`,
    }, sessionId)
    updateSessionAgentState(sessionId, {
      state: 'loading',
      message: '命令执行中，等待远端命令完成...',
      pendingStepId: '',
    })
    appendLog('info', 'ui.agent', 'agent command started', {
      stepID: step.id,
      sessionID: sessionId,
      riskLevel,
      timeoutMs,
    })
    const timeoutId = window.setTimeout(() => {
      if (agentWaitersRef.current[sessionId]?.stepId === step.id) {
        finishAgentStep(step.id, sessionId, beforeContext, true, marker)
      }
    }, timeoutMs)
    clearAIPrediction({ sessionId })
    agentWaitersRef.current[sessionId] = { stepId: step.id, sessionId, beforeContext, marker, rawOutput: '', timeoutId }
    executeCommandToSession(wrapAgentCommand(step.command, marker), sessionId, { preserveActiveView: true })
  }

  return {
    agentWaitersRef,
    clearAgentWaiter,
    executeAgentStep,
    finishAgentStep,
    handleAgentPrompt,
  }
}
