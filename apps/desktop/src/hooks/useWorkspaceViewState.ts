import { useMemo } from 'react'
import type { HostRecord, SessionRecord } from '@ai-ssh/shared-contracts'
import type { FilePreviewTab } from '../types'

type UseWorkspaceViewStateArgs = {
  activeSessionId: string
  activeViewId: string
  filePreviewTabs: FilePreviewTab[]
  hosts: HostRecord[]
  selectedHostId: string
  sessions: SessionRecord[]
}

export function useWorkspaceViewState({
  activeSessionId,
  activeViewId,
  filePreviewTabs,
  hosts,
  selectedHostId,
  sessions,
}: UseWorkspaceViewStateArgs) {
  const currentHost = useMemo(
    () => hosts.find((host) => host.id === selectedHostId) ?? null,
    [hosts, selectedHostId],
  )
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null,
    [activeSessionId, sessions],
  )
  const activeFilePreview = useMemo(
    () => filePreviewTabs.find((tab) => `file:${tab.id}` === activeViewId) ?? null,
    [activeViewId, filePreviewTabs],
  )
  const isFilePreviewActive = Boolean(activeFilePreview)
  const activeHost = useMemo(
    () => hosts.find((host) => host.id === activeSession?.hostId) ?? currentHost,
    [hosts, activeSession, currentHost],
  )

  return {
    activeFilePreview,
    activeHost,
    activeSession,
    currentHost,
    isFilePreviewActive,
  }
}
