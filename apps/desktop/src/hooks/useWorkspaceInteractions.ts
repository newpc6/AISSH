import { useEffect } from 'react'
import { openSearchPanel } from '@codemirror/search'
import type { CodeMirrorEditorHandle } from '../components/files/CodeMirrorEditor'
import type { FilePreviewTab } from '../types'

type UseWorkspaceInteractionsArgs = {
  activeFilePreview: FilePreviewTab | null
  activeViewId: string
  codeMirrorRef: React.RefObject<CodeMirrorEditorHandle | null>
  filePreviewTabCount: number
  sessionCount: number
  sessionTabsRef: React.RefObject<HTMLDivElement | null>
}

export function useWorkspaceInteractions({
  activeFilePreview,
  activeViewId,
  codeMirrorRef,
  filePreviewTabCount,
  sessionCount,
  sessionTabsRef,
}: UseWorkspaceInteractionsArgs) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f') {
        return
      }
      if (activeFilePreview?.kind !== 'text' || activeFilePreview.status !== 'ready') {
        return
      }
      event.preventDefault()
      codeMirrorRef.current?.runCommand(openSearchPanel)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeFilePreview?.id, activeFilePreview?.kind, activeFilePreview?.status, codeMirrorRef])

  useEffect(() => {
    const container = sessionTabsRef.current
    const activeTab = container?.querySelector<HTMLElement>('.session-tab.active')
    activeTab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeViewId, filePreviewTabCount, sessionCount, sessionTabsRef])
}
