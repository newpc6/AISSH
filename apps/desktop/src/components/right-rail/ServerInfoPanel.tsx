import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const isConnected = Boolean(activeSession)
  const displayHostName = activeSession?.hostName ?? activeHost?.name ?? t('serverInfo.disconnected')
  const displayAddress = activeHost ? `${activeHost.address}:${activeHost.port}` : '-'
  const displayUsername = activeHost?.username ?? '-'
  const sectionLabel = isConnected ? t('serverInfo.currentSession') : t('serverInfo.selectedServer')

  return (
    <section
      className={`info-panel ${isCollapsed ? 'collapsed' : ''} ${isConnected ? '' : 'info-panel-idle'}`}
      style={!isCollapsed && height ? { height } : undefined}
    >
      <div className="info-panel-header">
        <div>
          <p className="section-label">{sectionLabel}</p>
          <h3>{displayHostName}</h3>
        </div>
        <button
          className="panel-icon-button"
          type="button"
          title={isCollapsed ? t('serverInfo.expand') : t('serverInfo.collapse')}
          onClick={onToggleCollapsed}
        >
          {isCollapsed ? '▴' : '▾'}
        </button>
      </div>
      {!isCollapsed ? (
        <>
          <dl>
            <div>
              <dt>{t('serverInfo.address')}</dt>
              <dd>{displayAddress}</dd>
            </div>
            <div>
              <dt>{t('serverInfo.user')}</dt>
              <dd>{displayUsername}</dd>
            </div>
          </dl>
          {activeSession && systemInfo ? (
            <div className="system-info-card">
              <div className="system-info-row">
                <span>{t('serverInfo.system')}</span>
                <strong>{systemInfo.os || '-'}</strong>
              </div>
              <div className="system-info-row">
                <span>{t('serverInfo.kernel')}</span>
                <strong>{systemInfo.kernel || '-'}</strong>
              </div>
              <div className="system-info-row">
                <span>{t('serverInfo.hostname')}</span>
                <strong>{systemInfo.hostname || '-'}</strong>
              </div>
              <div className="system-info-row">
                <span>{t('serverInfo.arch')}</span>
                <strong>{systemInfo.arch || '-'}</strong>
              </div>
              <div className="system-info-row">
                <span>{t('serverInfo.uptime')}</span>
                <strong>{systemInfo.uptime || '-'}</strong>
              </div>
            </div>
          ) : (
            <div className="info-panel-idle-note">
              <strong>{t('serverInfo.selectedServerStrong')}</strong>
              <span>{t('serverInfo.idleHint')}</span>
            </div>
          )}
          {activeSession ? (
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
                  label={t('serverInfo.memory')}
                  metricHistory={metricHistory}
                  serverMetrics={serverMetrics}
                  onExpand={onExpandMetric}
                />
              </div>
              <div className="metric-card">
                <div>
                  <span>{t('serverInfo.disk')}</span>
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
                  <span>{t('serverInfo.network')}</span>
                  <strong>
                    {latestMetricSample
                      ? t('serverInfo.networkRate', {
                          rx: formatRate(latestMetricSample.networkRxRateBytes),
                          tx: formatRate(latestMetricSample.networkTxRateBytes),
                        })
                      : '-'}
                  </strong>
                </div>
                <small>
                  {serverMetrics
                    ? t('serverInfo.networkTotal', {
                        rx: formatBytes(serverMetrics.networkRxBytes),
                        tx: formatBytes(serverMetrics.networkTxBytes),
                      })
                    : t('serverInfo.waitingSample')}
                </small>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
