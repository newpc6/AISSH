import type { HostRecord, ServerMetrics, SessionRecord, SystemInfo } from '@ai-ssh/shared-contracts'
import type { MetricChartKey, MetricSample } from '../../types'
import { formatBytes, formatRate } from '../../utils'
import { MetricChart } from './MetricChart'

type ServerInfoPanelProps = {
  activeHost: HostRecord | null
  activeSession: SessionRecord | null
  compactMetricWidth: number
  expandedMetricPointLimit: number
  isCollapsed: boolean
  latestMetricSample: MetricSample | null
  metricHistory: MetricSample[]
  metricCompactPointLimit: number
  onExpandMetric: (key: MetricChartKey) => void
  onToggleCollapsed: () => void
  primaryDisk: ServerMetrics['disks'][number] | null
  serverMetrics: ServerMetrics | null
  systemInfo: SystemInfo | null
  height?: number
}

export function ServerInfoPanel({
  activeHost,
  activeSession,
  compactMetricWidth,
  expandedMetricPointLimit,
  height,
  isCollapsed,
  latestMetricSample,
  metricCompactPointLimit,
  metricHistory,
  onExpandMetric,
  primaryDisk,
  serverMetrics,
  systemInfo,
  onToggleCollapsed,
}: ServerInfoPanelProps) {
  const displayHostName = activeSession?.hostName ?? activeHost?.name ?? '未连接'
  const displayAddress = activeHost ? `${activeHost.address}:${activeHost.port}` : '-'
  const displayUsername = activeHost?.username ?? '-'

  return (
    <section
      className={`info-panel ${isCollapsed ? 'collapsed' : ''}`}
      style={!isCollapsed && height ? { height } : undefined}
    >
      <div className="info-panel-header">
        <div>
          <p className="section-label">当前服务器</p>
          <h3>{displayHostName}</h3>
        </div>
        <button
          className="panel-icon-button"
          type="button"
          title={isCollapsed ? '展开当前服务器信息' : '折叠当前服务器信息'}
          onClick={onToggleCollapsed}
        >
          {isCollapsed ? '▾' : '▴'}
        </button>
      </div>
      {!isCollapsed ? (
        <>
          <dl>
            <div>
              <dt>地址</dt>
              <dd>{displayAddress}</dd>
            </div>
            <div>
              <dt>用户</dt>
              <dd>{displayUsername}</dd>
            </div>
          </dl>
          {activeSession && systemInfo ? (
            <div className="system-info-card">
              <div className="system-info-row">
                <span>系统</span>
                <strong>{systemInfo.os || '-'}</strong>
              </div>
              <div className="system-info-row">
                <span>内核</span>
                <strong>{systemInfo.kernel || '-'}</strong>
              </div>
              <div className="system-info-row">
                <span>主机名</span>
                <strong>{systemInfo.hostname || '-'}</strong>
              </div>
              <div className="system-info-row">
                <span>架构</span>
                <strong>{systemInfo.arch || '-'}</strong>
              </div>
              <div className="system-info-row">
                <span>运行时长</span>
                <strong>{systemInfo.uptime || '-'}</strong>
              </div>
            </div>
          ) : null}
          <div className="metric-stack">
            <div className="metric-card">
              <MetricChart
                compact
                compactPointLimit={metricCompactPointLimit}
                compactWidth={compactMetricWidth}
                expandedPointLimit={expandedMetricPointLimit}
                keyName="cpuPercent"
                label="CPU"
                metricHistory={metricHistory}
                serverMetrics={serverMetrics}
                onExpand={onExpandMetric}
              />
            </div>
            <div className="metric-card">
              <MetricChart
                compact
                compactPointLimit={metricCompactPointLimit}
                compactWidth={compactMetricWidth}
                expandedPointLimit={expandedMetricPointLimit}
                keyName="memoryPercent"
                label="内存"
                metricHistory={metricHistory}
                serverMetrics={serverMetrics}
                onExpand={onExpandMetric}
              />
            </div>
            <div className="metric-card">
              <div>
                <span>磁盘</span>
                <strong>{primaryDisk ? `${primaryDisk.mount} ${primaryDisk.usedPercent}%` : serverMetrics ? `${serverMetrics.diskPercent}%` : '-'}</strong>
              </div>
              <div className="disk-list">
                {(serverMetrics?.disks?.length ? serverMetrics.disks : []).slice(0, 4).map((disk) => (
                  <div key={`${disk.filesystem}-${disk.mount}`}>
                    <span>{disk.mount}</span>
                    <progress max="100" value={disk.usedPercent} />
                    <strong>{disk.usedPercent}%</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="metric-card">
              <div>
                <span>网络</span>
                <strong>
                  {latestMetricSample
                    ? `↓ ${formatRate(latestMetricSample.networkRxRateBytes)} / ↑ ${formatRate(latestMetricSample.networkTxRateBytes)}`
                    : '-'}
                </strong>
              </div>
              <small>
                {serverMetrics
                  ? `累计 ↓ ${formatBytes(serverMetrics.networkRxBytes)} / ↑ ${formatBytes(serverMetrics.networkTxBytes)}`
                  : '等待采样'}
              </small>
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}
