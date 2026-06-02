import type { AppErrorNotice } from '../../types'

type SideErrorNoticeProps = {
  errorNotice: AppErrorNotice | null
  onClose: () => void
}

export function SideErrorNotice({ errorNotice, onClose }: SideErrorNoticeProps) {
  if (!errorNotice) {
    return null
  }

  return (
    <article className="side-error">
      <header>
        <div>
          <strong>{errorNotice.title}</strong>
          <span>{new Date(errorNotice.occurredAt).toLocaleTimeString()}</span>
        </div>
        <button type="button" title="关闭错误提示" onClick={onClose}>
          ×
        </button>
      </header>
      <p className="error-text">{errorNotice.message}</p>
      <dl>
        {errorNotice.source ? (
          <>
            <dt>来源</dt>
            <dd>{errorNotice.source}</dd>
          </>
        ) : null}
        {errorNotice.path ? (
          <>
            <dt>接口</dt>
            <dd>{`${errorNotice.method ?? 'GET'} ${errorNotice.path}`}</dd>
          </>
        ) : null}
        {errorNotice.status ? (
          <>
            <dt>状态</dt>
            <dd>{errorNotice.status}</dd>
          </>
        ) : null}
      </dl>
      {errorNotice.detail ? <small>{errorNotice.detail}</small> : null}
    </article>
  )
}
