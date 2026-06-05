import type { ChangeEvent } from 'react'
import type { AIModelProvider, AppSettings } from '@ai-ssh/shared-contracts'
import type { SettingsSection } from '../../types'

const AI_PROVIDER_OPTIONS: Array<{ value: AIModelProvider; label: string }> = [
  { value: 'openai-compatible', label: 'OpenAI 兼容' },
  { value: 'anthropic-claude', label: 'Anthropic Claude' },
  { value: 'ollama', label: 'Ollama' },
]

function aiProviderLabel(provider: AIModelProvider) {
  return AI_PROVIDER_OPTIONS.find((item) => item.value === provider)?.label ?? provider
}

function aiModelPlaceholder(provider: AIModelProvider) {
  if (provider === 'ollama') return 'llama3.1'
  if (provider === 'anthropic-claude') return 'claude-sonnet-4-0'
  return 'gpt-4.1-mini'
}

function aiBaseUrlPlaceholder(provider: AIModelProvider, defaultOllamaBaseUrl: string) {
  if (provider === 'ollama') return defaultOllamaBaseUrl
  if (provider === 'anthropic-claude') return 'https://api.anthropic.com/v1'
  return 'https://api.openai.com/v1'
}

function aiKeyPlaceholder(provider: AIModelProvider) {
  if (provider === 'ollama') return 'Ollama 通常可留空'
  if (provider === 'anthropic-claude') return 'sk-ant-...'
  return 'sk-...'
}

function aiProviderHelp(provider: AIModelProvider) {
  if (provider === 'ollama') return '使用 Ollama 的 OpenAI 兼容接口。'
  if (provider === 'anthropic-claude') return '使用 Claude 原生 Messages API，走 x-api-key 与事件流。'
  return '适用于 OpenAI、DeepSeek、通义千问等兼容接口。'
}

type ChangePasswordForm = {
  oldPassword: string
  newPassword: string
  confirmPassword: string
}

type SettingsDialogProps = {
  open: boolean
  settingsSection: SettingsSection
  settings: AppSettings
  defaultSettings: AppSettings
  desktopLoginRequired: boolean
  webAccessEnabled: boolean
  authInitialized: boolean
  changePasswordForm: ChangePasswordForm
  changePasswordError: string
  changePasswordSuccess: string
  settingsSavedMessage: string
  activeAIModelBaseUrl: string
  activeAIModelApiKey: string
  activeAIModelModel: string
  minRightServerInfoHeight: number
  maxRightServerInfoHeight: number
  minRightPanelWidth: number
  maxRightPanelWidth: number
  defaultHealthCheckIntervalSeconds: number
  defaultRightServerInfoHeight: number
  defaultRightPanelWidth: number
  defaultAiSystemPrompt: string
  defaultAiTerminalContextLimit: number
  defaultAiCommandHistoryLimit: number
  defaultAiConversationContextLimit: number
  defaultAgentCommandTimeoutSeconds: number
  defaultAiProviderTimeoutSeconds: number
  defaultAiPredictionTriggerDelayMs: number
  defaultOllamaBaseUrl: string
  onClose: () => void
  onSettingsSectionChange: (section: SettingsSection) => void
  onSettingsChange: (updater: (current: AppSettings) => AppSettings) => void
  onDesktopLoginRequiredChange: (checked: boolean) => void
  onWebAccessEnabledChange: (checked: boolean) => void
  onChangePasswordFormChange: (updater: (current: ChangePasswordForm) => ChangePasswordForm) => void
  onChangePassword: () => void
  onClearPrediction: () => void
  onAddAIModelConfig: (provider: AIModelProvider) => void
  onUpdateAIModelConfig: (id: string, patch: Record<string, unknown>) => void
  onRemoveAIModelConfig: (id: string) => void
  onSave: () => void
  normalizeSettings: (settings: AppSettings) => AppSettings
}

