import type { ChangeEvent, FormEvent, RefObject } from 'react'
import type { HostAuthType, HostGroup, HostUpsertRequest } from '@ai-ssh/shared-contracts'
import type { HostDialogMode } from '../../types'

type HostDialogProps = {
  open: boolean
  hostDialogMode: HostDialogMode
  hostDialogError: string
  hostForm: HostUpsertRequest
  hostGroups: HostGroup[]
  savePassword: boolean
  savePrivateKey: boolean
  isSavingHost: boolean
  privateKeyFileRef: RefObject<HTMLInputElement | null>
  onClose: () => void
  onSubmit: () => void
  onHostFormChange: (updater: (current: HostUpsertRequest) => HostUpsertRequest) => void
  onSavePasswordChange: (checked: boolean) => void
  onSavePrivateKeyChange: (checked: boolean) => void
  onSelectPrivateKeyFile: (file: File | null) => void
}

export function HostDialog({
  open,
  hostDialogMode,
  hostDialogError,
  hostForm,
  hostGroups,
  savePassword,
  savePrivateKey,
  isSavingHost,
  privateKeyFileRef,
  onClose,
  onSubmit,
  onHostFormChange,
  onSavePasswordChange,
  onSavePrivateKeyChange,
  onSelectPrivateKeyFile,
}: HostDialogProps) {
  if (!open) {
    return null
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  const handleAuthTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const authType = event.target.value as HostAuthType
    onHostFormChange((current) => ({ ...current, authType, password: '', privateKey: '' }))
    onSavePasswordChange(false)
    onSavePrivateKeyChange(false)
  }

  return (
    <div className="modal-backdrop">
      <form className="host-modal" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <p className="section-label">SSH 连接</p>
            <h3>{hostDialogMode === 'edit' ? '编辑服务器' : '新增服务器'}</h3>
          </div>
          <button type="button" title="关闭服务器编辑窗口" onClick={onClose}>×</button>
        </div>

        {hostDialogError ? <p className="error-text modal-error">{hostDialogError}</p> : null}

        <label>
          <span>名称</span>
          <input
            value={hostForm.name}
            onChange={(event) => onHostFormChange((current) => ({ ...current, name: event.target.value }))}
            placeholder="服务器名称"
          />
        </label>
        <div className="form-row">
          <label>
            <span>分组</span>
            <input
              list="host-group-options"
              value={hostForm.group ?? ''}
              onChange={(event) => onHostFormChange((current) => ({ ...current, group: event.target.value }))}
              placeholder="默认"
            />
            <datalist id="host-group-options">
              {hostGroups.map((group) => (
                <option key={group.name} value={group.name} />
              ))}
            </datalist>
          </label>
          <label>
            <span>认证</span>
            <select value={hostForm.authType} onChange={handleAuthTypeChange}>
              <option value="password">密码</option>
              <option value="privateKey">SSH Key</option>
              <option value="agent">Agent</option>
            </select>
          </label>
        </div>
        <label>
          <span>地址</span>
          <input
            value={hostForm.address}
            onChange={(event) => onHostFormChange((current) => ({ ...current, address: event.target.value }))}
            placeholder="192.168.1.10"
          />
        </label>
        <div className="form-row">
          <label>
            <span>端口</span>
            <input
              type="number"
              min="1"
              max="65535"
              value={hostForm.port}
              onChange={(event) =>
                onHostFormChange((current) => ({ ...current, port: Number(event.target.value) || 22 }))
              }
            />
          </label>
          <label>
            <span>用户</span>
            <input
              value={hostForm.username}
              onChange={(event) => onHostFormChange((current) => ({ ...current, username: event.target.value }))}
              placeholder="root"
            />
          </label>
        </div>

        {hostForm.authType === 'password' ? (
          <div className="secret-area">
            <label className="checkbox-row">
              <input checked={savePassword} onChange={(event) => onSavePasswordChange(event.target.checked)} type="checkbox" />
              <span>{hostDialogMode === 'edit' && savePassword ? '保留或更新密码' : '保存密码'}</span>
            </label>
            <label>
              <span>密码</span>
              <input
                disabled={!savePassword}
                type="password"
                value={hostForm.password ?? ''}
                onChange={(event) => onHostFormChange((current) => ({ ...current, password: event.target.value }))}
                placeholder="保存后连接时自动使用"
              />
            </label>
          </div>
        ) : null}

        {hostForm.authType === 'privateKey' ? (
          <div className="secret-area">
            <label className="checkbox-row">
              <input checked={savePrivateKey} onChange={(event) => onSavePrivateKeyChange(event.target.checked)} type="checkbox" />
              <span>{hostDialogMode === 'edit' && savePrivateKey ? '保留或更新 SSH Key' : '保存 SSH Key'}</span>
            </label>
            <label>
              <span>SSH Key</span>
              <div className="file-picker-row">
                <button
                  disabled={!savePrivateKey}
                  title="选择本地 SSH 私钥文件"
                  type="button"
                  onClick={() => privateKeyFileRef.current?.click()}
                >
                  选择文件
                </button>
                <small>{hostForm.privateKey ? '已读取私钥内容' : '支持选择本地私钥文件'}</small>
              </div>
              <input
                accept=".pem,.key,.pub,.txt"
                ref={privateKeyFileRef}
                type="file"
                hidden
                onChange={(event) => {
                  onSelectPrivateKeyFile(event.target.files?.[0] ?? null)
                  event.target.value = ''
                }}
              />
              <textarea
                disabled={!savePrivateKey}
                value={hostForm.privateKey ?? ''}
                onChange={(event) => onHostFormChange((current) => ({ ...current, privateKey: event.target.value }))}
                placeholder="保存后连接时自动使用"
              />
            </label>
          </div>
        ) : null}

        <div className="modal-actions">
          <button disabled={isSavingHost} title="取消保存服务器" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" disabled={isSavingHost} title="保存服务器配置" type="submit">
            {isSavingHost ? '保存中' : hostDialogMode === 'edit' ? '保存修改' : '保存'}
          </button>
        </div>
      </form>
    </div>
  )
}
