import type { ChangeEvent } from 'react'
import type { AppSettings } from '@ai-ssh/shared-contracts'
import type { SettingsSection } from '../../types'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../common/LanguageSwitcher'

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
  defaultAiPredictionTerminalContextLimit: number
  defaultAiPredictionCommandHistoryLimit: number
  defaultAgentCommandTimeoutSeconds: number
  defaultAiProviderTimeoutSeconds: number
  defaultAiPredictionProviderTimeoutSeconds: number
  defaultAiPredictionTriggerDelayMs: number
  onClose: () => void
  onSettingsSectionChange: (section: SettingsSection) => void
  onSettingsChange: (updater: (current: AppSettings) => AppSettings) => void
  onDesktopLoginRequiredChange: (checked: boolean) => void
  onWebAccessEnabledChange: (checked: boolean) => void
  onChangePasswordFormChange: (updater: (current: ChangePasswordForm) => ChangePasswordForm) => void
  onChangePassword: () => void
  onClearPrediction: () => void
  onSave: () => void
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
  defaultAiPredictionTerminalContextLimit,
  defaultAiPredictionCommandHistoryLimit,
  defaultAgentCommandTimeoutSeconds,
  defaultAiProviderTimeoutSeconds,
  defaultAiPredictionProviderTimeoutSeconds,
  defaultAiPredictionTriggerDelayMs,
  onClose,
  onSettingsSectionChange,
  onSettingsChange,
  onDesktopLoginRequiredChange,
  onWebAccessEnabledChange,
  onChangePasswordFormChange,
  onChangePassword,
  onClearPrediction,
  onSave,
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
            <h3>{t('settings.dialogTitle')}</h3>
          </div>
          <button type="button" title={t('settings.closeDialog')} onClick={onClose}>×</button>
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
                    checked={settings.aiAgentEnabled}
                    disabled={!settings.aiEnabled}
                    type="checkbox"
                    onChange={(event) => onSettingsChange((current) => ({ ...current, aiAgentEnabled: event.target.checked }))}
                  />
                  <span>{t('settings.ai.enableAgent')}</span>
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
                <div className="settings-subsection">
                  <h4>{t('settings.ai.predictionSection')}</h4>
                  <p className="hint-text">{t('settings.ai.predictionSectionHint')}</p>
                  <label>
                    <span>{t('settings.ai.predictionCount')}</span>
                    <input min="1" max="8" type="number" value={settings.aiPredictionCount} onChange={updateNumber('aiPredictionCount', 2)} />
                  </label>
                  <div className="form-row settings-pair">
                    <label>
                      <span>{t('settings.ai.predictionTerminalContextLimit')}</span>
                      <input
                        min="500"
                        max="50000"
                        step="500"
                        type="number"
                        value={settings.aiPredictionTerminalContextLimit ?? defaultAiPredictionTerminalContextLimit}
                        onChange={updateNumber('aiPredictionTerminalContextLimit', defaultAiPredictionTerminalContextLimit)}
                      />
                    </label>
                    <label>
                      <span>{t('settings.ai.predictionCommandHistoryLimit')}</span>
                      <input
                        min="1"
                        max="200"
                        type="number"
                        value={settings.aiPredictionCommandHistoryLimit ?? defaultAiPredictionCommandHistoryLimit}
                        onChange={updateNumber('aiPredictionCommandHistoryLimit', defaultAiPredictionCommandHistoryLimit)}
                      />
                    </label>
                  </div>
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
                    <span>{t('settings.ai.predictionProviderTimeout')}</span>
                    <input
                      min="10"
                      max="1800"
                      type="number"
                      value={settings.aiPredictionProviderTimeoutSeconds ?? defaultAiPredictionProviderTimeoutSeconds}
                      onChange={updateNumber('aiPredictionProviderTimeoutSeconds', defaultAiPredictionProviderTimeoutSeconds)}
                    />
                  </label>
                </div>
                <div className="settings-subsection">
                  <h4>{t('settings.ai.assistSection')}</h4>
                  <p className="hint-text">{t('settings.ai.assistSectionHint')}</p>
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
                </div>
                <label>
                  <span>{t('settings.ai.systemPrompt')}</span>
                  <textarea
                    value={settings.aiSystemPrompt}
                    placeholder={defaultAiSystemPrompt}
                    onChange={(event) => onSettingsChange((current) => ({ ...current, aiSystemPrompt: event.target.value }))}
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
          <button type="button" title={t('settings.closeDialog')} onClick={onClose}>{t('app.close')}</button>
          <button className="primary-button" type="button" title={t('settings.saveDialog')} onClick={onSave}>{t('app.save')}</button>
        </div>
      </section>
    </div>
  )
}