export function SettingsDialog({
  open,
  settingsSection,
  settings,
  defaultSettings,
  desktopLoginRequired,
  webAccessEnabled,
  authInitialized,
  changePasswordForm,
  changePasswordError,
  changePasswordSuccess,
  settingsSavedMessage,
  activeAIModelBaseUrl,
  activeAIModelApiKey,
  activeAIModelModel,
  minRightServerInfoHeight,
  maxRightServerInfoHeight,
  minRightPanelWidth,
  maxRightPanelWidth,
  defaultHealthCheckIntervalSeconds,
  defaultRightServerInfoHeight,
  defaultRightPanelWidth,
  defaultAiSystemPrompt,
  defaultAiTerminalContextLimit,
  defaultAiCommandHistoryLimit,
  defaultAiConversationContextLimit,
  defaultAgentCommandTimeoutSeconds,
  defaultAiProviderTimeoutSeconds,
  defaultAiPredictionTriggerDelayMs,
  defaultOllamaBaseUrl,
  onClose,
  onSettingsSectionChange,
  onSettingsChange,
  onDesktopLoginRequiredChange,
  onWebAccessEnabledChange,
  onChangePasswordFormChange,
  onChangePassword,
  onClearPrediction,
  onAddAIModelConfig,
  onUpdateAIModelConfig,
  onRemoveAIModelConfig,
  onSave,
  normalizeSettings,
}: SettingsDialogProps) {
  if (!open) {
    return null
  }

  const updateNumber = (field: keyof AppSettings, fallback: number) => (event: ChangeEvent<HTMLInputElement>) => {
    onSettingsChange((current) => ({
      ...current,
      [field]: Number(event.target.value) || fallback,
    }))
  }

  return (
    <div className="modal-backdrop">
      <section className="settings-modal">
        <div className="modal-header">
          <div>
            <p className="section-label">设置</p>
            <h3>偏好设置</h3>
          </div>
          <button type="button" title="关闭偏好设置窗口" onClick={onClose}>×</button>
        </div>

        <div className="settings-layout">
          <nav className="settings-nav">
            {[
              ['general', '通用'],
              ['security', '安全'],
              ['metrics', '服务器指标'],
              ['ai', 'AI'],
            ].map(([key, label]) => (
              <button
                className={settingsSection === key ? 'active' : ''}
                key={key}
                type="button"
                title={`切换到${label}设置`}
                onClick={() => onSettingsSectionChange(key as SettingsSection)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {settingsSection === 'general' ? (
              <>
                <label>
                  <span>健康检查间隔（秒）</span>
                  <input
                    min="3"
                    max="300"
                    type="number"
                    value={settings.healthCheckIntervalSeconds ?? defaultSettings.healthCheckIntervalSeconds}
                    onChange={updateNumber('healthCheckIntervalSeconds', defaultHealthCheckIntervalSeconds)}
                  />
                </label>
                <label>
                  <span>每个 SSH 标签保留终端行数</span>
                  <input
                    min="100"
                    type="number"
                    value={settings.terminalRetainedLines}
                    onChange={updateNumber('terminalRetainedLines', 1000)}
                  />
                </label>
                <label>
                  <span>右侧服务器信息默认高度（像素）</span>
                  <input
                    min={minRightServerInfoHeight}
                    max={maxRightServerInfoHeight}
                    type="number"
                    value={settings.rightServerInfoPanelHeight ?? defaultSettings.rightServerInfoPanelHeight}
                    onChange={updateNumber('rightServerInfoPanelHeight', defaultRightServerInfoHeight)}
                  />
                </label>
                <label>
                  <span>右侧区域默认宽度（像素）</span>
                  <input
                    min={minRightPanelWidth}
                    max={maxRightPanelWidth}
                    type="number"
                    value={settings.rightPanelWidth ?? defaultSettings.rightPanelWidth}
                    onChange={updateNumber('rightPanelWidth', defaultRightPanelWidth)}
                  />
                </label>
              </>
            ) : null}

            {settingsSection === 'security' ? (
              <>
                <label className="checkbox-row">
                  <input checked={desktopLoginRequired} type="checkbox" onChange={(event) => onDesktopLoginRequiredChange(event.target.checked)} />
                  <span>桌面客户端启动时要求登录</span>
                </label>
                <p className="hint-text">网页访问始终需要登录；关闭此项后，本机安装版客户端会使用本机安全会话自动进入。</p>
                <label className="checkbox-row">
                  <input checked={webAccessEnabled} type="checkbox" onChange={(event) => onWebAccessEnabledChange(event.target.checked)} />
                  <span>启用网页远程访问</span>
                </label>
                <p className="hint-text">关闭后禁止浏览器网页登录，仅允许本机桌面客户端访问。</p>
                {authInitialized ? (
                  <div className="password-change-section">
                    <h3>修改登录密码</h3>
                    <label>
                      <span>旧密码</span>
                      <input
                        type="password"
                        value={changePasswordForm.oldPassword}
                        onChange={(event) => onChangePasswordFormChange((current) => ({ ...current, oldPassword: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>新密码</span>
                      <input
                        type="password"
                        value={changePasswordForm.newPassword}
                        onChange={(event) => onChangePasswordFormChange((current) => ({ ...current, newPassword: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>确认新密码</span>
                      <input
                        type="password"
                        value={changePasswordForm.confirmPassword}
                        onChange={(event) => onChangePasswordFormChange((current) => ({ ...current, confirmPassword: event.target.value }))}
                      />
                    </label>
                    {changePasswordError ? <p className="error-text">{changePasswordError}</p> : null}
                    {changePasswordSuccess ? <p className="success-text">{changePasswordSuccess}</p> : null}
                    <button className="primary-button" type="button" onClick={onChangePassword}>修改密码</button>
                  </div>
                ) : null}
              </>
            ) : null}

            {settingsSection === 'metrics' ? (
              <>
                <label>
                  <span>服务器信息刷新频率（秒）</span>
                  <input min="1" type="number" value={settings.metricsRefreshIntervalSeconds} onChange={updateNumber('metricsRefreshIntervalSeconds', 2)} />
                </label>
                <label>
                  <span>指标折线时间范围（分钟）</span>
                  <input min="1" type="number" value={settings.metricsHistoryWindowMinutes} onChange={updateNumber('metricsHistoryWindowMinutes', 5)} />
                </label>
                <div className="form-row settings-pair">
                  <label>
                    <span>小图圆点数量</span>
                    <input min="2" max="30" type="number" value={settings.metricsCompactPointLimit} onChange={updateNumber('metricsCompactPointLimit', 5)} />
                  </label>
                  <label>
                    <span>放大图圆点数量</span>
                    <input min="2" max="120" type="number" value={settings.metricsExpandedPointLimit} onChange={updateNumber('metricsExpandedPointLimit', 20)} />
                  </label>
                </div>
              </>
            ) : null}

            {settingsSection === 'ai' ? (
              <>
                <label className="checkbox-row">
                  <input
                    checked={settings.aiEnabled}
                    type="checkbox"
                    onChange={(event) => {
                      const enabled = event.target.checked
                      onSettingsChange((current) => ({ ...current, aiEnabled: enabled }))
                      if (!enabled) {
                        onClearPrediction()
                      }
                    }}
                  />
                  <span>开启 AI 功能</span>
                </label>
                <label className="checkbox-row">
                  <input
                    checked={settings.aiPredictionEnabled}
                    disabled={!settings.aiEnabled}
                    type="checkbox"
                    onChange={(event) => onSettingsChange((current) => ({ ...current, aiPredictionEnabled: event.target.checked }))}
                  />
                  <span>开启 AI 命令预测</span>
                </label>
                <label className="checkbox-row">
                  <input
                    checked={settings.aiPredictionThinkingEnabled}
                    disabled={!settings.aiEnabled || !settings.aiPredictionEnabled}
                    type="checkbox"
                    onChange={(event) => onSettingsChange((current) => ({ ...current, aiPredictionThinkingEnabled: event.target.checked }))}
                  />
                  <span>显示预测 thinking</span>
                </label>
                <label className="checkbox-row">
                  <input
                    checked={settings.aiAgentThinkingEnabled}
                    disabled={!settings.aiEnabled}
                    type="checkbox"
                    onChange={(event) => onSettingsChange((current) => ({ ...current, aiAgentThinkingEnabled: event.target.checked }))}
                  />
                  <span>开启 Agent 思考</span>
                </label>
                <p className="ai-model-help">全局开关控制 Agent 是否允许思考；每个模型还可以单独开启或关闭思考。Claude 原生协议会走独立的 thinking 参数与事件流。</p>
                <label>
                  <span>预测命令数量</span>
                  <input min="1" max="8" type="number" value={settings.aiPredictionCount} onChange={updateNumber('aiPredictionCount', 3)} />
                </label>
                <div className="form-row settings-pair">
                  <label>
                    <span>终端上下文字符数</span>
                    <input
                      min="500"
                      max="50000"
                      step="500"
                      type="number"
                      value={settings.aiTerminalContextLimit ?? defaultAiTerminalContextLimit}
                      onChange={updateNumber('aiTerminalContextLimit', defaultAiTerminalContextLimit)}
                    />
                  </label>
                  <label>
                    <span>历史命令条数</span>
                    <input
                      min="1"
                      max="200"
                      type="number"
                      value={settings.aiCommandHistoryLimit ?? defaultAiCommandHistoryLimit}
                      onChange={updateNumber('aiCommandHistoryLimit', defaultAiCommandHistoryLimit)}
                    />
                  </label>
                </div>
                <label>
                  <span>对话上下文消息数</span>
                  <input
                    min="1"
                    max="100"
                    type="number"
                    value={settings.aiConversationContextLimit ?? defaultAiConversationContextLimit}
                    onChange={updateNumber('aiConversationContextLimit', defaultAiConversationContextLimit)}
                  />
                </label>
                <label>
                  <span>Agent 命令等待超时（秒）</span>
                  <input
                    min="10"
                    max="1800"
                    type="number"
                    value={settings.agentCommandTimeoutSeconds ?? defaultAgentCommandTimeoutSeconds}
                    onChange={updateNumber('agentCommandTimeoutSeconds', defaultAgentCommandTimeoutSeconds)}
                  />
                </label>
                <label>
                  <span>AI 请求超时（秒）</span>
                  <input
                    min="10"
                    max="1800"
                    type="number"
                    value={settings.aiProviderTimeoutSeconds ?? defaultAiProviderTimeoutSeconds}
                    onChange={updateNumber('aiProviderTimeoutSeconds', defaultAiProviderTimeoutSeconds)}
                  />
                  <small>远程 Ollama 或大模型首次加载较慢时可调大，例如 120-300 秒。</small>
                </label>
                <label>
                  <span>预测触发延迟（毫秒）</span>
                  <input
                    min="0"
                    max="10000"
                    step="100"
                    type="number"
                    value={settings.aiPredictionTriggerDelayMs ?? defaultAiPredictionTriggerDelayMs}
                    onChange={updateNumber('aiPredictionTriggerDelayMs', defaultAiPredictionTriggerDelayMs)}
                  />
                </label>
                <label>
                  <span>大模型地址</span>
                  <input value={activeAIModelBaseUrl} readOnly placeholder="https://api.openai.com/v1" />
                </label>
                <label>
                  <span>API Key</span>
                  <input type="password" value={activeAIModelApiKey} readOnly placeholder="sk-..." />
                </label>
                <label>
                  <span>模型</span>
                  <input value={activeAIModelModel} readOnly placeholder="gpt-4.1-mini" />
                </label>
                <div className="ai-model-settings">
                  <div className="ai-model-settings-head">
                    <span>AI 模型配置</span>
                    <div className="ai-model-actions">
                      <button type="button" title="新增 OpenAI 兼容模型" onClick={() => onAddAIModelConfig('openai-compatible')}>+ OpenAI</button>
                      <button type="button" title="新增 Anthropic Claude 模型" onClick={() => onAddAIModelConfig('anthropic-claude')}>+ Claude</button>
                      <button type="button" title="新增 Ollama 模型" onClick={() => onAddAIModelConfig('ollama')}>+ Ollama</button>
                    </div>
                  </div>
                  <p className="ai-model-help">改成紧凑表格后，一屏能看更多模型。OpenAI/Ollama 走 `/chat/completions`；Claude 原生协议走 `/v1/messages`，需要 `x-api-key`。</p>
                  {settings.aiModels.length === 0 ? <p className="hint-text">尚未配置 AI 模型。</p> : null}
                  {settings.aiModels.length > 0 ? (
                    <div className="ai-model-table-wrap">
                      <table className="ai-model-table">
                        <thead>
                          <tr>
                            <th>启用</th>
                            <th>名称</th>
                            <th>类型</th>
                            <th>地址</th>
                            <th>Key</th>
                            <th>模型</th>
                            <th>思考</th>
                            <th>说明</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {settings.aiModels.map((model) => (
                            <tr className={model.id === settings.activeAIModelId ? 'active' : ''} key={model.id}>
                              <td>
                                <label className="checkbox-row compact">
                                  <input
                                    checked={model.id === settings.activeAIModelId}
                                    name="active-ai-model"
                                    type="radio"
                                    onChange={() => onSettingsChange((current) => normalizeSettings({ ...current, activeAIModelId: model.id }))}
                                  />
                                </label>
                              </td>
                              <td>
                                <input
                                  value={model.name}
                                  onChange={(event) => onUpdateAIModelConfig(model.id, { name: event.target.value })}
                                  placeholder={aiProviderLabel(model.provider)}
                                />
                              </td>
                              <td>
                                <select value={model.provider} onChange={(event) => onUpdateAIModelConfig(model.id, { provider: event.target.value as AIModelProvider })}>
                                  {AI_PROVIDER_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input
                                  value={model.baseUrl}
                                  onChange={(event) => onUpdateAIModelConfig(model.id, { baseUrl: event.target.value })}
                                  placeholder={aiBaseUrlPlaceholder(model.provider, defaultOllamaBaseUrl)}
                                />
                              </td>
                              <td>
                                <input
                                  type="password"
                                  value={model.apiKey}
                                  onChange={(event) => onUpdateAIModelConfig(model.id, { apiKey: event.target.value })}
                                  placeholder={aiKeyPlaceholder(model.provider)}
                                />
                              </td>
                              <td>
                                <input
                                  value={model.model}
                                  onChange={(event) => onUpdateAIModelConfig(model.id, { model: event.target.value })}
                                  placeholder={aiModelPlaceholder(model.provider)}
                                />
                              </td>
                              <td>
                                <label className="checkbox-row compact">
                                  <input
                                    checked={model.thinkingEnabled}
                                    type="checkbox"
                                    onChange={(event) => onUpdateAIModelConfig(model.id, { thinkingEnabled: event.target.checked })}
                                  />
                                </label>
                              </td>
                              <td>
                                <small>{aiProviderHelp(model.provider)}</small>
                              </td>
                              <td>
                                <button type="button" title="删除这个模型配置" onClick={() => onRemoveAIModelConfig(model.id)}>删除</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
                <label>
                  <span>系统提示词</span>
                  <textarea
                    value={settings.aiSystemPrompt}
                    onChange={(event) => onSettingsChange((current) => ({ ...current, aiSystemPrompt: event.target.value }))}
                    placeholder={defaultAiSystemPrompt}
                  />
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={settings.aiSystemPromptOverride}
                      onChange={(event) => onSettingsChange((current) => ({ ...current, aiSystemPromptOverride: event.target.checked }))}
                    />
                    <span>覆盖默认系统提示词（上面填写的提示词将完全替代内置提示词，不再追加）</span>
                  </label>
                  <small>用于统一 AI 对话和 Agent 任务，会随请求发送给 Go core。</small>
                </label>
              </>
            ) : null}
          </div>
        </div>

        {settingsSavedMessage ? <p className="success-text">{settingsSavedMessage}</p> : null}
        <div className="modal-actions">
          <button type="button" title="关闭偏好设置窗口" onClick={onClose}>关闭</button>
          <button className="primary-button" type="button" title="保存偏好设置" onClick={onSave}>保存</button>
        </div>
      </section>
    </div>
  )
}
