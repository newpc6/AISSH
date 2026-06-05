import { useTranslation } from 'react-i18next'

type AIInputExpandModalProps = {
  open: boolean
  placeholder: string
  value: string
  canSubmit: boolean
  onClose: () => void
  onChange: (value: string) => void
  onSubmit: () => void
}

export function AIInputExpandModal({
  open,
  placeholder,
  value,
  canSubmit,
  onClose,
  onChange,
  onSubmit,
}: AIInputExpandModalProps) {
  const { t } = useTranslation()

  if (!open) {
    return null
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="ai-input-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="section-label">{t('aiInputModal.section')}</p>
            <h3>{t('aiInputModal.title')}</h3>
          </div>
          <button type="button" title={t('aiInputModal.close')} onClick={onClose}>×</button>
        </div>
        <div className="ai-input-modal-body">
          <textarea
            autoFocus
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
                return
              }
              if (event.key === 'Enter' && event.ctrlKey) {
                event.preventDefault()
                onSubmit()
              }
            }}
          />
        </div>
        <div className="modal-actions">
          <button type="button" title={t('aiInputModal.close')} onClick={onClose}>{t('app.close')}</button>
          <button
            className="primary-button"
            disabled={!canSubmit}
            type="button"
            title={t('aiWorkspace.actions.send')}
            onClick={onSubmit}
          >
            {t('ai.send')}
          </button>
        </div>
      </section>
    </div>
  )
}
