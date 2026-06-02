type GroupModalProps = {
  open: boolean
  groupDialogError: string
  groupDialogMessage: string
  groupDrafts: string[]
  originalGroupDrafts: string[]
  usedCounts: number[]
  onClose: () => void
  onGroupDraftsChange: (next: string[]) => void
  onClearGroupDialogMessage: () => void
  onMoveGroupDraft: (index: number, direction: -1 | 1) => void
  onConfirmDeleteGroupDraft: (index: number, group: string) => void
  onAddGroup: () => void
  onSave: () => void
}

export function GroupModal({
  open,
  groupDialogError,
  groupDialogMessage,
  groupDrafts,
  originalGroupDrafts,
  usedCounts,
  onClose,
  onGroupDraftsChange,
  onClearGroupDialogMessage,
  onMoveGroupDraft,
  onConfirmDeleteGroupDraft,
  onAddGroup,
  onSave,
}: GroupModalProps) {
  if (!open) {
    return null
  }

  return (
    <div className="modal-backdrop">
      <section className="group-modal">
        <div className="modal-header">
          <div>
            <p className="section-label">SSH 连接</p>
            <h3>分组管理</h3>
          </div>
          <button type="button" title="关闭分组管理窗口" onClick={onClose}>×</button>
        </div>

        {groupDialogError ? <p className="error-text modal-error">{groupDialogError}</p> : null}
        {groupDialogMessage ? <p className="success-text">{groupDialogMessage}</p> : null}

        <div className="group-list-editor">
          {groupDrafts.map((group, index) => {
            const groupName = group.trim()
            const originalName = originalGroupDrafts[index]?.trim()
            const usedCount = usedCounts[index] ?? 0
            const isDefaultGroupInUse = (originalName || groupName) === '默认' && usedCount > 0
            return (
              <div className="group-edit-row" key={`${group}-${index}`}>
                <input
                  value={group}
                  onChange={(event) => {
                    const next = [...groupDrafts]
                    next[index] = event.target.value
                    onGroupDraftsChange(next)
                    onClearGroupDialogMessage()
                  }}
                  placeholder="分组名称"
                />
                <span>{usedCount} 台</span>
                <div className="group-row-actions">
                  <button disabled={index === 0} title="上移分组" type="button" onClick={() => onMoveGroupDraft(index, -1)}>
                    ↑
                  </button>
                  <button
                    disabled={index === groupDrafts.length - 1}
                    title="下移分组"
                    type="button"
                    onClick={() => onMoveGroupDraft(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    disabled={groupDrafts.length <= 1 || isDefaultGroupInUse}
                    title={
                      isDefaultGroupInUse
                        ? '默认分组正在被服务器使用，不能删除'
                        : usedCount > 0
                          ? '删除后该分组下服务器会移动到默认分组'
                          : '删除空分组'
                    }
                    type="button"
                    onClick={() => onConfirmDeleteGroupDraft(index, group)}
                  >
                    删除
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="modal-actions">
          <button title="新增一个 SSH 分组" type="button" onClick={onAddGroup}>新增分组</button>
          <button className="primary-button" type="button" title="保存 SSH 分组" onClick={onSave}>保存</button>
        </div>
      </section>
    </div>
  )
}
