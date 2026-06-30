import type { ChangeEvent, FormEvent, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { HostAuthType, HostGroup, HostProtocol, HostUpsertRequest } from '@ai-ssh/shared-contracts'
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
  const { t } = useTranslation()

  if (!open) {
    return null
  }

  const protocol = hostForm.protocol ?? 'ssh'
  const isWSL = protocol === 'wsl'

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  const handleProtocolChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextProtocol = event.target.value as HostProtocol
    onHostFormChange((current) => ({
      ...current,
      protocol: nextProtocol,
      authType: nextProtocol === 'wsl' ? 'agent' : 'password',
      hostKeyPolicy: nextProtocol === 'wsl' ? undefined : current.hostKeyPolicy ?? 'accept-new',
      address: nextProtocol === 'wsl' ? 'wsl.local' : '',
      port: nextProtocol === 'wsl' ? 0 : 22,
      password: '',
      privateKey: '',
      wslDistro: nextProtocol === 'wsl' ? current.wslDistro ?? '' : '',
    }))
    onSavePasswordChange(false)
    onSavePrivateKeyChange(false)
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
            <p className="section-label">{t(isWSL ? 'hostDialog.protocols.wsl' : 'hostDialog.protocols.ssh')}</p>
            <h3>{t(hostDialogMode === 'edit' ? 'hostDialog.editTitle' : 'hostDialog.createTitle')}</h3>
          </div>
          <button type="button" title={t('hostDialog.close')} onClick={onClose}>
            {t('app.close')}
          </button>
        </div>

        {hostDialogError ? <p className="error-text modal-error">{hostDialogError}</p> : null}

        <label>
          <span>{t('hostDialog.fields.name')}</span>
          <input
            value={hostForm.name}
            onChange={(event) => onHostFormChange((current) => ({ ...current, name: event.target.value }))}
            placeholder={t(isWSL ? 'hostDialog.placeholders.wslName' : 'hostDialog.placeholders.sshName')}
          />
        </label>

        <div className="form-row">
          <label>
            <span>{t('hostDialog.fields.group')}</span>
            <input
              list="host-group-options"
              value={hostForm.group ?? ''}
              onChange={(event) => onHostFormChange((current) => ({ ...current, group: event.target.value }))}
              placeholder={t('hostDialog.placeholders.group')}
            />
            <datalist id="host-group-options">
              {hostGroups.map((group) => (
                <option key={group.name} value={group.name} />
              ))}
            </datalist>
          </label>
          <label>
            <span>{t('hostDialog.fields.protocol')}</span>
            <select value={protocol} onChange={handleProtocolChange}>
              <option value="ssh">{t('hostDialog.protocols.ssh')}</option>
              <option value="wsl">{t('hostDialog.protocols.wsl')}</option>
            </select>
          </label>
        </div>

        {isWSL ? (
          <>
            <label>
              <span>{t('hostDialog.fields.wslDistro')}</span>
              <input
                value={hostForm.wslDistro ?? ''}
                onChange={(event) =>
                  onHostFormChange((current) => ({ ...current, wslDistro: event.target.value, address: 'wsl.local' }))
                }
                placeholder={t('hostDialog.placeholders.wslDistro')}
              />
            </label>
            <label>
              <span>{t('hostDialog.fields.username')}</span>
              <input
                value={hostForm.username}
                onChange={(event) => onHostFormChange((current) => ({ ...current, username: event.target.value }))}
                placeholder={t('hostDialog.placeholders.wslUser')}
              />
            </label>
          </>
        ) : (
          <>
            <div className="form-row">
              <label>
                <span>{t('hostDialog.fields.authType')}</span>
                <select value={hostForm.authType} onChange={handleAuthTypeChange}>
                  <option value="password">{t('hostDialog.authTypes.password')}</option>
                  <option value="privateKey">{t('hostDialog.authTypes.privateKey')}</option>
                  <option value="agent">{t('hostDialog.authTypes.agent')}</option>
                </select>
              </label>
              <label>
                <span>{t('hostDialog.fields.port')}</span>
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
            </div>
            <label>
              <span>{t('hostDialog.fields.address')}</span>
              <input
                value={hostForm.address}
                onChange={(event) => onHostFormChange((current) => ({ ...current, address: event.target.value }))}
                placeholder="192.168.1.10"
              />
            </label>
            <label>
              <span>{t('hostDialog.fields.username')}</span>
              <input
                value={hostForm.username}
                onChange={(event) => onHostFormChange((current) => ({ ...current, username: event.target.value }))}
                placeholder="root"
              />
            </label>
            <label>
              <span>{t('hostDialog.fields.hostKeyPolicy')}</span>
              <select
                value={hostForm.hostKeyPolicy ?? 'accept-new'}
                onChange={(event) =>
                  onHostFormChange((current) => ({
                    ...current,
                    hostKeyPolicy: event.target.value as HostUpsertRequest['hostKeyPolicy'],
                  }))
                }
              >
                <option value="accept-new">{t('hostDialog.hostKeyPolicies.acceptNew')}</option>
                <option value="strict">{t('hostDialog.hostKeyPolicies.strict')}</option>
                <option value="off">{t('hostDialog.hostKeyPolicies.off')}</option>
              </select>
              <small>{t('hostDialog.hostKeyPolicyHint')}</small>
            </label>
          </>
        )}

        <label>
          <span>{t('hostDialog.fields.description')}</span>
          <input
            value={hostForm.description ?? ''}
            onChange={(event) => onHostFormChange((current) => ({ ...current, description: event.target.value }))}
            placeholder={t(isWSL ? 'hostDialog.placeholders.wslDescription' : 'hostDialog.placeholders.description')}
          />
        </label>

        {!isWSL && hostForm.authType === 'password' ? (
          <div className="secret-area">
            <label className="checkbox-row">
              <input checked={savePassword} onChange={(event) => onSavePasswordChange(event.target.checked)} type="checkbox" />
              <span>{t(hostDialogMode === 'edit' && savePassword ? 'hostDialog.password.keepOrUpdate' : 'hostDialog.password.save')}</span>
            </label>
            <label>
              <span>{t('hostDialog.fields.password')}</span>
              <input
                disabled={!savePassword}
                type="password"
                value={hostForm.password ?? ''}
                onChange={(event) => onHostFormChange((current) => ({ ...current, password: event.target.value }))}
                placeholder={t('hostDialog.placeholders.secret')}
              />
            </label>
          </div>
        ) : null}

        {!isWSL && hostForm.authType === 'privateKey' ? (
          <div className="secret-area">
            <label className="checkbox-row">
              <input checked={savePrivateKey} onChange={(event) => onSavePrivateKeyChange(event.target.checked)} type="checkbox" />
              <span>{t(hostDialogMode === 'edit' && savePrivateKey ? 'hostDialog.privateKey.keepOrUpdate' : 'hostDialog.privateKey.save')}</span>
            </label>
            <label>
              <span>{t('hostDialog.fields.privateKey')}</span>
              <div className="file-picker-row">
                <button
                  disabled={!savePrivateKey}
                  title={t('hostDialog.privateKey.selectFile')}
                  type="button"
                  onClick={() => privateKeyFileRef.current?.click()}
                >
                  {t('hostDialog.privateKey.selectFileButton')}
                </button>
                <small>{t(hostForm.privateKey ? 'hostDialog.privateKey.loaded' : 'hostDialog.privateKey.supportsLocal')}</small>
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
                placeholder={t('hostDialog.placeholders.secret')}
              />
            </label>
          </div>
        ) : null}

        <div className="modal-actions">
          <button disabled={isSavingHost} title={t('hostDialog.cancel')} type="button" onClick={onClose}>
            {t('app.cancel')}
          </button>
          <button className="primary-button" disabled={isSavingHost} title={t('hostDialog.submit')} type="submit">
            {isSavingHost ? t('hostDialog.saving') : t(hostDialogMode === 'edit' ? 'hostDialog.saveEdit' : 'hostDialog.saveCreate')}
          </button>
        </div>
      </form>
    </div>
  )
}
