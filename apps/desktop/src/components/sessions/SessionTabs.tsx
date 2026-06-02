import type { KeyboardEvent, RefObject, WheelEvent } from 'react'
import type { SessionRecord } from '@ai-ssh/shared-contracts'
import type { FilePreviewTab } from '../../types'
import { previewKindLabel, sessionStatusLabel } from '../../utils'

type SessionTabMenuState = {
  sessionId: string
  x: number
  y: number
} | null

type SessionTabsProps = {
  activeViewId: string
  filePreviewTabs: FilePreviewTab[]
  sessionTabMenu: SessionTabMenuState
  sessionTabMenuRef: RefObject<HTMLDivElement | null>
  sessionTabsRef: RefObject<HTMLDivElement | null>
  sessions: SessionRecord[]
  onActivateFilePreview: (tabId: string) => void
  onActivateSession: (session: SessionRecord) => void
  onCloseAllSessions: () => void | Promise<void>
  onCloseFilePreview: (tabId: string) => void
  onCloseOtherSessions: (session: SessionRecord) => void | Promise<void>
  onCloseSession: (session: SessionRecord) => void | Promise<void>
  onCloseSessionsToRight: (session: SessionRecord) => void | Promise<void>
  onCopySessionSSHInfo: (session: SessionRecord) => void | Promise<void>
  onCreateSession: () => void | Promise<void>
  onSessionTabMenuChange: (next: SessionTabMenuState) => void
}

export function SessionTabs({
  activeViewId,
  filePreviewTabs,
  sessionTabMenu,
  sessionTabMenuRef,
  sessionTabsRef,
  sessions,
  onActivateFilePreview,
  onActivateSession,
  onCloseAllSessions,
  onCloseFilePreview,
  onCloseOtherSessions,
  onCloseSession,
  onCloseSessionsToRight,
  onCopySessionSSHInfo,
  onCreateSession,
  onSessionTabMenuChange,
}: SessionTabsProps) {
  const hasAnyTabs = sessions.length > 0 || filePreviewTabs.length > 0

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>, onEnter: () => void) => {
    if (event.key === 'Enter') {
      onEnter()
    }
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.currentTarget.scrollLeft += event.deltaY
    }
  }

  const menuSession = sessionTabMenu
    ? sessions.find((session) => session.id === sessionTabMenu.sessionId) ?? null
    : null
  const menuSessionIndex = menuSession ? sessions.findIndex((session) => session.id === menuSession.id) : -1

  return (
    <div ref={sessionTabsRef} className={`session-tabs ${hasAnyTabs ? '' : 'empty-state'}`} onWheel={handleWheel}>
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`session-tab ${activeViewId === `session:${session.id}` ? 'active' : ''}`}
          onClick={() => onActivateSession(session)}
          onContextMenu={(event) => {
            event.preventDefault()
            onSessionTabMenuChange({ sessionId: session.id, x: event.clientX, y: event.clientY })
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => handleTabKeyDown(event, () => onActivateSession(session))}
        >
          <span className={`tab-status tab-status-${session.status}`} title={sessionStatusLabel(session.status)} />
          <span className="tab-title">{session.hostName}</span>
          <button
            className="tab-close"
            type="button"
            aria-label={`关闭 ${session.hostName}`}
            title={`关闭 ${session.hostName}`}
            onClick={(event) => {
              event.stopPropagation()
              void onCloseSession(session)
            }}
          >
            x
          </button>
        </div>
      ))}
      {filePreviewTabs.map((tab) => (
        <div
          key={tab.id}
          className={`session-tab file-preview-tab ${activeViewId === `file:${tab.id}` ? 'active' : ''}`}
          title={`${tab.hostName} 路径 ${tab.path}`}
          onClick={() => onActivateFilePreview(tab.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => handleTabKeyDown(event, () => onActivateFilePreview(tab.id))}
        >
          <span
            className={`tab-status tab-status-${tab.status === 'error' ? 'error' : tab.status === 'loading' ? 'connecting' : 'connected'}`}
            title={previewKindLabel(tab.kind)}
          />
          <span className="tab-title tab-file-title">
            <small>{tab.hostName}</small>
            <span>{tab.name}</span>
          </span>
          <button
            className="tab-close"
            type="button"
            aria-label={`关闭 ${tab.name}`}
            title={`关闭 ${tab.name}`}
            onClick={(event) => {
              event.stopPropagation()
              onCloseFilePreview(tab.id)
            }}
          >
            x
          </button>
        </div>
      ))}
      {hasAnyTabs ? (
        <button className="session-new" type="button" title="新建 SSH 会话" onClick={() => void onCreateSession()}>
          +
        </button>
      ) : null}
      {sessionTabMenu && menuSession ? (
        <div
          ref={sessionTabMenuRef}
          className="session-tab-menu"
          style={{ left: sessionTabMenu.x, top: sessionTabMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            title="复制当前 SSH 连接信息"
            onClick={() => {
              onSessionTabMenuChange(null)
              void onCopySessionSSHInfo(menuSession)
            }}
          >
            复制 SSH
          </button>
          <button
            type="button"
            title="关闭当前 SSH 标签"
            onClick={() => {
              onSessionTabMenuChange(null)
              void onCloseSession(menuSession)
            }}
          >
            关闭当前
          </button>
          <button
            type="button"
            title="关闭全部 SSH 标签"
            onClick={() => {
              onSessionTabMenuChange(null)
              void onCloseAllSessions()
            }}
          >
            关闭全部
          </button>
          <button
            type="button"
            title="关闭其他 SSH 标签"
            onClick={() => {
              onSessionTabMenuChange(null)
              void onCloseOtherSessions(menuSession)
            }}
          >
            关闭其他
          </button>
          <button
            disabled={menuSessionIndex < 0 || menuSessionIndex >= sessions.length - 1}
            type="button"
            title="关闭右侧 SSH 标签"
            onClick={() => {
              onSessionTabMenuChange(null)
              void onCloseSessionsToRight(menuSession)
            }}
          >
            关闭右侧
          </button>
        </div>
      ) : null}
    </div>
  )
}
