import type { KeyboardEvent } from 'react'
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
        <strong>服务器</strong>
        <div className="toolbar-actions">
          <button type="button" title="折叠左侧面板" onClick={onCollapse}>
            ◁
          </button>
          <div className="toolbar-segment toolbar-mode-group">
            <button
              type="button"
              className={batchMode ? 'batch-mode-active' : ''}
              title="批量任务模式"
              onClick={onToggleBatchMode}
            >
              批量
            </button>
          </div>
          <div className="toolbar-segment toolbar-action-group">
            <button type="button" title="新增 SSH 连接" onClick={onOpenAddHostDialog}>
              +
            </button>
            <button type="button" title="管理 SSH 分组" onClick={onOpenGroupDialog}>
              分组
            </button>
            <button type="button" title="导出服务器列表" onClick={() => void onExportHosts(false)}>
              ⇅
            </button>
          </div>
        </div>
      </div>
      <label className="server-search">
        <span>搜索服务器</span>
        <input
          type="search"
          value={serverSearch}
          placeholder="名称、IP、端口"
          onChange={(event) => onServerSearchChange(event.target.value)}
        />
      </label>

      <div className="server-groups">
        {visibleHostCount === 0 ? (
          <p className="server-search-empty">
            {serverSearch.trim() ? '没有匹配的服务器' : '暂无服务器'}
          </p>
        ) : null}
        {visibleHostGroups.map((group) => (
          <section className="server-group" key={group.name}>
            <p>{group.name}<span>{group.hosts.length}</span></p>
            {group.hosts.length === 0 ? <small className="empty-group-text">空分组</small> : null}
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
                  <label className="batch-checkbox" onClick={(event) => event.stopPropagation()} title="勾选批量执行">
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
                        title="上移"
                        aria-label={`${host.name} 上移`}
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
                        title="下移"
                        aria-label={`${host.name} 下移`}
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
                    aria-label={`${host.name} 菜单`}
                    className="host-menu-trigger"
                    title={`${host.name} 更多操作`}
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
                    <button type="button" title="编辑服务器配置" onClick={() => onOpenEditHostDialog(host)}>编辑</button>
                    <button type="button" title="连接此服务器" onClick={() => void onCreateSession(host.id)}>连接</button>
                    <button type="button" title="复制一份服务器配置" onClick={() => void onDuplicateHost(host)}>复制配置</button>
                    <button className="danger-item" type="button" title="删除此服务器" onClick={() => onConfirmDeleteHost(host)}>
                      删除
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
