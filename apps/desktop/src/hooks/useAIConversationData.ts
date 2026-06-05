import { useEffect, useRef, useState, type RefObject } from 'react'
import type {
  AIChatConversation,
  AIChatConversationCreateRequest,
  AIChatConversationListResponse,
  AIChatMessagesResponse,
} from '@ai-ssh/shared-contracts'
import type { AIAgentPlanStep, AIChatMessageDraft } from '../types'

type UseAIConversationDataArgs = {
  activeConversationIdRef: RefObject<string>
  activeSessionIdRef: RefObject<string>
  aiMessagesRef: RefObject<AIChatMessageDraft[]>
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
  readResponseErrorDetail: (response: Response) => Promise<string>
  resetAIStreamBuffers: () => void
  resetSessionAgentState: (sessionId: string) => void
  setActiveConversationId: (conversationId: string) => void
  setAiAssistantError: (message: string) => void
  setAiAssistantResponse: (response: unknown) => void
  setAiMessages: React.Dispatch<React.SetStateAction<AIChatMessageDraft[]>>
  setLiveConversationId: (sessionId: string, conversationId: string) => void
  clearPreviewConversationId: (sessionId: string) => void
  getDisplayedConversationId: (sessionId: string) => string
  removeConversationReferences: (conversationId: string) => void
  setSessionStepsFromMessages: (sessionId: string, steps: AIAgentPlanStep[]) => void
}

export function useAIConversationData({
  activeConversationIdRef,
  activeSessionIdRef,
  aiMessagesRef,
  apiFetch,
  readResponseErrorDetail,
  resetAIStreamBuffers,
  resetSessionAgentState,
  setActiveConversationId,
  setAiAssistantError,
  setAiAssistantResponse,
  setAiMessages,
  setLiveConversationId,
  clearPreviewConversationId,
  getDisplayedConversationId,
  removeConversationReferences,
  setSessionStepsFromMessages,
}: UseAIConversationDataArgs) {
  const [aiConversations, setAiConversations] = useState<AIChatConversation[]>([])
  const [hasMoreConversations, setHasMoreConversations] = useState(false)
  const aiConversationsRef = useRef<AIChatConversation[]>([])

  useEffect(() => {
    aiConversationsRef.current = aiConversations
  }, [aiConversations])

  const loadAIConversations = async (replace = true) => {
    const lastConversation = replace ? undefined : aiConversationsRef.current[aiConversationsRef.current.length - 1]
    const cursor = lastConversation?.updatedAt ? `?before=${encodeURIComponent(lastConversation.updatedAt)}&limit=30` : '?limit=30'
    const response = await apiFetch(`/ai/chats${cursor}`)
    if (!response.ok) {
      throw new Error((await readResponseErrorDetail(response)) || `加载 AI 对话失败：${response.status}`)
    }
    const data = (await response.json()) as AIChatConversationListResponse
    if (replace) {
      setAiConversations(data.conversations)
    } else {
      setAiConversations((current) => [...current, ...data.conversations])
    }
    setHasMoreConversations(data.conversations.length >= 30)
    return data.conversations
  }

  const loadAIMessages = async (conversationId: string, sessionId = activeSessionIdRef.current || '') => {
    if (!conversationId) {
      setAiMessages([])
      aiMessagesRef.current = []
      return []
    }
    const response = await apiFetch(`/ai/chats/${conversationId}/messages`)
    if (!response.ok) {
      throw new Error((await readResponseErrorDetail(response)) || `加载 AI 消息失败：${response.status}`)
    }
    const data = (await response.json()) as AIChatMessagesResponse
    const messages = data.messages.filter((message) => message.conversationId === conversationId)
    if (activeConversationIdRef.current !== conversationId) {
      return messages
    }
    setAiMessages(messages)
    aiMessagesRef.current = messages
    const sessionSteps = messages
      .map((message) => (message.kind === 'agent_step' && message.step ? ({ ...message.step, id: message.id } as AIAgentPlanStep) : null))
      .filter((step): step is AIAgentPlanStep => Boolean(step))
      .slice(-30)
      .reverse()
    if (sessionId) {
      setSessionStepsFromMessages(sessionId, sessionSteps)
    }
    return messages
  }

  const isConversationEmpty = (conversationId = activeConversationIdRef.current || '') =>
    Boolean(conversationId) && conversationId === activeConversationIdRef.current && aiMessagesRef.current.length === 0

  const createAIConversation = async (title = '新对话', sessionId = activeSessionIdRef.current || '') => {
    if (isConversationEmpty()) {
      const existing = aiConversationsRef.current.find((item) => item.id === activeConversationIdRef.current)
      if (existing) {
        if (sessionId) {
          setLiveConversationId(sessionId, existing.id)
          clearPreviewConversationId(sessionId)
        }
        return existing
      }
      const draftConversation = {
        id: activeConversationIdRef.current || '',
        title,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      if (sessionId) {
        setLiveConversationId(sessionId, draftConversation.id)
        clearPreviewConversationId(sessionId)
      }
      return draftConversation
    }
    const body: AIChatConversationCreateRequest = { title }
    const response = await apiFetch('/ai/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error((await readResponseErrorDetail(response)) || `创建 AI 对话失败：${response.status}`)
    }
    const conversation = (await response.json()) as AIChatConversation
    setAiConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)])
    setActiveConversationId(conversation.id)
    if (sessionId) {
      setLiveConversationId(sessionId, conversation.id)
      clearPreviewConversationId(sessionId)
    }
    setAiMessages([])
    aiMessagesRef.current = []
    setAiAssistantResponse(null)
    resetAIStreamBuffers()
    if (activeSessionIdRef.current) {
      resetSessionAgentState(activeSessionIdRef.current)
    }
    return conversation
  }

  const removeAIConversation = async (
    conversationId: string,
    afterDelete: (nextConversationId: string, sessionId: string) => Promise<void>,
  ) => {
    const response = await apiFetch(`/ai/chats/${conversationId}`, { method: 'DELETE' })
    if (!response.ok) {
      setAiAssistantError((await readResponseErrorDetail(response)) || `删除 AI 对话失败：${response.status}`)
      return
    }
    removeConversationReferences(conversationId)
    const nextConversations = aiConversationsRef.current.filter((item) => item.id !== conversationId)
    setAiConversations(nextConversations)
    if (conversationId === activeConversationIdRef.current) {
      setActiveConversationId('')
      setAiMessages([])
      aiMessagesRef.current = []
      resetAIStreamBuffers()
      setAiAssistantResponse(null)
      const sessionId = activeSessionIdRef.current || ''
      const nextDisplayedConversationId = sessionId ? getDisplayedConversationId(sessionId) : ''
      if (sessionId && !nextDisplayedConversationId) {
        resetSessionAgentState(sessionId)
      }
      if (nextDisplayedConversationId) {
        await afterDelete(nextDisplayedConversationId, sessionId)
      } else if (nextConversations.length > 0) {
        await afterDelete(nextConversations[0].id, sessionId)
      } else {
        await createAIConversation('新对话', sessionId)
      }
    }
  }

  return {
    aiConversations,
    aiConversationsRef,
    createAIConversation,
    hasMoreConversations,
    loadAIConversations,
    loadAIMessages,
    removeAIConversation,
  }
}
