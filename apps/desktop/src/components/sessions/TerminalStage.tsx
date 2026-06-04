import type { CSSProperties, PointerEvent, RefObject } from 'react'
import type { HostRecord, SessionRecord } from '@ai-ssh/shared-contracts'
import type {
  AIPredictionSessionState,
  PredictionGhostPosition,
  TerminalSelectionAction,
} from '../../types'
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
  const showTerminalSurface = Boolean(activeSession) && !isFilePreviewActive

  return (
    <section className={`terminal-stage ${isFilePreviewActive ? 'show-file-preview' : ''}`}>
      {!isFilePreviewActive && activeSession ? (
        <div className="terminal-header">
          <div>
            <strong>{activeSession.hostName}</strong>
            <span>
              {activeHost
                ? `${activeHost.username}@${activeHost.address}:${activeHost.port}`
                : activeSession.hostId}
            </span>
          </div>
          <span className={`session-pill session-${activeSession.status}`}>
            {sessionStatusLabel(activeSession.status)}
          </span>
          {activeSession.status === 'error' || activeSession.status === 'closed' ? (
            <button
              className="terminal-reconnect"
              type="button"
              title="重连当前 SSH 会话"
              onClick={() => void onReconnectSession(activeSession)}
            >
              重连
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
            title="应用 AI 预测命令"
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
            title="把当前选中的终端文本加入 AI 输入框"
            onClick={onAddTerminalSelectionToAI}
          >
            加入 AI
          </button>
        ) : null}
        {!activeSession && !isFilePreviewActive ? (
          <div className="terminal-empty">
            <div className="terminal-empty-intro">
              <p className="section-label">快速连接</p>
              <h2>选择一个服务器开始 SSH 会话</h2>
              <p className="terminal-empty-subtitle">双击左侧服务器卡片可以直接连接，或者从最近连接的服务器开始。</p>
            </div>
            <div className="recent-hosts-panel">
              <div className="recent-hosts-header">
                <strong>最近连接</strong>
                <span>{recentHosts.length > 0 ? '从这里恢复常用服务器连接' : '先添加一个服务器开始使用'}</span>
              </div>
              <div className="recent-hosts">
                {recentHosts.length > 0 ? (
                  recentHosts.map((host) => (
                    <button key={host.id} type="button" title={`连接 ${host.name}`} onClick={() => void onCreateSession(host.id)}>
                      <strong title={host.name}>{host.name}</strong>
                      <span>{host.username}@{host.address}:{host.port}</span>
                    </button>
                  ))
                ) : (
                  <button type="button" title="新增 SSH 连接" onClick={onOpenAddHostDialog}>
                    <strong>新增 SSH 连接</strong>
                    <span>保存后双击服务器卡片即可连接</span>
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
              aria-label="拖动调整 AI 预测区域高度"
              className="prediction-panel-resizer"
              role="separator"
              tabIndex={0}
              title="拖动调整 AI 预测区域高度"
              onPointerDown={onStartPredictionPanelResize}
            />
          ) : null}
          <div className="terminal-prediction-header">
            <div>
              <strong>AI 预测</strong>
              <span>{activeSession.hostName}</span>
            </div>
            <label className="prediction-toggle" title="开启后只针对手动输入的命令预测下一步">
              <input
                checked={aiPredictionEnabled}
                disabled={!aiEnabled}
                onChange={(event) => onSetAIPredictionEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>自动预测</span>
            </label>
            <button
              className="prediction-collapse-button"
              type="button"
              title={isPredictionDockCollapsed ? '展开 AI 预测区域' : '收起 AI 预测区域'}
              onClick={() => onSetIsPredictionDockCollapsed((current) => !current)}
            >
              <span aria-hidden="true">{isPredictionDockCollapsed ? '▾' : '▴'}</span>
            </button>
          </div>
          {!isPredictionDockCollapsed ? (
            <div className="terminal-prediction-body">
              {activePrediction.state === 'loading' ? (
                <div className="prediction-loading">
                  <span aria-hidden="true" className="file-loading-spinner" />
                  <span>正在流式预测下一步命令...</span>
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
                  <summary>预测思考 <span className="collapse-icon">▾</span></summary>
                  <pre>{activePrediction.thinking}</pre>
                </details>
              ) : null}
              {activePrediction.streamingContent && activePredictions.length === 0 ? (
                <article className="ai-stream-card compact-stream">
                  <strong>预测内容</strong>
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
                          title={`切换到第 ${index + 1} 条 AI 预测命令`}
                          onClick={() => onSelectPrediction(index)}
                        >
                          <strong>{index === activePredictionIndex ? '当前建议' : `建议 ${index + 1}`}</strong>
                          <code>{command}</code>
                        </button>
                        <button
                          className={`favorite-command-button ${favorited ? 'active' : ''}`}
                          type="button"
                          title={favorited ? `取消收藏：${command}` : `收藏命令：${command}`}
                          onClick={() => onToggleFavoriteCommand(command)}
                        >
                          {favorited ? '★' : '☆'}
                        </button>
                        <button
                          className="copy-command-button"
                          type="button"
                          title={`复制命令：${command}`}
                          onClick={() => void onCopyCommand(command)}
                        >
                          复制
                        </button>
                        <button
                          className="execute-command-button"
                          disabled={!activeSessionConnected}
                          type="button"
                          title={`执行 AI 预测命令：${command}`}
                          onClick={() => onExecuteCommand(command)}
                        >
                          执行
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
              {activePredictions.length > 0 ? (
                <p className="hint-text">空命令行按 Tab 循环切换建议，按回车执行当前建议；按 Shift+Tab 可手动重新触发预测，输入其他字符会清空建议。</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
