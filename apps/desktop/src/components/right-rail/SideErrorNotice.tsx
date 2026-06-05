import { useTranslation } from 'react-i18next'
import type { AppErrorNotice } from '../../types'
import { formatLocalizedTime } from '../../utils'

type SideErrorNoticeProps = {
  errorNotice: AppErrorNotice | null
  onClose: () => void
}

export function SideErrorNotice({ errorNotice, onClose }: SideErrorNoticeProps) {
  const { t, i18n } = useTranslation()

  if (!errorNotice) {
    return null
  }

  return (
    <article className="side-error">
      <header>
        <div>
          <strong>{errorNotice.title}</strong>
          <span>{formatLocalizedTime(errorNotice.occurredAt, i18n.language)}</span>
        </div>
        <button type="button" title={t('sideError.close')} onClick={onClose}>
          ×
        </button>
      </header>
      <p className="error-text">{errorNotice.message}</p>
      <dl>
        {errorNotice.source ? (
          <>
            <dt>{t('sideError.source')}</dt>
            <dd>{errorNotice.source}</dd>
          </>
        ) : null}
        {errorNotice.path ? (
          <>
            <dt>{t('sideError.path')}</dt>
            <dd>{`${errorNotice.method ?? 'GET'} ${errorNotice.path}`}</dd>
          </>
        ) : null}
        {errorNotice.status ? (
          <>
            <dt>{t('sideError.status')}</dt>
            <dd>{errorNotice.status}</dd>
          </>
        ) : null}
      </dl>
      {errorNotice.detail ? <small>{errorNotice.detail}</small> : null}
    </article>
  )
}
