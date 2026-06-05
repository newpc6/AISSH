import { useEffect, useRef, useState, type RefObject } from 'react'
import type {
  AIChatMessage,
  AIChatMessageCreateRequest,
  AIChatMessageKind,
  AIChatMessageUpdateRequest,
} from '@ai-ssh/shared-contracts'
import type { AIChatMessageDraft } from '../types'

type UseAIMessageStoreArgs = {
  activeConversationIdRef: RefObject<string>
  aiMessageListRef: RefObject<HTMLDivElement | null>
  appendLog: (level: 'debug' | 'info' | 'warn' | 'error', source: string, message: string, details?: Record<string, unknown>) => void
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
  loadAIConversations: () => void | Promise<void>
  readResponseErrorDetail: (response: Response) => Promise<string>
}

export function useAIMessageStore({
  activeConversationIdRef,
  aiMessageListRef,
  appendLog,
  apiFetch,
  loadAIConversations,
  readResponseErrorDetail,
}: UseAIMessageStoreArgs) {
  const [aiMessages, setAiMessages] = useState<AIChatMessageDraft[]>([])
  const [aiStreamThinking, setAiStreamThinking] = useState('')
  const [aiStreamContent, setAiStreamContent] = useState('')
  const aiMessagesRef = useRef<AIChatMessageDraft[]>([])
  const aiMessageConversationIdsRef = useRef<Record<string, string>>({})
  const aiStreamThinkingRef = useRef('')
  const aiStreamContentRef = useRef('')
  const aiStreamThinkingMessageIdRef = useRef('')
  const aiStreamContentMessageIdRef = useRef('')
  const thinkingScrollFrameRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    aiMessagesRef.current = aiMessages
    aiMessageConversationIdsRef.current = aiMessages.reduce<Record<string, string>>((map, message) => {
      map[message.id] = message.conversationId
      return map
    }, { ...aiMessageConversationIdsRef.current })
  }, [aiMessages])

  useEffect(
    () => () => {
      if (thinkingScrollFrameRef.current) {
        window.cancelAnimationFrame(thinkingScrollFrameRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (!aiStreamThinking) {
      return
    }
    const messageId = aiStreamThinkingMessageIdRef.current
    if (!messageId) {
      return
    }
    if (thinkingScrollFrameRef.current) {
      window.cancelAnimationFrame(thinkingScrollFrameRef.current)
    }
    thinkingScrollFrameRef.current = window.requestAnimationFrame(() => {
      thinkingScrollFrameRef.current = undefined
      const card = aiMessageListRef.current?.querySelector<HTMLElement>(`[data-ai-message-id="${messageId}"] .markdown-body`)
      if (!card) {
        return
      }
      card.scrollTop = card.scrollHeight
    })
  }, [aiMessageListRef, aiStreamThinking])

  const makeLocalAIMessage = (
    kind: AIChatMessageKind,
    content: string,
    extras: Partial<AIChatMessage> = {},
    conversationId = activeConversationIdRef.current || '',
  ): AIChatMessageDraft => ({
    id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    conversationId,
    kind,
    content,
    createdAt: new Date().toISOString(),
    ...extras,
  })

  const persistAIMessageRequest = async (
    conversationId: string,
    message: AIChatMessageCreateRequest,
  ): Promise<AIChatMessageDraft> => {
    const response = await apiFetch(`/ai/chats/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
    if (!response.ok) {
      throw new Error((await readResponseErrorDetail(response)) || `保存 AI 消息失败：${response.status}`)
    }
    return (await response.json()) as AIChatMessageDraft
  }

  const updatePersistedAIMessageRequest = async (
    conversationId: string,
    messageId: string,
    message: AIChatMessageUpdateRequest,
  ): Promise<AIChatMessageDraft> => {
    const response = await apiFetch(`/ai/chats/${conversationId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
    if (!response.ok) {
      throw new Error((await readResponseErrorDetail(response)) || `更新 AI 消息失败：${response.status}`)
    }
    return (await response.json()) as AIChatMessageDraft
  }

  const appendAIMessage = async (
    kind: AIChatMessageKind,
    content: string,
    extras: Partial<AIChatMessage> = {},
    conversationId = activeConversationIdRef.current || '',
  ) => {
    if (!conversationId) {
      const local = makeLocalAIMessage(kind, content, extras, conversationId)
      aiMessageConversationIdsRef.current[local.id] = local.conversationId
      setAiMessages((current) => [...current, local])
      return local
    }
    const local = { ...makeLocalAIMessage(kind, content, extras, conversationId), pending: true }
    aiMessageConversationIdsRef.current[local.id] = conversationId
    setAiMessages((current) => [...current, local])
    try {
      const persisted = await persistAIMessageRequest(conversationId, {
        kind,
        content,
        response: extras.response,
        step: extras.step,
      })
      delete aiMessageConversationIdsRef.current[local.id]
      aiMessageConversationIdsRef.current[persisted.id] = persisted.conversationId
      setAiMessages((current) => current.map((item) => (item.id === local.id ? persisted : item)))
      void loadAIConversations()
      return persisted
    } catch (error) {
      setAiMessages((current) => current.map((item) => (item.id === local.id ? { ...item, pending: false } : item)))
      appendLog('warn', 'ui.ai', 'persist ai message failed', { error: error instanceof Error ? error.message : String(error) })
      return local
    }
  }

  const resetAIStreamBuffers = () => {
    aiStreamThinkingRef.current = ''
    aiStreamContentRef.current = ''
    aiStreamThinkingMessageIdRef.current = ''
    aiStreamContentMessageIdRef.current = ''
    setAiStreamThinking('')
    setAiStreamContent('')
  }

  const startStreamingThinkingMessage = (conversationId = activeConversationIdRef.current || '') => {
    const message = makeLocalAIMessage('thinking', '', {}, conversationId)
    aiMessageConversationIdsRef.current[message.id] = message.conversationId
    aiStreamThinkingMessageIdRef.current = message.id
    setAiMessages((current) => [...current, message])
  }

  const updateStreamingThinkingMessage = (text: string, conversationId = activeConversationIdRef.current || '') => {
    if (!text) {
      return
    }
    if (!aiStreamThinkingMessageIdRef.current) {
      startStreamingThinkingMessage(conversationId)
    }
    const messageId = aiStreamThinkingMessageIdRef.current
    setAiMessages((current) => current.map((item) => (item.id === messageId ? { ...item, content: `${item.content}${text}` } : item)))
  }

  const startStreamingContentMessage = (conversationId = activeConversationIdRef.current || '') => {
    const message = makeLocalAIMessage('content', '', {}, conversationId)
    aiMessageConversationIdsRef.current[message.id] = message.conversationId
    aiStreamContentMessageIdRef.current = message.id
    setAiMessages((current) => [...current, message])
  }

  const updateStreamingContentMessage = (text: string, conversationId = activeConversationIdRef.current || '') => {
    if (!text) {
      return
    }
    if (!aiStreamContentMessageIdRef.current) {
      startStreamingContentMessage(conversationId)
    }
    const messageId = aiStreamContentMessageIdRef.current
    setAiMessages((current) => current.map((item) => (item.id === messageId ? { ...item, content: `${item.content}${text}` } : item)))
  }

  const removeStreamingContentMessage = () => {
    const messageId = aiStreamContentMessageIdRef.current
    if (!messageId) {
      return
    }
    setAiMessages((current) => current.filter((item) => item.id !== messageId))
    aiStreamContentMessageIdRef.current = ''
  }

  const persistStreamingContentMessage = async (conversationId: string) => {
    const content = aiStreamContentRef.current.trim()
    const messageId = aiStreamContentMessageIdRef.current
    if (!content || !messageId) {
      return
    }
    try {
      const persisted = await persistAIMessageRequest(conversationId, { kind: 'content', content })
      aiMessageConversationIdsRef.current[persisted.id] = persisted.conversationId
      setAiMessages((current) => current.map((item) => (item.id === messageId ? persisted : item)))
    } catch (error) {
      appendLog('warn', 'ui.ai', 'persist streaming content message failed', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  const persistStreamingThinkingMessage = async (conversationId: string) => {
    const content = aiStreamThinkingRef.current.trim()
    const messageId = aiStreamThinkingMessageIdRef.current
    if (!content || !messageId) {
      return
    }
    try {
      const persisted = await persistAIMessageRequest(conversationId, { kind: 'thinking', content })
      aiMessageConversationIdsRef.current[persisted.id] = persisted.conversationId
      setAiMessages((current) => current.map((item) => (item.id === messageId ? persisted : item)))
    } catch (error) {
      appendLog('warn', 'ui.ai', 'persist thinking message failed', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  const persistStreamingArtifacts = async (conversationId: string, keepContent = false) => {
    await persistStreamingThinkingMessage(conversationId)
    if (keepContent) {
      await persistStreamingContentMessage(conversationId)
    } else {
      removeStreamingContentMessage()
    }
  }

  const replaceAIMessage = (messageId: string, patch: Partial<AIChatMessageDraft>) => {
    setAiMessages((current) => current.map((message) => (message.id === messageId ? { ...message, ...patch } : message)))
  }

  const replaceAndPersistAIMessage = (messageId: string, patch: Partial<AIChatMessageDraft>) => {
    replaceAIMessage(messageId, patch)
    const conversationId = aiMessageConversationIdsRef.current[messageId] || activeConversationIdRef.current || ''
    if (!conversationId || !messageId.startsWith('msg-')) {
      return
    }
    void updatePersistedAIMessageRequest(conversationId, messageId, {
      content: patch.content,
      response: patch.response,
      step: patch.step,
    })
      .then((message) => replaceAIMessage(messageId, message))
      .catch((error) =>
        appendLog('warn', 'ui.ai', 'update ai message failed', {
          messageID: messageId,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
  }

  return {
    aiMessageConversationIdsRef,
    aiMessages,
    aiMessagesRef,
    aiStreamContent,
    aiStreamContentRef,
    aiStreamThinking,
    aiStreamThinkingRef,
    appendAIMessage,
    persistStreamingArtifacts,
    replaceAIMessage,
    replaceAndPersistAIMessage,
    resetAIStreamBuffers,
    setAiMessages,
    setAiStreamContent,
    setAiStreamThinking,
    updateStreamingContentMessage,
    updateStreamingThinkingMessage,
  }
}
