import type { CSSProperties, PointerEvent, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { HostRecord, SessionRecord } from '@ai-ssh/shared-contracts'
import type {
  AIPredictionSessionState,
  PredictionGhostPosition,
  TerminalSelectionAction,
} from '../../types'
import { hostConnectionLabel } from '../../host-display'
import { sessionStatusLabel } from '../../utils'

type TerminalStageProps = {
  activePredictions: string[]
  activePrediction: AIPredictionSessionState
  activePredictionIndex: number
  activeSession: SessionRecord | null
  activeHost: HostRecord | null
  activeSessionConnected: boolean
  aiEnabled: boolean
  aiPredictionEnabled: boolean
  isFavoriteCommand: (command: string) => boolean
  isFilePreviewActive: boolean
  isPredictionDockCollapsed: boolean
  isPredictionThinkingExpanded: boolean
  predictionGhostPosition: PredictionGhostPosition | null
  predictionPanelHeight: number
  primaryPrediction: string
  recentHosts: HostRecord[]
  terminalRef: RefObject<HTMLDivElement | null>
  terminalSelectionAction: TerminalSelectionAction | null
  onAddTerminalSelectionToAI: () => void
  onApplyPrediction: () => void
  onCopyCommand: (command: string) => void | Promise<void>
  onCreateSession: (hostId?: string) => void | Promise<void>
  onExecuteCommand: (command: string) => void
  onOpenAddHostDialog: () => void
  onReconnectSession: (session: SessionRecord) => void | Promise<void>
  onSelectPrediction: (index: number) => void
  onSetAIPredictionEnabled: (enabled: boolean) => void
  onSetIsPredictionDockCollapsed: (updater: (current: boolean) => boolean) => void
  onSetPredictionThinkingExpanded: (open: boolean, sessionId: string) => void
  onStartPredictionPanelResize: (event: PointerEvent<HTMLDivElement>) => void
  onToggleFavoriteCommand: (command: string) => void
}

export function TerminalStage({
  activePredictions,
  activePrediction,
  activePredictionIndex,
  activeSession,
  activeHost,
  activeSessionConnected,
  aiEnabled,
  aiPredictionEnabled,
  isFavoriteCommand,
  isFilePreviewActive,
  isPredictionDockCollapsed,
  isPredictionThinkingExpanded,
  predictionGhostPosition,
  predictionPanelHeight,
  primaryPrediction,
  recentHosts,
  terminalRef,
  terminalSelectionAction,
  onAddTerminalSelectionToAI,
  onApplyPrediction,
  onCopyCommand,
  onCreateSession,
  onExecuteCommand,
  onOpenAddHostDialog,
  onReconnectSession,
  onSelectPrediction,
  onSetAIPredictionEnabled,
  onSetIsPredictionDockCollapsed,
  onSetPredictionThinkingExpanded,
  onStartPredictionPanelResize,
  onToggleFavoriteCommand,
}: TerminalStageProps) {
  const { t } = useTranslation()
  const showTerminalSurface = Boolean(activeSession) && !isFilePreviewActive

  return (
    <section className={`terminal-stage ${isFilePreviewActive ? 'show-file-preview' : ''}`}>
      {!isFilePreviewActive && activeSession ? (
        <div className="terminal-header">
          <div>
            <strong>{activeSession.hostName}</strong>
            <span>
              {activeHost
                ? hostConnectionLabel(activeHost)
                : activeSession.hostId}
            </span>
          </div>
          <span className={`session-pill session-${activeSession.status}`}>
            {sessionStatusLabel(activeSession.status, t)}
          </span>
          {activeSession.status === 'error' || activeSession.status === 'closed' ? (
            <button
              className="terminal-reconnect"
              type="button"
              title={t('terminalStage.reconnectSession')}
              onClick={() => void onReconnectSession(activeSession)}
            >
              {t('servers.reconnect')}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className={`terminal-wrap ${isFilePreviewActive ? 'terminal-hidden' : ''}`}>
        <div ref={terminalRef} className={`terminal-surface ${showTerminalSurface ? '' : 'terminal-surface-hidden'}`} />
        {activeSession && primaryPrediction && predictionGhostPosition ? (
          <button
            className="terminal-ghost-prediction"
            style={{
              left: predictionGhostPosition.left,
              top: predictionGhostPosition.top,
              maxWidth: predictionGhostPosition.maxWidth,
              height: predictionGhostPosition.height,
            }}
            type="button"
            title={t('terminalStage.applyPrediction')}
            onClick={onApplyPrediction}
          >
            {primaryPrediction}
          </button>
        ) : null}
        {terminalSelectionAction ? (
          <button
            className="terminal-selection-ai-button"
            style={{ left: terminalSelectionAction.left, top: terminalSelectionAction.top }}
            type="button"
            title={t('terminalStage.addSelectionToAI')}
            onClick={onAddTerminalSelectionToAI}
          >
            {t('terminalStage.addToAI')}
          </button>
        ) : null}
        {!activeSession && !isFilePreviewActive ? (
          <div className="terminal-empty">
            <div className="terminal-empty-intro">
              <p className="section-label">{t('terminalStage.quickConnect')}</p>
              <h2>{t('terminalStage.emptyTitle')}</h2>
              <p className="terminal-empty-subtitle">{t('terminalStage.emptySubtitle')}</p>
            </div>
            <div className="recent-hosts-panel">
              <div className="recent-hosts-header">
                <strong>{t('terminalStage.recentHosts')}</strong>
                <span>{recentHosts.length > 0 ? t('terminalStage.recentHostsHint') : t('terminalStage.addHostHint')}</span>
              </div>
              <div className="recent-hosts">
                {recentHosts.length > 0 ? (
                  recentHosts.map((host) => (
                    <button key={host.id} type="button" title={t('terminalStage.connectHost', { name: host.name })} onClick={() => void onCreateSession(host.id)}>
                      <strong title={host.name}>{host.name}</strong>
                      <span>{hostConnectionLabel(host)}</span>
                    </button>
                  ))
                ) : (
                  <button type="button" title={t('terminalStage.addConnection')} onClick={onOpenAddHostDialog}>
                    <strong>{t('terminalStage.addConnection')}</strong>
                    <span>{t('terminalStage.addConnectionHint')}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {activeSession && !isFilePreviewActive ? (
        <div
          className={`terminal-prediction-dock ${isPredictionDockCollapsed ? 'collapsed' : ''}`}
          style={{ '--prediction-panel-height': `${predictionPanelHeight}px` } as CSSProperties}
        >
          {!isPredictionDockCollapsed ? (
            <div
              aria-label={t('terminalStage.resizePredictionPanel')}
              className="prediction-panel-resizer"
              role="separator"
              tabIndex={0}
              title={t('terminalStage.resizePredictionPanel')}
              onPointerDown={onStartPredictionPanelResize}
            />
          ) : null}
          <div className="terminal-prediction-header">
            <div>
              <strong>{t('terminalStage.predictionTitle')}</strong>
              <span>{activeSession.hostName}</span>
            </div>
            <label className="prediction-toggle" title={t('terminalStage.autoPredictionHint')}>
              <input
                checked={aiPredictionEnabled}
                disabled={!aiEnabled}
                onChange={(event) => onSetAIPredictionEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>{t('terminalStage.autoPrediction')}</span>
            </label>
            <button
              className="prediction-collapse-button"
              type="button"
              title={isPredictionDockCollapsed ? t('terminalStage.expandPredictionPanel') : t('terminalStage.collapsePredictionPanel')}
              onClick={() => onSetIsPredictionDockCollapsed((current) => !current)}
            >
              <span aria-hidden="true">{isPredictionDockCollapsed ? '▴' : '▾'}</span>
            </button>
          </div>
          {!isPredictionDockCollapsed ? (
            <div className="terminal-prediction-body">
              {activePrediction.state === 'loading' ? (
                <div className="prediction-loading">
                  <span aria-hidden="true" className="file-loading-spinner" />
                  <span>{t('terminalStage.streamingPrediction')}</span>
                </div>
              ) : null}
              {activePrediction.thinking ? (
                <details
                  className="ai-stream-card compact-stream"
                  open={isPredictionThinkingExpanded}
                  onToggle={(event) => {
                    if (activePrediction.state === 'loading') {
                      return
                    }
                    onSetPredictionThinkingExpanded(event.currentTarget.open, activeSession.id)
                  }}
                >
                  <summary>{t('terminalStage.predictionThinking')} <span className="collapse-icon">▾</span></summary>
                  <pre>{activePrediction.thinking}</pre>
                </details>
              ) : null}
              {activePrediction.streamingContent && activePredictions.length === 0 ? (
                <article className="ai-stream-card compact-stream">
                  <strong>{t('terminalStage.predictionContent')}</strong>
                  <pre>{activePrediction.streamingContent}</pre>
                </article>
              ) : null}
              {activePrediction.error ? <p className="error-text">{activePrediction.error}</p> : null}
              {activePredictions.length > 0 ? (
                <div className="terminal-prediction-list">
                  {activePredictions.map((command, index) => {
                    const favorited = isFavoriteCommand(command)
                    return (
                      <div
                        className={`command-row prediction-row ${index === activePredictionIndex ? 'primary' : ''}`}
                        key={`${index}-${command}`}
                      >
                        <button
                          className="command-main"
                          type="button"
                          title={t('terminalStage.switchPrediction', { index: index + 1 })}
                          onClick={() => onSelectPrediction(index)}
                        >
                          <strong>{index === activePredictionIndex ? t('terminalStage.currentSuggestion') : t('terminalStage.suggestion', { index: index + 1 })}</strong>
                          <code>{command}</code>
                        </button>
                        <button
                          className={`favorite-command-button ${favorited ? 'active' : ''}`}
                          type="button"
                          title={favorited ? t('terminalStage.unfavoriteCommand', { command }) : t('terminalStage.favoriteCommand', { command })}
                          onClick={() => onToggleFavoriteCommand(command)}
                        >
                          {favorited ? '★' : '☆'}
                        </button>
                        <button
                          className="copy-command-button"
                          type="button"
                          title={t('terminalStage.copyCommand', { command })}
                          onClick={() => void onCopyCommand(command)}
                        >
                          {t('terminalStage.copy')}
                        </button>
                        <button
                          className="execute-command-button"
                          disabled={!activeSessionConnected}
                          type="button"
                          title={t('terminalStage.executePrediction', { command })}
                          onClick={() => onExecuteCommand(command)}
                        >
                          {t('terminalStage.execute')}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
              {activePredictions.length > 0 ? (
                <p className="hint-text">{t('terminalStage.predictionHint')}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
