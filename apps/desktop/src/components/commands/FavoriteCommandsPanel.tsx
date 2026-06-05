import { useTranslation } from 'react-i18next'

type FavoriteCommandsPanelProps = {
  favoriteCommandDraft: string
  favoriteCommands: string[]
  activeSessionConnected: boolean
  onFavoriteCommandDraftChange: (value: string) => void
  onAddFavoriteCommand: () => void
  onWriteCommand: (command: string) => void
  onExecuteCommand: (command: string) => void
  onCopyCommand: (command: string) => void
  onMoveFavoriteCommand: (index: number, direction: -1 | 1) => void
  onConfirmDeleteFavoriteCommand: (command: string) => void
}

export function FavoriteCommandsPanel({
  favoriteCommandDraft,
  favoriteCommands,
  activeSessionConnected,
  onFavoriteCommandDraftChange,
  onAddFavoriteCommand,
  onWriteCommand,
  onExecuteCommand,
  onCopyCommand,
  onMoveFavoriteCommand,
  onConfirmDeleteFavoriteCommand,
}: FavoriteCommandsPanelProps) {
  const { t } = useTranslation()

  return (
    <div className="favorite-list">
      <form
        className="favorite-add-form"
        onSubmit={(event) => {
          event.preventDefault()
          onAddFavoriteCommand()
        }}
      >
        <input
          placeholder={t('commandPanels.favoritePlaceholder')}
          value={favoriteCommandDraft}
          onChange={(event) => onFavoriteCommandDraftChange(event.target.value)}
        />
        <button type="submit" title={t('commandPanels.addFavorite')}>{t('app.add')}</button>
      </form>
      {favoriteCommands.length === 0 ? (
        <p className="hint-text">{t('commandPanels.favoriteEmpty')}</p>
      ) : (
        favoriteCommands.map((command, index) => (
          <div className="command-row compact" key={command}>
            <span className="favorite-command-index">{index + 1}</span>
            <button
              className="command-main"
              type="button"
              title={t('commandPanels.useFavoriteCommand', { command })}
              onClick={() => onWriteCommand(command)}
            >
              {command}
            </button>
            <button
              className="execute-command-button"
              disabled={!activeSessionConnected}
              type="button"
              title={t('commandPanels.executeFavoriteCommand', { command })}
              onClick={() => onExecuteCommand(command)}
            >
              ▶
            </button>
            <button
              className="copy-command-button"
              type="button"
              title={t('commandPanels.copy', { command })}
              onClick={() => onCopyCommand(command)}
            >
              ⧉
            </button>
            <div className="favorite-order-buttons">
              <button
                className="favorite-command-button"
                disabled={index === 0}
                type="button"
                title={t('commandPanels.moveUp', { command })}
                onClick={() => onMoveFavoriteCommand(index, -1)}
              >
                ↑
              </button>
              <button
                className="favorite-command-button"
                disabled={index === favoriteCommands.length - 1}
                type="button"
                title={t('commandPanels.moveDown', { command })}
                onClick={() => onMoveFavoriteCommand(index, 1)}
              >
                ↓
              </button>
            </div>
            <button
              className="favorite-command-button danger"
              type="button"
              title={t('commandPanels.deleteFavorite', { command })}
              onClick={() => onConfirmDeleteFavoriteCommand(command)}
            >
              ×
            </button>
          </div>
        ))
      )}
    </div>
  )
}
