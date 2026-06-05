import type { ChangeEvent } from 'react'
import type { AIModelConfig, AIModelProvider } from '@ai-ssh/shared-contracts'
import { useTranslation } from 'react-i18next'

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

type AIModelsDialogProps = {
  open: boolean
  models: AIModelConfig[]
  activeModelId: string
  savedMessage: string
  defaultOllamaBaseUrl: string
  onClose: () => void
  onAdd: (provider: AIModelProvider) => void
  onUpdate: (id: string, patch: Partial<AIModelConfig>) => void
  onRemove: (id: string) => void
  onActiveChange: (id: string) => void
  onSave: () => void
}

export function AIModelsDialog({
  open,
  models,
  activeModelId,
  savedMessage,
  defaultOllamaBaseUrl,
  onClose,
  onAdd,
  onUpdate,
  onRemove,
  onActiveChange,
  onSave,
}: AIModelsDialogProps) {
  const { t } = useTranslation()

  if (!open) {
    return null
  }

  const updateField = (id: string, field: keyof AIModelConfig) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = field === 'thinkingEnabled'
        ? (event.target as HTMLInputElement).checked
        : event.target.value
      onUpdate(id, { [field]: value } as Partial<AIModelConfig>)
    }

  return (
    <div className="modal-backdrop">
      <section className="models-modal">
        <div className="modal-header">
          <div>
            <p className="section-label">{t('modelsDialog.title')}</p>
            <h3>{t('modelsDialog.heading')}</h3>
          </div>
          <button type="button" title={t('modelsDialog.close')} onClick={onClose}>×</button>
        </div>

        <div className="ai-model-settings">
          <div className="ai-model-settings-head">
            <span>{t('modelsDialog.tableTitle')}</span>
            <div className="ai-model-actions">
              <button type="button" title={t('settings.ai.modelActionTitles.addOpenAI')} onClick={() => onAdd('openai-compatible')}>{t('settings.ai.addOpenAI')}</button>
              <button type="button" title={t('settings.ai.modelActionTitles.addClaude')} onClick={() => onAdd('anthropic-claude')}>{t('settings.ai.addClaude')}</button>
              <button type="button" title={t('settings.ai.modelActionTitles.addOllama')} onClick={() => onAdd('ollama')}>{t('settings.ai.addOllama')}</button>
            </div>
          </div>
          <p className="ai-model-help">{t('modelsDialog.help')}</p>
        </div>

        <div className="table-modal-scroll">
          {models.length === 0 ? <p className="hint-text">{t('settings.ai.noModels')}</p> : null}
          {models.length > 0 ? (
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
                    <th>{t('modelsDialog.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr className={model.id === activeModelId ? 'active' : ''} key={model.id}>
                      <td>
                        <label className="checkbox-row compact">
                          <input
                            checked={model.id === activeModelId}
                            name="active-ai-model"
                            type="radio"
                            onChange={() => onActiveChange(model.id)}
                          />
                        </label>
                      </td>
                      <td>
                        <input
                          value={model.name}
                          placeholder={aiProviderLabel(model.provider, t)}
                          onChange={updateField(model.id, 'name')}
                        />
                      </td>
                      <td>
                        <select value={model.provider} onChange={updateField(model.id, 'provider')}>
                          {AI_PROVIDER_VALUES.map((provider) => (
                            <option key={provider} value={provider}>{aiProviderLabel(provider, t)}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={model.baseUrl}
                          placeholder={aiBaseUrlPlaceholder(model.provider, defaultOllamaBaseUrl)}
                          onChange={updateField(model.id, 'baseUrl')}
                        />
                      </td>
                      <td>
                        <input
                          type="password"
                          value={model.apiKey}
                          placeholder={aiKeyPlaceholder(model.provider, t)}
                          onChange={updateField(model.id, 'apiKey')}
                        />
                      </td>
                      <td>
                        <input
                          value={model.model}
                          placeholder={aiModelPlaceholder(model.provider, t)}
                          onChange={updateField(model.id, 'model')}
                        />
                      </td>
                      <td>
                        <label className="checkbox-row compact">
                          <input
                            checked={model.thinkingEnabled}
                            type="checkbox"
                            onChange={updateField(model.id, 'thinkingEnabled')}
                          />
                        </label>
                      </td>
                      <td>
                        <small>{aiProviderHelp(model.provider, t)}</small>
                      </td>
                      <td>
                        <button type="button" title={t('settings.ai.modelActionTitles.removeModel')} onClick={() => onRemove(model.id)}>
                          {t('app.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        {savedMessage ? <p className="success-text">{savedMessage}</p> : null}
        <div className="modal-actions">
          <button type="button" title={t('modelsDialog.close')} onClick={onClose}>{t('app.close')}</button>
          <button className="primary-button" type="button" title={t('modelsDialog.save')} onClick={onSave}>{t('app.save')}</button>
        </div>
      </section>
    </div>
  )
}
