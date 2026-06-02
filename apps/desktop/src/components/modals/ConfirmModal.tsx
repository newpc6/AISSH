import type { ConfirmDialogState } from '../../types'

type ConfirmModalProps = {
  dialog: ConfirmDialogState
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmModal({ dialog, onClose, onConfirm }: ConfirmModalProps) {
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
          <button type="button" title="关闭确认" onClick={onClose}>×</button>
        </div>
        <p className="confirm-copy">{dialog.message}</p>
        {dialog.detail ? <code className="confirm-command">{dialog.detail}</code> : null}
        <div className="modal-actions">
          <button type="button" title="取消操作" onClick={onClose}>{dialog.cancelText ?? '取消'}</button>
          <button
            className={dialog.danger ? 'danger-button' : 'primary-button'}
            type="button"
            title="确认操作"
            onClick={onConfirm}
          >
            {dialog.confirmText ?? '确认'}
          </button>
        </div>
      </section>
    </div>
  )
}
