import type { ReactNode } from 'react'

type MetricExpandModalProps = {
  open: boolean
  label: string
  onClose: () => void
  children: ReactNode
}

export function MetricExpandModal({ open, label, onClose, children }: MetricExpandModalProps) {
  if (!open) {
    return null
  }

  return (
    <div className="modal-backdrop">
      <section className="metric-modal">
        <div className="modal-header">
          <div>
            <p className="section-label">当前服务器</p>
            <h3>{label}</h3>
          </div>
          <button type="button" title="关闭放大图表" onClick={onClose}>×</button>
        </div>
        {children}
      </section>
    </div>
  )
}
