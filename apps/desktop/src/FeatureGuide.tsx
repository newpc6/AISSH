import { useTranslation } from 'react-i18next'

type FeatureItem = {
  name: string
  description: string
  usage: string
}

type FeatureModule = {
  title: string
  summary: string
  features: FeatureItem[]
}

export function FeatureGuide({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()

  const featureModules: FeatureModule[] = [
    {
      title: t('featureGuide.serverManagement.title'),
      summary: t('featureGuide.serverManagement.summary'),
      features: [
        {
          name: t('featureGuide.serverManagement.serverList.name'),
          description: t('featureGuide.serverManagement.serverList.description'),
          usage: t('featureGuide.serverManagement.serverList.usage')
        },
        {
          name: t('featureGuide.serverManagement.groupManagement.name'),
          description: t('featureGuide.serverManagement.groupManagement.description'),
          usage: t('featureGuide.serverManagement.groupManagement.usage')
        },
        {
          name: t('featureGuide.serverManagement.importExport.name'),
          description: t('featureGuide.serverManagement.importExport.description'),
          usage: t('featureGuide.serverManagement.importExport.usage')
        },
        {
          name: t('featureGuide.serverManagement.serverReorder.name'),
          description: t('featureGuide.serverManagement.serverReorder.description'),
          usage: t('featureGuide.serverManagement.serverReorder.usage')
        },
      ],
    },
    {
      title: t('featureGuide.terminalSession.title'),
      summary: t('featureGuide.terminalSession.summary'),
      features: [
        {
          name: t('featureGuide.terminalSession.multiSession.name'),
          description: t('featureGuide.terminalSession.multiSession.description'),
          usage: t('featureGuide.terminalSession.multiSession.usage')
        },
        {
          name: t('featureGuide.terminalSession.commandHistory.name'),
          description: t('featureGuide.terminalSession.commandHistory.description'),
          usage: t('featureGuide.terminalSession.commandHistory.usage')
        },
        {
          name: t('featureGuide.terminalSession.terminalContext.name'),
          description: t('featureGuide.terminalSession.terminalContext.description'),
          usage: t('featureGuide.terminalSession.terminalContext.usage')
        },
      ],
    },
    {
      title: t('featureGuide.aiAssistant.title'),
      summary: t('featureGuide.aiAssistant.summary'),
      features: [
        {
          name: t('featureGuide.aiAssistant.modelConfig.name'),
          description: t('featureGuide.aiAssistant.modelConfig.description'),
          usage: t('featureGuide.aiAssistant.modelConfig.usage')
        },
        {
          name: t('featureGuide.aiAssistant.unifiedInput.name'),
          description: t('featureGuide.aiAssistant.unifiedInput.description'),
          usage: t('featureGuide.aiAssistant.unifiedInput.usage')
        },
        {
          name: t('featureGuide.aiAssistant.agentMode.name'),
          description: t('featureGuide.aiAssistant.agentMode.description'),
          usage: t('featureGuide.aiAssistant.agentMode.usage')
        },
        {
          name: t('featureGuide.aiAssistant.thinkingControl.name'),
          description: t('featureGuide.aiAssistant.thinkingControl.description'),
          usage: t('featureGuide.aiAssistant.thinkingControl.usage')
        },
        {
          name: t('featureGuide.aiAssistant.commandPrediction.name'),
          description: t('featureGuide.aiAssistant.commandPrediction.description'),
          usage: t('featureGuide.aiAssistant.commandPrediction.usage')
        },
        {
          name: t('featureGuide.aiAssistant.customPrompt.name'),
          description: t('featureGuide.aiAssistant.customPrompt.description'),
          usage: t('featureGuide.aiAssistant.customPrompt.usage')
        },
        {
          name: t('featureGuide.aiAssistant.longTaskOptimization.name'),
          description: t('featureGuide.aiAssistant.longTaskOptimization.description'),
          usage: t('featureGuide.aiAssistant.longTaskOptimization.usage')
        },
      ],
    },
    {
      title: t('featureGuide.batchTask.title'),
      summary: t('featureGuide.batchTask.summary'),
      features: [
        {
          name: t('featureGuide.batchTask.batchSelection.name'),
          description: t('featureGuide.batchTask.batchSelection.description'),
          usage: t('featureGuide.batchTask.batchSelection.usage')
        },
        {
          name: t('featureGuide.batchTask.sequentialExecution.name'),
          description: t('featureGuide.batchTask.sequentialExecution.description'),
          usage: t('featureGuide.batchTask.sequentialExecution.usage')
        },
        {
          name: t('featureGuide.batchTask.finalSummary.name'),
          description: t('featureGuide.batchTask.finalSummary.description'),
          usage: t('featureGuide.batchTask.finalSummary.usage')
        },
      ],
    },
    {
      title: t('featureGuide.fileTransfer.title'),
      summary: t('featureGuide.fileTransfer.summary'),
      features: [
        {
          name: t('featureGuide.fileTransfer.filePanel.name'),
          description: t('featureGuide.fileTransfer.filePanel.description'),
          usage: t('featureGuide.fileTransfer.filePanel.usage')
        },
        {
          name: t('featureGuide.fileTransfer.previewEdit.name'),
          description: t('featureGuide.fileTransfer.previewEdit.description'),
          usage: t('featureGuide.fileTransfer.previewEdit.usage')
        },
        {
          name: t('featureGuide.fileTransfer.uploadDownload.name'),
          description: t('featureGuide.fileTransfer.uploadDownload.description'),
          usage: t('featureGuide.fileTransfer.uploadDownload.usage')
        },
      ],
    },
    {
      title: t('featureGuide.logSecurity.title'),
      summary: t('featureGuide.logSecurity.summary'),
      features: [
        {
          name: t('featureGuide.logSecurity.runtimeLog.name'),
          description: t('featureGuide.logSecurity.runtimeLog.description'),
          usage: t('featureGuide.logSecurity.runtimeLog.usage')
        },
        {
          name: t('featureGuide.logSecurity.webLogin.name'),
          description: t('featureGuide.logSecurity.webLogin.description'),
          usage: t('featureGuide.logSecurity.webLogin.usage')
        },
        {
          name: t('featureGuide.logSecurity.errorNotification.name'),
          description: t('featureGuide.logSecurity.errorNotification.description'),
          usage: t('featureGuide.logSecurity.errorNotification.usage')
        },
      ],
    },
    {
      title: t('featureGuide.keyboardShortcuts.title'),
      summary: t('featureGuide.keyboardShortcuts.summary'),
      features: [
        {
          name: t('featureGuide.keyboardShortcuts.global.name'),
          description: t('featureGuide.keyboardShortcuts.global.description'),
          usage: t('featureGuide.keyboardShortcuts.global.usage')
        },
        {
          name: t('featureGuide.keyboardShortcuts.terminal.name'),
          description: t('featureGuide.keyboardShortcuts.terminal.description'),
          usage: t('featureGuide.keyboardShortcuts.terminal.usage')
        },
        {
          name: t('featureGuide.keyboardShortcuts.ai.name'),
          description: t('featureGuide.keyboardShortcuts.ai.description'),
          usage: t('featureGuide.keyboardShortcuts.ai.usage')
        },
      ],
    },
    {
      title: t('featureGuide.multiLanguage.title'),
      summary: t('featureGuide.multiLanguage.summary'),
      features: [
        {
          name: t('featureGuide.multiLanguage.languageSwitch.name'),
          description: t('featureGuide.multiLanguage.languageSwitch.description'),
          usage: t('featureGuide.multiLanguage.languageSwitch.usage')
        },
        {
          name: t('featureGuide.multiLanguage.autoSave.name'),
          description: t('featureGuide.multiLanguage.autoSave.description'),
          usage: t('featureGuide.multiLanguage.autoSave.usage')
        },
      ],
    },
  ]

  return (
    <div className="modal-backdrop">
      <section className="feature-guide-modal">
        <div className="modal-header">
          <div>
            <p className="section-label">{t('featureGuide.help')}</p>
            <h3>{t('featureGuide.title')}</h3>
          </div>
          <button type="button" title={t('featureGuide.close')} onClick={onClose}>×</button>
        </div>
        <div className="feature-guide-content">
          {featureModules.map((module) => (
            <section className="feature-guide-section" key={module.title}>
              <div>
                <h4>{module.title}</h4>
                <p>{module.summary}</p>
              </div>
              <div className="feature-guide-list">
                {module.features.map((feature) => (
                  <article className="feature-guide-item" key={feature.name}>
                    <strong>{feature.name}</strong>
                    <p>{feature.description}</p>
                    <small>{feature.usage}</small>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="modal-actions">
          <button className="primary-button" type="button" title={t('featureGuide.close')} onClick={onClose}>{t('featureGuide.gotIt')}</button>
        </div>
      </section>
    </div>
  )
}
