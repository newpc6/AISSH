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
  if (!open) {
    return null
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="ai-input-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="section-label">AI 输入框</p>
            <h3>放大查看与编辑</h3>
          </div>
          <button type="button" title="关闭放大输入框" onClick={onClose}>×</button>
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
          <button type="button" title="关闭放大输入框" onClick={onClose}>关闭</button>
          <button
            className="primary-button"
            disabled={!canSubmit}
            type="button"
            title="发送给统一 AI 助手"
            onClick={onSubmit}
          >
            发送
          </button>
        </div>
      </section>
    </div>
  )
}
