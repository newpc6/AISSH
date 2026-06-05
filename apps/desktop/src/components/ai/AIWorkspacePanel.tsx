import type { RefObject, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AIAgentMode, AIChatConversation, AISkill } from '@ai-ssh/shared-contracts'
import type { AIChatMessageDraft, BatchHostResult, LoadState } from '../../types'
import { formatLocalizedDateTime } from '../../utils'

type BatchSelectedHost = {
  id: string
  name: string
}

type AIWorkspacePanelProps = {
  activeSessionName: string
  liveAIConversationId: string
  isPreviewingHistory: boolean
  isAIHistoryOpen: boolean
  aiConversations: AIChatConversation[]
  activeAIConversationId: string
  hasMoreConversations: boolean
  settingsAiEnabled: boolean
  isAIProviderConfigured: boolean
  aiMessages: AIChatMessageDraft[]
  aiAssistantState: LoadState
  shouldRenderAgentMessageCard: boolean
  agentState: LoadState
  normalizedAgentMessage: string
  isAIInputCollapsed: boolean
  aiAssistantError: string
  aiUnifiedInputPlaceholder: string
  aiUnifiedInputValue: string
  aiSkills: AISkill[]
  batchMode: boolean
  batchSelectedHosts: BatchSelectedHost[]
  batchActive: boolean
  agentMode: AIAgentMode
  batchTask: string
  batchHostResults: BatchHostResult[]
  batchHostIndex: number
  activeAIModelLabel: string
  activeAIModelTitle: string
  selectedAISkillIds: string[]
  aiMessageListRef: RefObject<HTMLDivElement | null>
  onAiMessageListScroll: () => void
  batchCardsRef: RefObject<HTMLDivElement | null>
  renderAIMessage: (message: AIChatMessageDraft) => ReactNode
  renderMarkdown: (content: string, fallback?: string) => ReactNode
  onCreateConversation: () => void
  onSelectConversation: (conversationId: string) => void
  onToggleAISkill: (skillId: string) => void
  onReturnToLiveConversation: () => void
  onDeleteConversation: (conversationId: string) => void
  onLoadMoreConversations: () => void
  onUpdateAiUnifiedInputValue: (value: string) => void
  onSubmitAiUnifiedInput: () => void
  onSetAgentMode: (mode: AIAgentMode) => void
  onRemoveBatchSelectedHost: (hostId: string) => void
  onSetIsAIInputCollapsed: (collapsed: boolean) => void
  onToggleAIHistory: () => void
  onSetIsAIInputExpanded: (expanded: boolean) => void
  onClearAiInput: () => void
  onContinueAgentTask: () => void
  onStopAgentTask: () => void
  onStartBatchExecution: () => void
  onCloseBatchHostCard: (hostId: string) => void
}

