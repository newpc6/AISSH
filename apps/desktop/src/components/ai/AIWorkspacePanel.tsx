import type { RefObject, ReactNode } from 'react'
import type { AIAgentMode, AIChatConversation } from '@ai-ssh/shared-contracts'
import type { AIChatMessageDraft, BatchHostResult, LoadState } from '../../types'

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
  batchMode: boolean
  batchSelectedHosts: BatchSelectedHost[]
  batchActive: boolean
  agentMode: AIAgentMode
  batchTask: string
  batchHostResults: BatchHostResult[]
  batchHostIndex: number
  activeAIModelLabel: string
  activeAIModelTitle: string
  aiMessageListRef: RefObject<HTMLDivElement | null>
  onAiMessageListScroll: () => void
  batchCardsRef: RefObject<HTMLDivElement | null>
  renderAIMessage: (message: AIChatMessageDraft) => ReactNode
  renderMarkdown: (content: string, fallback?: string) => ReactNode
  onCreateConversation: () => void
  onSelectConversation: (conversationId: string) => void
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
  batchMode,
  batchSelectedHosts,
  batchActive,
  agentMode,
  batchTask,
  batchHostResults,
  batchHostIndex,
  activeAIModelLabel,
  activeAIModelTitle,
  aiMessageListRef,
  onAiMessageListScroll,
  batchCardsRef,
  renderAIMessage,
  renderMarkdown,
  onCreateConversation,
  onSelectConversation,
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
  return (
    <div className={`ai-box unified-ai-box ${isAIHistoryOpen ? 'history-open' : ''}`}>
      <div className="ai-conversation-shell">
        {isAIHistoryOpen ? (
          <aside className="ai-chat-sidebar">
            <div className="ai-chat-sidebar-head">
              <strong>历史对话</strong>
              <button className="ai-icon-button" type="button" title="新建 AI 对话" onClick={onCreateConversation}>
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
                      title={`切换到 ${displayTitle}`}
                      onClick={() => onSelectConversation(conversation.id)}
                    >
                      <span>{displayTitle}</span>
                      <small>{new Date(conversation.updatedAt).toLocaleString('zh-CN', { hour12: false })}</small>
                    </button>
                    <button
                      className="ai-chat-delete ai-icon-button"
                      type="button"
                      title={`删除对话：${displayTitle}`}
                      onClick={() => onDeleteConversation(conversation.id)}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
              {hasMoreConversations ? (
                <button className="load-more-chats" type="button" onClick={onLoadMoreConversations}>
                  加载更多...
                </button>
              ) : null}
            </div>
          </aside>
        ) : null}
        <div className="ai-message-list" ref={aiMessageListRef} onScroll={onAiMessageListScroll}>
          {isPreviewingHistory && liveAIConversationId ? (
            <div className="ai-history-preview-banner">
              <span>当前正在查看历史对话，实时任务仍会继续写入当前 SSH 的任务对话。</span>
              <button className="ai-inline-button" type="button" onClick={onReturnToLiveConversation}>
                返回当前任务
              </button>
            </div>
          ) : null}
          {!settingsAiEnabled ? <p className="hint-text">AI 功能已关闭，可在设置中开启。</p> : null}
          {!isAIProviderConfigured && settingsAiEnabled ? (
            <p className="hint-text">请先在设置里填写大模型地址和模型，保存后再使用 AI。</p>
          ) : null}
          {aiMessages.length === 0 ? <p className="hint-text">当前对话暂无消息，可以直接输入问题或目标。</p> : null}
          {aiMessages.map((message) => renderAIMessage(message))}
          {aiAssistantState === 'loading' ? (
            <div className="prediction-loading">
              <span aria-hidden="true" className="file-loading-spinner" />
              <span>AI 正在实时返回，消息会按时间顺序追加...</span>
            </div>
          ) : null}
          {shouldRenderAgentMessageCard ? (
            <article className={`ai-message-card ${agentState === 'error' ? 'ai-error-card' : 'ai-status-line'}`}>
              <header className="ai-message-header">
                <strong>{agentState === 'error' ? '错误' : '状态'}</strong>
              </header>
              {renderMarkdown(normalizedAgentMessage)}
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

        {!isAIInputCollapsed ? (
          <div className="agent-mode-row">
            {batchMode && batchSelectedHosts.length > 0 ? (
              <div className="batch-mode-summary">
                <span className="batch-mode-hint">批量模式 · 已选 {batchSelectedHosts.length} 台</span>
                <div className="batch-selected-tags" title={batchSelectedHosts.map((host) => host.name).join('、')}>
                  {batchSelectedHosts.map((host) => (
                    <span className="batch-selected-tag" key={host.id} title={host.name}>
                      <span>{host.name}</span>
                      <button
                        type="button"
                        aria-label={`取消选择 ${host.name}`}
                        title={`取消选择 ${host.name}`}
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
                <label title="AI 给出命令后需要人工点击执行">
                  <input checked={agentMode === 'review'} type="radio" onChange={() => onSetAgentMode('review')} />
                  <span>审核模式</span>
                </label>
                <label title="AI 给出低风险命令后自动执行，高风险命令仍会暂停确认">
                  <input checked={agentMode === 'auto'} type="radio" onChange={() => onSetAgentMode('auto')} />
                  <span>自动模式</span>
                </label>
                <label title="后果自负：AI 给出的所有命令都会自动执行，不再进行风险审核或确认">
                  <input checked={agentMode === 'full-auto'} type="radio" onChange={() => onSetAgentMode('full-auto')} />
                  <span>完全自动</span>
                </label>
              </>
            )}
          </div>
        ) : null}

        {isAIInputCollapsed ? (
          <div className="agent-actions">
            <button className="ai-icon-button" type="button" title="展开 AI 输入区域" onClick={() => onSetIsAIInputCollapsed(false)}>
              ▴
            </button>
          </div>
        ) : (
          <div className="agent-actions">
            <div className="agent-actions-group">
              <button className="ai-icon-button" type="button" title={isAIHistoryOpen ? '收起历史对话' : '展开历史对话'} onClick={onToggleAIHistory}>
                {isAIHistoryOpen ? '◀' : '☰'}
              </button>
              <button className="ai-icon-button" type="button" title="新建 AI 对话" onClick={onCreateConversation}>
                +
              </button>
              <button className="ai-icon-button" type="button" title="放大 AI 输入框" onClick={() => onSetIsAIInputExpanded(true)}>
                ⛶
              </button>
              <button className="ai-icon-button" type="button" title="清空当前 AI 输入框" onClick={onClearAiInput}>
                ×
              </button>
            </div>
            <div className="agent-actions-group agent-actions-group-primary">
              <button className="ai-icon-button" disabled={agentState === 'loading'} type="button" title="让 AI 继续规划下一步" onClick={onContinueAgentTask}>
                ↻
              </button>
              <button className="ai-icon-button" type="button" title="停止自动推进任务" onClick={onStopAgentTask}>
                ■
              </button>
              {batchMode && batchSelectedHosts.length > 0 && !batchActive ? (
                <button
                  className="ai-icon-button batch-run-button"
                  type="button"
                  title={`批量执行 · 已选 ${batchSelectedHosts.length} 台`}
                  disabled={!batchTask.trim()}
                  onClick={onStartBatchExecution}
                >
                  ▶
                </button>
              ) : null}
              <button
                className="ai-icon-button ai-send-button primary-button"
                disabled={aiAssistantState === 'loading' || !settingsAiEnabled}
                type="button"
                title="发送给统一 AI 助手"
                onClick={onSubmitAiUnifiedInput}
              >
                {aiAssistantState === 'loading' ? '…' : '▶'}
              </button>
              <button className="ai-icon-button" type="button" title="收起 AI 输入区域" onClick={() => onSetIsAIInputCollapsed(true)}>
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
              const statusText =
                result.status === 'pending'
                  ? '等待中'
                  : result.status === 'connecting'
                    ? '连接中'
                    : result.status === 'running'
                      ? `执行中 · ${result.stepCount} 步`
                      : result.status === 'success'
                        ? `完成 · ${result.stepCount} 步`
                        : '失败'
              return (
                <div
                  key={result.hostId}
                  className={`batch-exec-card batch-${result.status} ${isCurrent ? 'batch-current' : ''}`}
                >
                  <div className="batch-card-header">
                    <span className="batch-card-host">{result.hostName}</span>
                    <button className="batch-card-close" type="button" title="关闭此服务器任务" onClick={() => onCloseBatchHostCard(result.hostId)}>
                      ×
                    </button>
                  </div>
                  <span className="batch-card-status">{statusText}</span>
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
