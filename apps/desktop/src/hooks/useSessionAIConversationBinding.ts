import { useEffect, useRef, useState } from 'react'

type ConversationMap = Record<string, string>

const setConversationMapEntry = (
  current: ConversationMap,
  sessionId: string,
  conversationId: string,
) => {
  if (!sessionId) {
    return current
  }
  if (!conversationId) {
    if (!(sessionId in current)) {
      return current
    }
    const next = { ...current }
    delete next[sessionId]
    return next
  }
  if (current[sessionId] === conversationId) {
    return current
  }
  return { ...current, [sessionId]: conversationId }
}

export function useSessionAIConversationBinding() {
  const [liveConversationIdBySession, setLiveConversationIdBySession] = useState<ConversationMap>({})
  const [previewConversationIdBySession, setPreviewConversationIdBySession] = useState<ConversationMap>({})
  const liveConversationIdBySessionRef = useRef<ConversationMap>({})
  const previewConversationIdBySessionRef = useRef<ConversationMap>({})

  useEffect(() => {
    liveConversationIdBySessionRef.current = liveConversationIdBySession
  }, [liveConversationIdBySession])

  useEffect(() => {
    previewConversationIdBySessionRef.current = previewConversationIdBySession
  }, [previewConversationIdBySession])

  const setLiveConversationId = (sessionId: string, conversationId: string) => {
    const next = setConversationMapEntry(liveConversationIdBySessionRef.current, sessionId, conversationId)
    if (next === liveConversationIdBySessionRef.current) {
      return
    }
    liveConversationIdBySessionRef.current = next
    setLiveConversationIdBySession(next)
  }

  const setPreviewConversationId = (sessionId: string, conversationId: string) => {
    const next = setConversationMapEntry(previewConversationIdBySessionRef.current, sessionId, conversationId)
    if (next === previewConversationIdBySessionRef.current) {
      return
    }
    previewConversationIdBySessionRef.current = next
    setPreviewConversationIdBySession(next)
  }

  const clearPreviewConversationId = (sessionId: string) => {
    setPreviewConversationId(sessionId, '')
  }

  const getLiveConversationId = (sessionId: string) => {
    if (!sessionId) {
      return ''
    }
    return liveConversationIdBySessionRef.current[sessionId] || ''
  }

  const getPreviewConversationId = (sessionId: string) => {
    if (!sessionId) {
      return ''
    }
    return previewConversationIdBySessionRef.current[sessionId] || ''
  }

  const getDisplayedConversationId = (sessionId: string) => {
    if (!sessionId) {
      return ''
    }
    return getPreviewConversationId(sessionId) || getLiveConversationId(sessionId)
  }

  const isPreviewingHistoryForSession = (sessionId: string) => {
    const previewConversationId = getPreviewConversationId(sessionId)
    return Boolean(previewConversationId && previewConversationId !== getLiveConversationId(sessionId))
  }

  const removeConversationReferences = (conversationId: string) => {
    if (!conversationId) {
      return
    }

    const nextLive = Object.fromEntries(
      Object.entries(liveConversationIdBySessionRef.current).filter(([, id]) => id !== conversationId),
    )
    if (Object.keys(nextLive).length !== Object.keys(liveConversationIdBySessionRef.current).length) {
      liveConversationIdBySessionRef.current = nextLive
      setLiveConversationIdBySession(nextLive)
    }

    const nextPreview = Object.fromEntries(
      Object.entries(previewConversationIdBySessionRef.current).filter(([, id]) => id !== conversationId),
    )
    if (Object.keys(nextPreview).length !== Object.keys(previewConversationIdBySessionRef.current).length) {
      previewConversationIdBySessionRef.current = nextPreview
      setPreviewConversationIdBySession(nextPreview)
    }
  }

  return {
    clearPreviewConversationId,
    getDisplayedConversationId,
    getLiveConversationId,
    getPreviewConversationId,
    isPreviewingHistoryForSession,
    liveConversationIdBySession,
    previewConversationIdBySession,
    removeConversationReferences,
    setLiveConversationId,
    setPreviewConversationId,
  }
}
