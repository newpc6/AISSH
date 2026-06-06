import type { AIChatMessageDraft, SessionAgentState } from '../types'

type SelectConversationOptions = {
  sessionId?: string
  resetAgentState?: boolean
  bindToSession?: boolean
}

type UseAIConversationStrategyArgs = {
  activeConversationIdRef: React.RefObject<string>
  activeSessionIdRef: React.RefObject<string>
  aiMessagesRef: React.RefObject<AIChatMessageDraft[]>
  aiUnifiedPrompt: string
  aiAssistantResponse: { answer?: string; summary?: string } | null
  clearPreviewConversationId: (sessionId: string) => void
  createAIConversation: (title?: string, sessionId?: string) => Promise<{ id: string }>
  getLiveConversationId: (sessionId: string) => string
  getSessionAgentState: (sessionId: string) => SessionAgentState
  loadAIMessages: (conversationId: string, sessionId?: string) => Promise<AIChatMessageDraft[]>
  normalizeConversationContextLimit: () => number
  setActiveConversationId: (conversationId: string) => void
  setAiAssistantResponse: (response: null) => void
  setLiveConversationId: (sessionId: string, conversationId: string) => void
  resetAIStreamBuffers: () => void
  resetSessionAgentState: (sessionId: string) => void
}

export function useAIConversationStrategy({
  activeConversationIdRef,
  activeSessionIdRef,
  aiMessagesRef,
  aiUnifiedPrompt,
  aiAssistantResponse,
  clearPreviewConversationId,
  createAIConversation,
  getLiveConversationId,
  getSessionAgentState,
  loadAIMessages,
  normalizeConversationContextLimit,
  setActiveConversationId,
  setAiAssistantResponse,
  setLiveConversationId,
  resetAIStreamBuffers,
  resetSessionAgentState,
}: UseAIConversationStrategyArgs) {
  const ensureAIConversation = async (title = '新对话', sessionId = activeSessionIdRef.current || '') => {
    const liveConversationId = sessionId ? getLiveConversationId(sessionId) : ''
    if (liveConversationId) {
      if (activeConversationIdRef.current !== liveConversationId) {
        setActiveConversationId(liveConversationId)
      }
      clearPreviewConversationId(sessionId)
      return liveConversationId
    }
    if (activeConversationIdRef.current && sessionId) {
      setLiveConversationId(sessionId, activeConversationIdRef.current)
      clearPreviewConversationId(sessionId)
      return activeConversationIdRef.current
    }
    const conversation = await createAIConversation(title, sessionId)
    return conversation.id
  }

  const selectAIConversation = async (
    conversationId: string,
    options: SelectConversationOptions = {},
    setPreviewConversationId?: (sessionId: string, conversationId: string) => void,
  ) => {
    const sessionId = options.sessionId ?? activeSessionIdRef.current ?? ''
    setActiveConversationId(conversationId)
    if (sessionId) {
      if (options.bindToSession === false) {
        setPreviewConversationId?.(sessionId, conversationId)
      } else {
        setLiveConversationId(sessionId, conversationId)
        clearPreviewConversationId(sessionId)
      }
    }
    setAiAssistantResponse(null)
    resetAIStreamBuffers()
    if (options.resetAgentState !== false && sessionId) {
      resetSessionAgentState(sessionId)
    }
    await loadAIMessages(conversationId, sessionId)
  }

  const currentConversationContext = (conversationId = activeConversationIdRef.current || '') => {
    const limit = normalizeConversationContextLimit()
    return aiMessagesRef.current
      .filter(
        (message) =>
          message.conversationId === conversationId &&
          !message.pending &&
          ['user', 'assistant', 'command', 'agent_step', 'agent_result'].includes(message.kind),
      )
      .slice(-limit)
      .map((message) => {
        const label = message.kind === 'user' ? '用户' : message.kind === 'command' ? 'AI命令' : message.kind === 'agent_step' ? '执行步骤' : 'AI'
        if (message.kind === 'agent_step' && message.step) {
          const output = message.step.output ? `\n输出摘要: ${message.step.output.slice(-2000)}` : ''
          const exitCode = typeof message.step.exitCode === 'number' ? `\n退出码: ${message.step.exitCode}` : ''
          return `${label}: ${message.step.command || message.content}\n状态: ${message.step.status}${exitCode}${output}`
        }
        return `${label}: ${message.content}`
      })
      .join('\n')
  }

  const recentConversationContext = (conversationId = activeConversationIdRef.current || '', recentCount = 8) => {
    const recent = aiMessagesRef.current
      .filter(
        (message) =>
          message.conversationId === conversationId &&
          !message.pending &&
          ['user', 'assistant', 'command', 'agent_step', 'agent_result'].includes(message.kind),
      )
      .slice(-Math.max(1, recentCount))
      .map((message) => {
        const label = message.kind === 'user' ? '用户' : message.kind === 'command' ? 'AI命令' : message.kind === 'agent_step' ? '执行步骤' : 'AI'
        if (message.kind === 'agent_step' && message.step) {
          const output = message.step.output ? `
输出摘要: ${message.step.output.slice(-1200)}` : ''
          const exitCode = typeof message.step.exitCode === 'number' ? `
退出码: ${message.step.exitCode}` : ''
          return `${label}: ${message.step.command || message.content}
状态: ${message.step.status}${exitCode}${output}`
        }
        return `${label}: ${message.content}`
      })
      .join('\n')
    const summary = currentConversationContext(conversationId)
    if (!summary) {
      return recent
    }
    return recent.startsWith(summary) ? recent.slice(summary.length).trimStart() : recent
  }

  const resolveAgentGoal = (fallback = '', sessionId = activeSessionIdRef.current || '') => {
    return (
      (sessionId ? getSessionAgentState(sessionId).goal.trim() : '') ||
      aiUnifiedPrompt.trim() ||
      aiAssistantResponse?.answer?.trim() ||
      aiAssistantResponse?.summary?.trim() ||
      fallback.trim()
    )
  }

  return {
    currentConversationContext,
    ensureAIConversation,
    recentConversationContext,
    resolveAgentGoal,
    selectAIConversation,
  }
}
