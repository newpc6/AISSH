import { useTranslation } from 'react-i18next'
import type { ConfirmDialogState } from '../../types'

type ConfirmModalProps = {
  dialog: ConfirmDialogState
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmModal({ dialog, onClose, onConfirm }: ConfirmModalProps) {
  const { t } = useTranslation()

  if (!dialog) {
    return null
  }

  return (
    <div className="modal-backdrop">
      <section className="confirm-modal">
        <div className="modal-header">
          <div>
            {dialog.section ? <p className="section-label">{dialog.section}</p> : null}
            <h3>{dialog.title}</h3>
          </div>
          <button type="button" title={t('confirmModal.close')} onClick={onClose}>×</button>
        </div>
        <p className="confirm-copy">{dialog.message}</p>
        {dialog.detail ? <code className="confirm-command">{dialog.detail}</code> : null}
        <div className="modal-actions">
          <button type="button" title={t('confirmModal.cancel')} onClick={onClose}>{dialog.cancelText ?? t('app.cancel')}</button>
          <button
            className={dialog.danger ? 'danger-button' : 'primary-button'}
            type="button"
            title={t('confirmModal.confirm')}
            onClick={onConfirm}
          >
            {dialog.confirmText ?? t('app.confirm')}
          </button>
        </div>
      </section>
    </div>
  )
}
