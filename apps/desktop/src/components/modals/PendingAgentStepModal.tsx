import type { AIAgentPlanStep } from '../../types'

type PendingAgentStepModalProps = {
  step: AIAgentPlanStep | null
  open: boolean
  onClose: () => void
  onConfirm: () => void
}

export function PendingAgentStepModal({ step, open, onClose, onConfirm }: PendingAgentStepModalProps) {
  if (!open) {
    return null
  }

  return (
    <div className="modal-backdrop">
      <section className="confirm-modal">
        <div className="modal-header">
          <div>
            <p className="section-label">AI Agent</p>
            <h3>确认高风险命令</h3>
          </div>
          <button type="button" title="关闭确认" onClick={onClose}>×</button>
        </div>
        {!step ? (
          <p className="error-text">待确认命令不存在</p>
        ) : (
          <>
            <p className="confirm-copy">Agent 认为这一步风险较高，请确认后再执行。</p>
            <code className="confirm-command">{step.command}</code>
            {step.riskReason ? <p className="hint-text">{step.riskReason}</p> : null}
            <div className="modal-actions">
              <button type="button" title="取消执行" onClick={onClose}>取消</button>
              <button className="danger-button" type="button" title="确认执行高风险命令" onClick={onConfirm}>
                确认执行
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
