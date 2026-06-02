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
          placeholder="手动添加收藏命令"
          value={favoriteCommandDraft}
          onChange={(event) => onFavoriteCommandDraftChange(event.target.value)}
        />
        <button type="submit" title="添加收藏命令">添加</button>
      </form>
      {favoriteCommands.length === 0 ? (
        <p className="hint-text">暂无收藏命令</p>
      ) : (
        favoriteCommands.map((command, index) => (
          <div className="command-row compact" key={command}>
            <span className="favorite-command-index">{index + 1}</span>
            <button
              className="command-main"
              type="button"
              title={`输入收藏命令：${command}`}
              onClick={() => onWriteCommand(command)}
            >
              {command}
            </button>
            <button
              className="execute-command-button"
              disabled={!activeSessionConnected}
              type="button"
              title={`执行收藏命令：${command}`}
              onClick={() => onExecuteCommand(command)}
            >
              ▶
            </button>
            <button
              className="copy-command-button"
              type="button"
              title={`复制命令：${command}`}
              onClick={() => onCopyCommand(command)}
            >
              ⧉
            </button>
            <div className="favorite-order-buttons">
              <button
                className="favorite-command-button"
                disabled={index === 0}
                type="button"
                title={`上移收藏命令：${command}`}
                onClick={() => onMoveFavoriteCommand(index, -1)}
              >
                ↑
              </button>
              <button
                className="favorite-command-button"
                disabled={index === favoriteCommands.length - 1}
                type="button"
                title={`下移收藏命令：${command}`}
                onClick={() => onMoveFavoriteCommand(index, 1)}
              >
                ↓
              </button>
            </div>
            <button
              className="favorite-command-button danger"
              type="button"
              title={`删除收藏命令：${command}`}
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