export function AIWorkspacePanel({
  activeSessionName,
  liveAIConversationId,
  isPreviewingHistory,
  isAIHistoryOpen,
  aiConversations,
  activeAIConversationId,
  hasMoreConversations,
  settingsAiEnabled,
  isAIProviderConfigured,
  aiMessages,
  aiAssistantState,
  shouldRenderAgentMessageCard,
  agentState,
  normalizedAgentMessage,
  isAIInputCollapsed,
  aiAssistantError,
  aiUnifiedInputPlaceholder,
  aiUnifiedInputValue,
  aiSkills,
  batchMode,
  batchSelectedHosts,
  batchActive,
  agentMode,
  batchTask,
  batchHostResults,
  batchHostIndex,
  activeAIModelLabel,
  activeAIModelTitle,
  selectedAISkillIds,
  aiMessageListRef,
  onAiMessageListScroll,
  batchCardsRef,
  renderAIMessage,
  renderMarkdown,
  onCreateConversation,
  onSelectConversation,
  onToggleAISkill,
  onReturnToLiveConversation,
  onDeleteConversation,
  onLoadMoreConversations,
  onUpdateAiUnifiedInputValue,
  onSubmitAiUnifiedInput,
  onSetAgentMode,
  onRemoveBatchSelectedHost,
  onSetIsAIInputCollapsed,
  onToggleAIHistory,
  onSetIsAIInputExpanded,
  onClearAiInput,
  onContinueAgentTask,
  onStopAgentTask,
  onStartBatchExecution,
  onCloseBatchHostCard,
}: AIWorkspacePanelProps) {
  const { t, i18n } = useTranslation()

  const batchStatusText = (result: BatchHostResult) => {
    if (result.status === 'pending') return t('aiWorkspace.batch.status.pending')
    if (result.status === 'connecting') return t('aiWorkspace.batch.status.connecting')
    if (result.status === 'running') return t('aiWorkspace.batch.status.running', { steps: result.stepCount })
    if (result.status === 'success') return t('aiWorkspace.batch.status.success', { steps: result.stepCount })
    return t('aiWorkspace.batch.status.error')
  }

  return (
    <div className={`ai-box unified-ai-box ${isAIHistoryOpen ? 'history-open' : ''}`}>
      <div className="ai-conversation-shell">
        {isAIHistoryOpen ? (
          <aside className="ai-chat-sidebar">
            <div className="ai-chat-sidebar-head">
              <strong>{t('aiWorkspace.historyTitle')}</strong>
              <button className="ai-icon-button" type="button" title={t('aiWorkspace.newConversation')} onClick={onCreateConversation}>
                +
              </button>
            </div>
            <div className="ai-chat-list">
              {aiConversations.map((conversation) => {
                const displayTitle = conversation.snippet || conversation.title
                return (
                  <div className={`ai-chat-item ${conversation.id === activeAIConversationId ? 'active' : ''}`} key={conversation.id}>
                    <button
                      className="ai-chat-select"
                      type="button"
                      title={t('aiWorkspace.switchConversation', { title: displayTitle })}
                      onClick={() => onSelectConversation(conversation.id)}
                    >
                      <span>{displayTitle}</span>
                      <small>{formatLocalizedDateTime(conversation.updatedAt, i18n.language, { hour12: false })}</small>
                    </button>
                    <button
                      className="ai-chat-delete ai-icon-button"
                      type="button"
                      title={t('aiWorkspace.deleteConversation', { title: displayTitle })}
                      onClick={() => onDeleteConversation(conversation.id)}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
              {hasMoreConversations ? (
                <button className="load-more-chats" type="button" onClick={onLoadMoreConversations}>
                  {t('aiWorkspace.loadMore')}
                </button>
              ) : null}
            </div>
          </aside>
        ) : null}
        <div className="ai-message-list" ref={aiMessageListRef} onScroll={onAiMessageListScroll}>
          {isPreviewingHistory && liveAIConversationId ? (
            <div className="ai-history-preview-banner">
              <span>{t('aiWorkspace.viewingHistory')}</span>
              <button className="ai-inline-button" type="button" onClick={onReturnToLiveConversation}>
                {t('aiWorkspace.returnToLive')}
              </button>
            </div>
          ) : null}
          {!settingsAiEnabled ? <p className="hint-text">{t('aiWorkspace.aiDisabled')}</p> : null}
          {!isAIProviderConfigured && settingsAiEnabled ? (
            <p className="hint-text">{t('aiWorkspace.providerMissing')}</p>
          ) : null}
          {aiMessages.length === 0 ? <p className="hint-text">{t('aiWorkspace.emptyConversation')}</p> : null}
          {aiMessages.map((message) => renderAIMessage(message))}
          {aiAssistantState === 'loading' ? (
            <div className="prediction-loading">
              <span aria-hidden="true" className="file-loading-spinner" />
              <span>{t('aiWorkspace.streaming')}</span>
            </div>
          ) : null}
          {shouldRenderAgentMessageCard ? (
            <article className={`ai-message-card ${agentState === 'error' ? 'ai-error-card' : 'ai-status-line'}`}>
              <header className="ai-message-header">
                <strong>{agentState === 'error' ? t('aiWorkspace.status.error') : t('aiWorkspace.status.title')}</strong>
              </header>
              <div className={`ai-status-content ${agentState === 'loading' ? 'loading' : ''}`}>
                {agentState === 'loading' ? <span aria-hidden="true" className="file-loading-spinner" /> : null}
                {renderMarkdown(normalizedAgentMessage)}
              </div>
            </article>
          ) : null}
        </div>
      </div>

      <div className={`ai-unified-input ${isAIInputCollapsed ? 'collapsed' : ''}`}>
        {aiAssistantError ? <p className="error-text">{aiAssistantError}</p> : null}
        {!isAIInputCollapsed ? (
          <textarea
            placeholder={aiUnifiedInputPlaceholder}
            value={aiUnifiedInputValue}
            onChange={(event) => onUpdateAiUnifiedInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Enter' && event.ctrlKey) {
                event.preventDefault()
                onSubmitAiUnifiedInput()
              }
            }}
          />
        ) : null}

        {!isAIInputCollapsed && aiSkills.length > 0 ? (
          <div className="ai-skill-picker">
            <span className="ai-skill-picker-label">{t('aiWorkspace.skills.label')}</span>
            <div className="ai-skill-tags">
              {aiSkills.map((skill) => {
                const selected = selectedAISkillIds.includes(skill.id)
                return (
                  <button
                    key={skill.id}
                    type="button"
                    className={`ai-skill-tag${selected ? ' selected' : ''}`}
                    title={skill.prompt || skill.name}
                    onClick={() => onToggleAISkill(skill.id)}
                  >
                    {skill.name}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        {!isAIInputCollapsed ? (
          <div className="agent-mode-row">
            {batchMode && batchSelectedHosts.length > 0 ? (
              <div className="batch-mode-summary">
                <span className="batch-mode-hint">{t('aiWorkspace.batch.modeSummary', { count: batchSelectedHosts.length })}</span>
                <div className="batch-selected-tags" title={batchSelectedHosts.map((host) => host.name).join('、')}>
                  {batchSelectedHosts.map((host) => (
                    <span className="batch-selected-tag" key={host.id} title={host.name}>
                      <span>{host.name}</span>
                      <button
                        type="button"
                        aria-label={t('aiWorkspace.batch.removeHost', { name: host.name })}
                        title={t('aiWorkspace.batch.removeHost', { name: host.name })}
                        onClick={(event) => {
                          event.stopPropagation()
                          onRemoveBatchSelectedHost(host.id)
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <label title={t('aiWorkspace.modes.review.title')}>
                  <input checked={agentMode === 'review'} type="radio" onChange={() => onSetAgentMode('review')} />
                  <span>{t('aiWorkspace.modes.review.label')}</span>
                </label>
                <label title={t('aiWorkspace.modes.auto.title')}>
                  <input checked={agentMode === 'auto'} type="radio" onChange={() => onSetAgentMode('auto')} />
                  <span>{t('aiWorkspace.modes.auto.label')}</span>
                </label>
                <label title={t('aiWorkspace.modes.fullAuto.title')}>
                  <input checked={agentMode === 'full-auto'} type="radio" onChange={() => onSetAgentMode('full-auto')} />
                  <span>{t('aiWorkspace.modes.fullAuto.label')}</span>
                </label>
              </>
            )}
          </div>
        ) : null}

        {isAIInputCollapsed ? (
          <div className="agent-actions">
            <button className="ai-icon-button" type="button" title={t('aiWorkspace.actions.expandInput')} onClick={() => onSetIsAIInputCollapsed(false)}>
              ▴
            </button>
          </div>
        ) : (
          <div className="agent-actions">
            <div className="agent-actions-group">
              <button className="ai-icon-button" type="button" title={isAIHistoryOpen ? t('aiWorkspace.actions.collapseHistory') : t('aiWorkspace.actions.expandHistory')} onClick={onToggleAIHistory}>
                {isAIHistoryOpen ? '▤' : '☰'}
              </button>
              <button className="ai-icon-button" type="button" title={t('aiWorkspace.newConversation')} onClick={onCreateConversation}>
                +
              </button>
              <button className="ai-icon-button" type="button" title={t('aiWorkspace.actions.enlargeInput')} onClick={() => onSetIsAIInputExpanded(true)}>
                ⇱
              </button>
              <button className="ai-icon-button" type="button" title={t('aiWorkspace.actions.clearInput')} onClick={onClearAiInput}>
                ×
              </button>
            </div>
            <div className="agent-actions-group agent-actions-group-primary">
              <button className="ai-icon-button" disabled={agentState === 'loading'} type="button" title={t('aiWorkspace.actions.continueTask')} onClick={onContinueAgentTask}>
                →
              </button>
              <button className="ai-icon-button" type="button" title={t('aiWorkspace.actions.stopTask')} onClick={onStopAgentTask}>
                ■
              </button>
              {batchMode && batchSelectedHosts.length > 0 && !batchActive ? (
                <button
                  className="ai-icon-button batch-run-button"
                  type="button"
                  title={t('aiWorkspace.batch.run', { count: batchSelectedHosts.length })}
                  disabled={!batchTask.trim()}
                  onClick={onStartBatchExecution}
                >
                  ⚡
                </button>
              ) : null}
              <button
                className="ai-icon-button ai-send-button primary-button"
                disabled={aiAssistantState === 'loading' || !settingsAiEnabled}
                type="button"
                title={t('aiWorkspace.actions.send')}
                onClick={onSubmitAiUnifiedInput}
              >
                {aiAssistantState === 'loading' ? '…' : '➤'}
              </button>
              <button className="ai-icon-button" type="button" title={t('aiWorkspace.actions.collapseInput')} onClick={() => onSetIsAIInputCollapsed(true)}>
                ▾
              </button>
            </div>
          </div>
        )}
      </div>

      {batchActive || batchHostResults.length > 0 ? (
        <div className="batch-exec-panel">
          <div className="batch-exec-cards" ref={batchCardsRef}>
            {batchHostResults.map((result) => {
              const isCurrent = batchActive && result.hostId === batchHostResults[batchHostIndex]?.hostId
              return (
                <div
                  key={result.hostId}
                  className={`batch-exec-card batch-${result.status} ${isCurrent ? 'batch-current' : ''}`}
                >
                  <div className="batch-card-header">
                    <span className="batch-card-host">{result.hostName}</span>
                    <button className="batch-card-close" type="button" title={t('aiWorkspace.batch.closeHostTask')} onClick={() => onCloseBatchHostCard(result.hostId)}>
                      ×
                    </button>
                  </div>
                  <span className="batch-card-status">{batchStatusText(result)}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div
        className={`ai-model-corner-badge${isAIProviderConfigured ? '' : ' unconfigured'}`}
        title={activeSessionName ? `${activeAIModelTitle} | ${activeSessionName}` : activeAIModelTitle}
      >
        <span>{activeAIModelLabel}</span>
        {activeSessionName ? <span className="ai-model-session-tag">{activeSessionName}</span> : null}
      </div>
    </div>
  )
}
