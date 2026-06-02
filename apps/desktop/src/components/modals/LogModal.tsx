import type { LogEntry, LogLevel } from '@ai-ssh/shared-contracts'

type LogModalProps = {
  open: boolean
  logLevel: LogLevel
  logHealthChecks: boolean
  logSearch: string
  visibleLogs: LogEntry[]
  onClose: () => void
  onUpdateLogLevel: (level: LogLevel) => void
  onUpdateLogHealthChecks: (enabled: boolean) => void
  onLogSearchChange: (value: string) => void
  onRefresh: () => void
}

export function LogModal({
  open,
  logLevel,
  logHealthChecks,
  logSearch,
  visibleLogs,
  onClose,
  onUpdateLogLevel,
  onUpdateLogHealthChecks,
  onLogSearchChange,
  onRefresh,
}: LogModalProps) {
  if (!open) {
    return null
  }

  return (
    <div className="modal-backdrop">
      <section className="log-modal">
        <div className="modal-header">
          <div>
            <p className="section-label">工具</p>
            <h3>运行日志</h3>
          </div>
          <button type="button" title="关闭日志窗口" onClick={onClose}>×</button>
        </div>

        <div className="log-toolbar">
          <label>
            <span>展示级别</span>
            <select value={logLevel} onChange={(event) => onUpdateLogLevel(event.target.value as LogLevel)}>
              <option value="debug">debug</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </label>
          <label className="checkbox-row compact-checkbox">
            <input
              checked={logHealthChecks}
              type="checkbox"
              onChange={(event) => onUpdateLogHealthChecks(event.target.checked)}
            />
            <span>记录健康检查</span>
          </label>
          <label>
            <span>搜索</span>
            <input
              placeholder="搜索 predict、ai/predict、source=ai..."
              value={logSearch}
              onChange={(event) => onLogSearchChange(event.target.value)}
            />
          </label>
          <button type="button" title="刷新运行日志" onClick={onRefresh}>刷新</button>
        </div>

        <div className="log-list">
          {visibleLogs.length === 0 ? (
            <p className="hint-text">暂无日志</p>
          ) : (
            visibleLogs
              .slice()
              .reverse()
              .map((entry) => (
                <article className={`log-row log-${entry.level}`} key={entry.id}>
                  <header>
                    <strong>{entry.level}</strong>
                    <span>{entry.source}</span>
                    <time>{new Date(entry.timestamp).toLocaleString()}</time>
                  </header>
                  <p>{entry.message}</p>
                  {entry.fields ? <code>{JSON.stringify(entry.fields)}</code> : null}
                </article>
              ))
          )}
        </div>
      </section>
    </div>
  )
}
