import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { HostRecord } from '@ai-ssh/shared-contracts'
import type { HostGroupView } from '../../types'

type ServersPanelProps = {
  batchMode: boolean
  batchSelectedHostIds: string[]
  openHostMenuId: string
  selectedHostId: string
  serverSearch: string
  visibleHostCount: number
  visibleHostGroups: HostGroupView[]
  onCollapse: () => void
  onConfirmDeleteHost: (host: HostRecord) => void
  onCreateSession: (hostId?: string) => void | Promise<void>
  onDuplicateHost: (host: HostRecord) => void | Promise<void>
  onExportHosts: (includeSecrets: boolean) => void | Promise<void>
  onMoveHost: (hostId: string, direction: 'up' | 'down') => void | Promise<void>
  onOpenAddHostDialog: () => void
  onOpenEditHostDialog: (host: HostRecord) => void
  onOpenGroupDialog: () => void
  onOpenHostMenuChange: (hostId: string) => void
  onSelectHost: (hostId: string) => void
  onServerSearchChange: (value: string) => void
  onToggleBatchHost: (hostId: string) => void
  onToggleBatchMode: () => void
}

export function ServersPanel({
  batchMode,
  batchSelectedHostIds,
  openHostMenuId,
  selectedHostId,
  serverSearch,
  visibleHostCount,
  visibleHostGroups,
  onCollapse,
  onConfirmDeleteHost,
  onCreateSession,
  onDuplicateHost,
  onExportHosts,
  onMoveHost,
  onOpenAddHostDialog,
  onOpenEditHostDialog,
  onOpenGroupDialog,
  onOpenHostMenuChange,
  onSelectHost,
  onServerSearchChange,
  onToggleBatchHost,
  onToggleBatchMode,
}: ServersPanelProps) {
  const { t } = useTranslation()

  const handleHostKeyDown = (event: KeyboardEvent<HTMLDivElement>, hostId: string) => {
    if (event.key === 'Enter') {
      void onCreateSession(hostId)
    }
  }

  const showMoveButtons = !batchMode && !serverSearch.trim()
  const flatHostIds = showMoveButtons
    ? visibleHostGroups.flatMap((group) => group.hosts.map((host) => host.id))
    : []

  return (
    <div className="left-content">
      <div className="panel-toolbar">
        <strong>{t('servers.title')}</strong>
        <div className="toolbar-actions">
          <button type="button" title={t('serversPanel.collapse')} onClick={onCollapse}>
            ◀
          </button>
          <div className="toolbar-segment toolbar-mode-group">
            <button
              type="button"
              className={batchMode ? 'batch-mode-active' : ''}
              title={t('serversPanel.batchMode')}
              onClick={onToggleBatchMode}
            >
              {t('serversPanel.batch')}
            </button>
          </div>
          <div className="toolbar-segment toolbar-action-group">
            <button type="button" title={t('serversPanel.addConnection')} onClick={onOpenAddHostDialog}>
              +
            </button>
            <button type="button" title={t('serversPanel.manageGroups')} onClick={onOpenGroupDialog}>
              {t('servers.groups')}
            </button>
            <button type="button" title={t('serversPanel.exportHosts')} onClick={() => void onExportHosts(false)}>
              ⇩
            </button>
          </div>
        </div>
      </div>
      <label className="server-search">
        <span>{t('serversPanel.search')}</span>
        <input
          type="search"
          value={serverSearch}
          placeholder={t('serversPanel.searchPlaceholder')}
          onChange={(event) => onServerSearchChange(event.target.value)}
        />
      </label>

      <div className="server-groups">
        {visibleHostCount === 0 ? (
          <p className="server-search-empty">
            {serverSearch.trim() ? t('serversPanel.noMatch') : t('serversPanel.empty')}
          </p>
        ) : null}
        {visibleHostGroups.map((group) => (
          <section className="server-group" key={group.name}>
            <p>{group.name}<span>{group.hosts.length}</span></p>
            {group.hosts.length === 0 ? <small className="empty-group-text">{t('serversPanel.emptyGroup')}</small> : null}
            {group.hosts.map((host) => (
              <div
                key={host.id}
                className={`server-row ${batchMode ? 'batch-mode-row' : ''} ${selectedHostId === host.id ? 'selected' : ''} ${batchSelectedHostIds.includes(host.id) ? 'batch-checked' : ''} ${openHostMenuId === host.id ? 'menu-open' : ''}`}
                onClick={() => onSelectHost(host.id)}
                onDoubleClick={() => void onCreateSession(host.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => handleHostKeyDown(event, host.id)}
              >
                {batchMode ? (
                  <label className="batch-checkbox" onClick={(event) => event.stopPropagation()} title={t('serversPanel.selectBatch')}>
                    <input
                      type="checkbox"
                      checked={batchSelectedHostIds.includes(host.id)}
                      onChange={() => onToggleBatchHost(host.id)}
                    />
                  </label>
                ) : null}
                <div className="server-row-main">
                  <span>{host.name}</span>
                  <small>
                    {host.username}@{host.address}:{host.port}
                  </small>
                </div>
                <div className="host-row-actions">
                  {showMoveButtons ? (
                    <>
                      <button
                        className="host-move-btn"
                        type="button"
                        disabled={flatHostIds.indexOf(host.id) <= 0}
                        title={t('servers.moveUp')}
                        aria-label={t('serversPanel.moveUpHost', { name: host.name })}
                        onClick={(event) => {
                          event.stopPropagation()
                          void onMoveHost(host.id, 'up')
                        }}
                      >
                        ▲
                      </button>
                      <button
                        className="host-move-btn"
                        type="button"
                        disabled={flatHostIds.indexOf(host.id) >= flatHostIds.length - 1}
                        title={t('servers.moveDown')}
                        aria-label={t('serversPanel.moveDownHost', { name: host.name })}
                        onClick={(event) => {
                          event.stopPropagation()
                          void onMoveHost(host.id, 'down')
                        }}
                      >
                        ▼
                      </button>
                    </>
                  ) : null}
                  <button
                    aria-label={t('serversPanel.hostMenu', { name: host.name })}
                    className="host-menu-trigger"
                    title={t('serversPanel.hostActions', { name: host.name })}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenHostMenuChange(openHostMenuId === host.id ? '' : host.id)
                    }}
                  >
                    ⋯
                  </button>
                </div>
                {openHostMenuId === host.id ? (
                  <div className="host-menu" onClick={(event) => event.stopPropagation()}>
                    <button type="button" title={t('serversPanel.editServer')} onClick={() => onOpenEditHostDialog(host)}>{t('app.edit')}</button>
                    <button type="button" title={t('serversPanel.connectServer')} onClick={() => void onCreateSession(host.id)}>{t('servers.connect')}</button>
                    <button type="button" title={t('serversPanel.duplicateServer')} onClick={() => void onDuplicateHost(host)}>{t('serversPanel.duplicate')}</button>
                    <button className="danger-item" type="button" title={t('serversPanel.deleteServer')} onClick={() => onConfirmDeleteHost(host)}>
                      {t('app.delete')}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
