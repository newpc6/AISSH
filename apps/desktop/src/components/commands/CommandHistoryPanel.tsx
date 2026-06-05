import { useTranslation } from 'react-i18next'

type CommandHistoryPanelProps = {
  commandHistory: string[]
  isFavoriteCommand: (command: string) => boolean
  activeSessionConnected: boolean
  onWriteCommand: (command: string) => void
  onToggleFavoriteCommand: (command: string) => void
  onCopyCommand: (command: string) => void
  onExecuteCommand: (command: string) => void
}

export function CommandHistoryPanel({
  commandHistory,
  isFavoriteCommand,
  activeSessionConnected,
  onWriteCommand,
  onToggleFavoriteCommand,
  onCopyCommand,
  onExecuteCommand,
}: CommandHistoryPanelProps) {
  const { t } = useTranslation()

  return (
    <div className="history-list">
      {commandHistory.length === 0 ? (
        <p className="hint-text">{t('commandPanels.historyEmpty')}</p>
      ) : (
        commandHistory.map((command, index) => {
          const favorited = isFavoriteCommand(command)
          return (
            <div className="command-row compact" key={`${index}-${command}`}>
              <button
                className="command-main"
                type="button"
                title={t('commandPanels.useHistoryCommand', { command })}
                onClick={() => onWriteCommand(command)}
              >
                {command}
              </button>
              <button
                className={`favorite-command-button ${favorited ? 'active' : ''}`}
                type="button"
                title={favorited ? t('commandPanels.unfavorite', { command }) : t('commandPanels.favorite', { command })}
                onClick={() => onToggleFavoriteCommand(command)}
              >
                {favorited ? '★' : '☆'}
              </button>
              <button
                className="copy-command-button"
                type="button"
                title={t('commandPanels.copy', { command })}
                onClick={() => onCopyCommand(command)}
              >
                ⧉
              </button>
              <button
                className="execute-command-button"
                disabled={!activeSessionConnected}
                type="button"
                title={t('commandPanels.executeHistoryCommand', { command })}
                onClick={() => onExecuteCommand(command)}
              >
                ▶
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}
