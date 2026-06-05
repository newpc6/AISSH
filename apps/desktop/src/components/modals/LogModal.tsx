import type { LogEntry, LogLevel } from '@ai-ssh/shared-contracts'
import { useTranslation } from 'react-i18next'
import { formatLocalizedDateTime } from '../../utils'

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
  const { t, i18n } = useTranslation()

  if (!open) {
    return null
  }

  return (
    <div className="modal-backdrop">
      <section className="log-modal">
        <div className="modal-header">
          <div>
            <p className="section-label">{t('logs.sectionLabel')}</p>
            <h3>{t('logs.title')}</h3>
          </div>
          <button type="button" title={t('logs.close')} onClick={onClose}>×</button>
        </div>

        <div className="log-toolbar">
          <label>
            <span>{t('logs.level')}</span>
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
            <span>{t('logs.healthChecks')}</span>
          </label>
          <label>
            <span>{t('logs.search')}</span>
            <input
              placeholder={t('logs.searchPlaceholder')}
              value={logSearch}
              onChange={(event) => onLogSearchChange(event.target.value)}
            />
          </label>
          <button type="button" title={t('logs.refresh')} onClick={onRefresh}>{t('app.refresh')}</button>
        </div>

        <div className="log-list">
          {visibleLogs.length === 0 ? (
            <p className="hint-text">{t('logs.empty')}</p>
          ) : (
            visibleLogs
              .slice()
              .reverse()
              .map((entry) => (
                <article className={`log-row log-${entry.level}`} key={entry.id}>
                  <header>
                    <strong>{entry.level}</strong>
                    <span>{entry.source}</span>
                    <time>{formatLocalizedDateTime(entry.timestamp, i18n.language)}</time>
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
