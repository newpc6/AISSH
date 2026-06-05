import type { KeyboardEvent, RefObject, WheelEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionRecord } from '@ai-ssh/shared-contracts'
import type { FilePreviewTab } from '../../types'
import { sessionStatusLabel } from '../../utils'

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
  const { t } = useTranslation()
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
          <span className={`tab-status tab-status-${session.status}`} title={sessionStatusLabel(session.status, t)} />
          <span className="tab-title">{session.hostName}</span>
          <button
            className="tab-close"
            type="button"
            aria-label={t('sessionTabs.closeSession', { name: session.hostName })}
            title={t('sessionTabs.closeSession', { name: session.hostName })}
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
          title={t('sessionTabs.fileTabTitle', { host: tab.hostName, path: tab.path })}
          onClick={() => onActivateFilePreview(tab.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => handleTabKeyDown(event, () => onActivateFilePreview(tab.id))}
        >
          <span
            className={`tab-status tab-status-${tab.status === 'error' ? 'error' : tab.status === 'loading' ? 'connecting' : 'connected'}`}
            title={t(`fileBrowser.kind.${tab.kind === 'binary' ? 'binary' : tab.kind}`)}
          />
          <span className="tab-title tab-file-title">
            <small>{tab.hostName}</small>
            <span>{tab.name}</span>
          </span>
          <button
            className="tab-close"
            type="button"
            aria-label={t('sessionTabs.closeFile', { name: tab.name })}
            title={t('sessionTabs.closeFile', { name: tab.name })}
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
        <button className="session-new" type="button" title={t('sessionTabs.newSession')} onClick={() => void onCreateSession()}>
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
            title={t('sessionTabs.copySSHInfo')}
            onClick={() => {
              onSessionTabMenuChange(null)
              void onCopySessionSSHInfo(menuSession)
            }}
          >
            {t('sessionTabs.copySSH')}
          </button>
          <button
            type="button"
            title={t('sessionTabs.closeCurrent')}
            onClick={() => {
              onSessionTabMenuChange(null)
              void onCloseSession(menuSession)
            }}
          >
            {t('sessionTabs.closeCurrent')}
          </button>
          <button
            type="button"
            title={t('sessionTabs.closeAll')}
            onClick={() => {
              onSessionTabMenuChange(null)
              void onCloseAllSessions()
            }}
          >
            {t('sessionTabs.closeAll')}
          </button>
          <button
            type="button"
            title={t('sessionTabs.closeOthers')}
            onClick={() => {
              onSessionTabMenuChange(null)
              void onCloseOtherSessions(menuSession)
            }}
          >
            {t('sessionTabs.closeOthers')}
          </button>
          <button
            disabled={menuSessionIndex < 0 || menuSessionIndex >= sessions.length - 1}
            type="button"
            title={t('sessionTabs.closeRight')}
            onClick={() => {
              onSessionTabMenuChange(null)
              void onCloseSessionsToRight(menuSession)
            }}
          >
            {t('sessionTabs.closeRight')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
