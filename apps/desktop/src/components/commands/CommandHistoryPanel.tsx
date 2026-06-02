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
  return (
    <div className="history-list">
      {commandHistory.length === 0 ? (
        <p className="hint-text">暂无历史命令</p>
      ) : (
        commandHistory.map((command, index) => {
          const favorited = isFavoriteCommand(command)
          return (
            <div className="command-row compact" key={`${index}-${command}`}>
              <button
                className="command-main"
                type="button"
                title={`输入历史命令：${command}`}
                onClick={() => onWriteCommand(command)}
              >
                {command}
              </button>
              <button
                className={`favorite-command-button ${favorited ? 'active' : ''}`}
                type="button"
                title={favorited ? `取消收藏：${command}` : `收藏命令：${command}`}
                onClick={() => onToggleFavoriteCommand(command)}
              >
                {favorited ? '★' : '☆'}
              </button>
              <button
                className="copy-command-button"
                type="button"
                title={`复制命令：${command}`}
                onClick={() => onCopyCommand(command)}
              >
                ⧉
              </button>
              <button
                className="execute-command-button"
                disabled={!activeSessionConnected}
                type="button"
                title={`执行历史命令：${command}`}
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
