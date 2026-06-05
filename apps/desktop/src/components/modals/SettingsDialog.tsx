import type { ChangeEvent } from 'react'
import type { AIModelProvider, AppSettings } from '@ai-ssh/shared-contracts'
import type { SettingsSection } from '../../types'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../common/LanguageSwitcher'

const AI_PROVIDER_VALUES: AIModelProvider[] = ['openai-compatible', 'anthropic-claude', 'ollama']

function aiProviderLabel(provider: AIModelProvider, t: (key: string) => string) {
  if (provider === 'ollama') return t('settings.ai.provider.ollama')
  if (provider === 'anthropic-claude') return t('settings.ai.provider.anthropicClaude')
  return t('settings.ai.provider.openaiCompatible')
}

function aiModelPlaceholder(provider: AIModelProvider, t: (key: string) => string) {
  if (provider === 'ollama') return t('settings.ai.placeholders.ollamaModel')
  if (provider === 'anthropic-claude') return t('settings.ai.placeholders.claudeModel')
  return t('settings.ai.placeholders.openaiModel')
}

function aiBaseUrlPlaceholder(provider: AIModelProvider, defaultOllamaBaseUrl: string) {
  if (provider === 'ollama') return defaultOllamaBaseUrl
  if (provider === 'anthropic-claude') return 'https://api.anthropic.com/v1'
  return 'https://api.openai.com/v1'
}

function aiKeyPlaceholder(provider: AIModelProvider, t: (key: string) => string) {
  if (provider === 'ollama') return t('settings.ai.placeholders.ollamaApiKey')
  if (provider === 'anthropic-claude') return t('settings.ai.placeholders.claudeApiKey')
  return t('settings.ai.placeholders.defaultApiKey')
}

