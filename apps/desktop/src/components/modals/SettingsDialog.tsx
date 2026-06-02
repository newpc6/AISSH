import type { ChangeEvent } from 'react'
import type { AIModelProvider, AppSettings } from '@ai-ssh/shared-contracts'
import type { SettingsSection } from '../../types'

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
                <p className="ai-model-help">关闭后会尽量让 OpenAI 兼容接口和 Ollama 跳过深度思考；Qwen/Ollama 会额外发送 `/no_think`，适合 qwen3 系列思考太久的场景。</p>
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
                      <button type="button" title="新增 Ollama 模型" onClick={() => onAddAIModelConfig('ollama')}>+ Ollama</button>
                    </div>
                  </div>
                  <p className="ai-model-help">Ollama 请填写 OpenAI 兼容地址，例如 `http://111.4.141.154:41000/v1`；不要只填 host:port。模型名填写 `ollama list` 中的名称。</p>
                  {settings.aiModels.length === 0 ? <p className="hint-text">尚未配置 AI 模型。</p> : null}
                  {settings.aiModels.map((model) => (
                    <div className={`ai-model-config-row${model.id === settings.activeAIModelId ? ' active' : ''}`} key={model.id}>
                      <label className="checkbox-row">
                        <input
                          checked={model.id === settings.activeAIModelId}
                          name="active-ai-model"
                          type="radio"
                          onChange={() => onSettingsChange((current) => normalizeSettings({ ...current, activeAIModelId: model.id }))}
                        />
                        <span>启用</span>
                      </label>
                      <label>
                        <span>名称</span>
                        <input
                          value={model.name}
                          onChange={(event) => onUpdateAIModelConfig(model.id, { name: event.target.value })}
                          placeholder={model.provider === 'ollama' ? 'Ollama' : 'OpenAI Compatible'}
                        />
                      </label>
                      <label>
                        <span>类型</span>
                        <select value={model.provider} onChange={(event) => onUpdateAIModelConfig(model.id, { provider: event.target.value as AIModelProvider })}>
                          <option value="openai-compatible">OpenAI 兼容</option>
                          <option value="ollama">Ollama</option>
                        </select>
                      </label>
                      <label>
                        <span>地址</span>
                        <input
                          value={model.baseUrl}
                          onChange={(event) => onUpdateAIModelConfig(model.id, { baseUrl: event.target.value })}
                          placeholder={model.provider === 'ollama' ? defaultOllamaBaseUrl : 'https://api.openai.com/v1'}
                        />
                      </label>
                      <label>
                        <span>API Key</span>
                        <input
                          type="password"
                          value={model.apiKey}
                          onChange={(event) => onUpdateAIModelConfig(model.id, { apiKey: event.target.value })}
                          placeholder={model.provider === 'ollama' ? 'Ollama 通常可留空' : 'sk-...'}
                        />
                      </label>
                      <label>
                        <span>模型</span>
                        <input
                          value={model.model}
                          onChange={(event) => onUpdateAIModelConfig(model.id, { model: event.target.value })}
                          placeholder={model.provider === 'ollama' ? 'llama3.1' : 'gpt-4.1-mini'}
                        />
                      </label>
                      <div className="ai-model-row-footer">
                        <small>{model.provider === 'ollama' ? '使用 Ollama 的 OpenAI 兼容接口 /v1/chat/completions。' : '适用于 OpenAI、DeepSeek、通义千问等兼容接口。'}</small>
                        <button type="button" title="删除这个模型配置" onClick={() => onRemoveAIModelConfig(model.id)}>删除</button>
                      </div>
                    </div>
                  ))}
                </div>
                <label>
                  <span>系统提示词</span>
                  <textarea
                    value={settings.aiSystemPrompt}
                    onChange={(event) => onSettingsChange((current) => ({ ...current, aiSystemPrompt: event.target.value }))}
                    placeholder={defaultAiSystemPrompt}
                  />
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