function aiProviderHelp(provider: AIModelProvider, t: (key: string) => string) {
  if (provider === 'ollama') return t('settings.ai.providerHelp.ollama')
  if (provider === 'anthropic-claude') return t('settings.ai.providerHelp.anthropicClaude')
  return t('settings.ai.providerHelp.openaiCompatible')
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
  const { t } = useTranslation()

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
            <p className="section-label">{t('settings.title')}</p>
            <h3>{t('settings.preferences')}</h3>
          </div>
          <button type="button" title={t('settings.closePreferences')} onClick={onClose}>×</button>
        </div>

        <div className="settings-layout">
          <nav className="settings-nav">
            {[
              ['general', t('settings.sections.general')],
              ['security', t('settings.sections.security')],
              ['metrics', t('settings.sections.metrics')],
              ['ai', t('settings.sections.ai')],
            ].map(([key, label]) => (
              <button
                className={settingsSection === key ? 'active' : ''}
                key={key}
                type="button"
                title={t('settings.switchToSection', { section: label })}
                onClick={() => onSettingsSectionChange(key as SettingsSection)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {settingsSection === 'general' ? (
              <>
                <LanguageSwitcher />
                <label>
                  <span>{t('settings.general.healthCheckInterval')}</span>
                  <input
                    min="3"
                    max="300"
                    type="number"
                    value={settings.healthCheckIntervalSeconds ?? defaultSettings.healthCheckIntervalSeconds}
                    onChange={updateNumber('healthCheckIntervalSeconds', defaultHealthCheckIntervalSeconds)}
                  />
                </label>
                <label>
                  <span>{t('settings.general.terminalRetainedLines')}</span>
                  <input
                    min="100"
                    type="number"
                    value={settings.terminalRetainedLines}
                    onChange={updateNumber('terminalRetainedLines', 1000)}
                  />
                </label>
                <label>
                  <span>{t('settings.general.rightServerInfoHeight')}</span>
                  <input
                    min={minRightServerInfoHeight}
                    max={maxRightServerInfoHeight}
                    type="number"
                    value={settings.rightServerInfoPanelHeight ?? defaultSettings.rightServerInfoPanelHeight}
                    onChange={updateNumber('rightServerInfoPanelHeight', defaultRightServerInfoHeight)}
                  />
                </label>
                <label>
                  <span>{t('settings.general.rightPanelWidth')}</span>
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
                  <span>{t('settings.security.desktopLoginRequired')}</span>
                </label>
                <p className="hint-text">{t('settings.security.desktopLoginRequiredHint')}</p>
                <label className="checkbox-row">
                  <input checked={webAccessEnabled} type="checkbox" onChange={(event) => onWebAccessEnabledChange(event.target.checked)} />
                  <span>{t('settings.security.webAccessEnabled')}</span>
                </label>
                <p className="hint-text">{t('settings.security.webAccessEnabledHint')}</p>
                {authInitialized ? (
                  <div className="password-change-section">
                    <h3>{t('settings.security.changePasswordTitle')}</h3>
                    <label>
                      <span>{t('settings.security.oldPassword')}</span>
                      <input
                        type="password"
                        value={changePasswordForm.oldPassword}
                        onChange={(event) => onChangePasswordFormChange((current) => ({ ...current, oldPassword: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>{t('settings.security.newPassword')}</span>
                      <input
                        type="password"
                        value={changePasswordForm.newPassword}
                        onChange={(event) => onChangePasswordFormChange((current) => ({ ...current, newPassword: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>{t('settings.security.confirmPassword')}</span>
                      <input
                        type="password"
                        value={changePasswordForm.confirmPassword}
                        onChange={(event) => onChangePasswordFormChange((current) => ({ ...current, confirmPassword: event.target.value }))}
                      />
                    </label>
                    {changePasswordError ? <p className="error-text">{changePasswordError}</p> : null}
                    {changePasswordSuccess ? <p className="success-text">{changePasswordSuccess}</p> : null}
                    <button className="primary-button" type="button" onClick={onChangePassword}>{t('settings.security.changePassword')}</button>
                  </div>
                ) : null}
              </>
            ) : null}

            {settingsSection === 'metrics' ? (
              <>
                <label>
                  <span>{t('settings.metrics.refreshInterval')}</span>
                  <input min="1" type="number" value={settings.metricsRefreshIntervalSeconds} onChange={updateNumber('metricsRefreshIntervalSeconds', 2)} />
                </label>
                <label>
                  <span>{t('settings.metrics.historyWindow')}</span>
                  <input min="1" type="number" value={settings.metricsHistoryWindowMinutes} onChange={updateNumber('metricsHistoryWindowMinutes', 5)} />
                </label>
                <div className="form-row settings-pair">
                  <label>
                    <span>{t('settings.metrics.compactPoints')}</span>
                    <input min="2" max="30" type="number" value={settings.metricsCompactPointLimit} onChange={updateNumber('metricsCompactPointLimit', 5)} />
                  </label>
                  <label>
                    <span>{t('settings.metrics.expandedPoints')}</span>
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
                  <span>{t('settings.ai.enableAI')}</span>
                </label>
                <label className="checkbox-row">
                  <input
                    checked={settings.aiPredictionEnabled}
                    disabled={!settings.aiEnabled}
                    type="checkbox"
                    onChange={(event) => onSettingsChange((current) => ({ ...current, aiPredictionEnabled: event.target.checked }))}
                  />
                  <span>{t('settings.ai.enablePrediction')}</span>
                </label>
                <label className="checkbox-row">
                  <input
                    checked={settings.aiPredictionThinkingEnabled}
                    disabled={!settings.aiEnabled || !settings.aiPredictionEnabled}
                    type="checkbox"
                    onChange={(event) => onSettingsChange((current) => ({ ...current, aiPredictionThinkingEnabled: event.target.checked }))}
                  />
                  <span>{t('settings.ai.showPredictionThinking')}</span>
                </label>
                <label className="checkbox-row">
                  <input
                    checked={settings.aiAgentThinkingEnabled}
                    disabled={!settings.aiEnabled}
                    type="checkbox"
                    onChange={(event) => onSettingsChange((current) => ({ ...current, aiAgentThinkingEnabled: event.target.checked }))}
                  />
                  <span>{t('settings.ai.enableAgentThinking')}</span>
                </label>
                <p className="ai-model-help">{t('settings.ai.agentThinkingHelp')}</p>
                <label>
                  <span>{t('settings.ai.predictionCount')}</span>
                  <input min="1" max="8" type="number" value={settings.aiPredictionCount} onChange={updateNumber('aiPredictionCount', 3)} />
                </label>
                <div className="form-row settings-pair">
                  <label>
                    <span>{t('settings.ai.terminalContextLimit')}</span>
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
                    <span>{t('settings.ai.commandHistoryLimit')}</span>
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
                  <span>{t('settings.ai.conversationContextLimit')}</span>
                  <input
                    min="1"
                    max="100"
                    type="number"
                    value={settings.aiConversationContextLimit ?? defaultAiConversationContextLimit}
                    onChange={updateNumber('aiConversationContextLimit', defaultAiConversationContextLimit)}
                  />
                </label>
                <label>
                  <span>{t('settings.ai.agentCommandTimeout')}</span>
                  <input
                    min="10"
                    max="1800"
                    type="number"
                    value={settings.agentCommandTimeoutSeconds ?? defaultAgentCommandTimeoutSeconds}
                    onChange={updateNumber('agentCommandTimeoutSeconds', defaultAgentCommandTimeoutSeconds)}
                  />
                </label>
                <label>
                  <span>{t('settings.ai.aiProviderTimeout')}</span>
                  <input
                    min="10"
                    max="1800"
                    type="number"
                    value={settings.aiProviderTimeoutSeconds ?? defaultAiProviderTimeoutSeconds}
                    onChange={updateNumber('aiProviderTimeoutSeconds', defaultAiProviderTimeoutSeconds)}
                  />
                  <small>{t('settings.ai.providerTimeoutHint')}</small>
                </label>
                <label>
                  <span>{t('settings.ai.predictionTriggerDelay')}</span>
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
                  <span>{t('settings.ai.modelBaseUrl')}</span>
                  <input value={activeAIModelBaseUrl} readOnly placeholder="https://api.openai.com/v1" />
                </label>
                <label>
                  <span>{t('settings.ai.modelApiKey')}</span>
                  <input type="password" value={activeAIModelApiKey} readOnly placeholder="sk-..." />
                </label>
                <label>
                  <span>{t('settings.ai.modelName')}</span>
                  <input value={activeAIModelModel} readOnly placeholder="gpt-4.1-mini" />
                </label>
                <div className="ai-model-settings">
                  <div className="ai-model-settings-head">
                    <span>{t('settings.ai.modelConfigTitle')}</span>
                    <div className="ai-model-actions">
                      <button type="button" title={t('settings.ai.modelActionTitles.addOpenAI')} onClick={() => onAddAIModelConfig('openai-compatible')}>{t('settings.ai.addOpenAI')}</button>
                      <button type="button" title={t('settings.ai.modelActionTitles.addClaude')} onClick={() => onAddAIModelConfig('anthropic-claude')}>{t('settings.ai.addClaude')}</button>
                      <button type="button" title={t('settings.ai.modelActionTitles.addOllama')} onClick={() => onAddAIModelConfig('ollama')}>{t('settings.ai.addOllama')}</button>
                    </div>
                  </div>
                  <p className="ai-model-help">{t('settings.ai.modelHelp')}</p>
                  {settings.aiModels.length === 0 ? <p className="hint-text">{t('settings.ai.noModels')}</p> : null}
                  {settings.aiModels.length > 0 ? (
                    <div className="ai-model-table-wrap">
                      <table className="ai-model-table">
                        <thead>
                          <tr>
                            <th>{t('settings.ai.modelTable.enable')}</th>
                            <th>{t('settings.ai.modelTable.name')}</th>
                            <th>{t('settings.ai.modelTable.type')}</th>
                            <th>{t('settings.ai.modelTable.baseUrl')}</th>
                            <th>{t('settings.ai.modelTable.key')}</th>
                            <th>{t('settings.ai.modelTable.model')}</th>
                            <th>{t('settings.ai.modelTable.thinking')}</th>
                            <th>{t('settings.ai.modelTable.description')}</th>
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
                                  placeholder={aiProviderLabel(model.provider, t)}
                                />
                              </td>
                              <td>
                                <select value={model.provider} onChange={(event) => onUpdateAIModelConfig(model.id, { provider: event.target.value as AIModelProvider })}>
                                  {AI_PROVIDER_VALUES.map((provider) => (
                                    <option key={provider} value={provider}>{aiProviderLabel(provider, t)}</option>
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
                                  placeholder={aiKeyPlaceholder(model.provider, t)}
                                />
                              </td>
                              <td>
                                <input
                                  value={model.model}
                                  onChange={(event) => onUpdateAIModelConfig(model.id, { model: event.target.value })}
                                  placeholder={aiModelPlaceholder(model.provider, t)}
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
                                <small>{aiProviderHelp(model.provider, t)}</small>
                              </td>
                              <td>
                                <button type="button" title={t('settings.ai.modelActionTitles.removeModel')} onClick={() => onRemoveAIModelConfig(model.id)}>{t('app.delete')}</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
                <label>
                  <span>{t('settings.ai.systemPrompt')}</span>
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
                    <span>{t('settings.ai.overrideSystemPrompt')}</span>
                  </label>
                  <small>{t('settings.ai.systemPromptHint')}</small>
                </label>
              </>
            ) : null}
          </div>
        </div>

        {settingsSavedMessage ? <p className="success-text">{settingsSavedMessage}</p> : null}
        <div className="modal-actions">
          <button type="button" title={t('settings.closePreferences')} onClick={onClose}>{t('app.close')}</button>
          <button className="primary-button" type="button" title={t('settings.savePreferences')} onClick={onSave}>{t('app.save')}</button>
        </div>
      </section>
    </div>
  )
}
