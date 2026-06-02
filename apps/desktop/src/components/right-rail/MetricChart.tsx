import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { MetricChartKey, MetricSample } from '../../types'
import {
  buildMetricPath,
  formatBytes,
  formatMemorySummary,
  formatMetricDateTime,
  metricPointIndexes,
  metricXAxisLabels,
} from '../../utils'
import type { ServerMetrics } from '@ai-ssh/shared-contracts'

type MetricHoverState = {
  index: number
  x: number
  y: number
} | null

type MetricChartProps = {
  compact?: boolean
  expandedPointLimit: number
  keyName: MetricChartKey
  label: string
  metricHistory: MetricSample[]
  serverMetrics: ServerMetrics | null
  compactWidth: number
  compactPointLimit: number
  onExpand?: (key: MetricChartKey) => void
}

export function MetricChart({
  compact = true,
  compactPointLimit,
  compactWidth,
  expandedPointLimit,
  keyName,
  label,
  metricHistory,
  onExpand,
  serverMetrics,
}: MetricChartProps) {
  const [hover, setHover] = useState<MetricHoverState>(null)
  const width = compact ? compactWidth : 760
  const height = compact ? 88 : 320
  const chartWidth = width - 48
  const chartHeight = height - 28
  const path = buildMetricPath(metricHistory, keyName, chartWidth, chartHeight)
  const [startLabel, endLabel] = metricXAxisLabels(metricHistory)
  const latestValue = metricHistory[metricHistory.length - 1]?.[keyName] ?? serverMetrics?.[keyName] ?? 0
  const visiblePointIndexes = metricPointIndexes(
    metricHistory.length,
    compact ? compactPointLimit : expandedPointLimit,
  )
  const hoveredSample = hover && metricHistory[hover.index] ? metricHistory[hover.index] : null
  const chartTitle =
    keyName === 'memoryPercent' ? formatMemorySummary(serverMetrics) : serverMetrics ? `${latestValue}%` : '-'

  const updateHover = (event: MouseEvent<SVGRectElement>) => {
    if (metricHistory.length === 0) {
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const relativeX = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left))
    const index =
      metricHistory.length === 1 ? 0 : Math.round((relativeX / Math.max(1, bounds.width)) * (metricHistory.length - 1))
    const sample = metricHistory[index]
    const x = metricHistory.length === 1 ? chartWidth : (index / (metricHistory.length - 1)) * chartWidth
    const y = chartHeight - (Math.max(0, Math.min(100, sample[keyName])) / 100) * chartHeight
    setHover({ index, x, y })
  }

  return (
    <div className={`metric-chart ${compact ? 'compact' : 'expanded'}`} onMouseLeave={() => setHover(null)}>
      <div className="metric-chart-top">
        <span>{label}</span>
        <strong>{chartTitle}</strong>
      </div>
      <div className="metric-plot">
        {compact ? (
          <button
            aria-label={`放大${label}趋势图`}
            className="metric-zoom"
            title={`放大${label}趋势图`}
            type="button"
            onClick={() => onExpand?.(keyName)}
          >
            <span />
          </button>
        ) : null}
        <svg style={{ aspectRatio: `${width} / ${height}` }} viewBox={`0 0 ${width} ${height}`}>
          <g transform="translate(36 8)">
            <line className="axis-line" x1="0" x2="0" y1="0" y2={chartHeight} />
            <line className="axis-line" x1="0" x2={chartWidth} y1={chartHeight} y2={chartHeight} />
            {[0, 50, 100].map((value) => {
              const y = chartHeight - (value / 100) * chartHeight
              return (
                <g key={value}>
                  <line className="grid-line" x1="0" x2={chartWidth} y1={y} y2={y} />
                  <text x="-8" y={y + 3} textAnchor="end">
                    {value}%
                  </text>
                </g>
              )
            })}
            <rect
              className="metric-hover-zone"
              height={chartHeight}
              width={chartWidth}
              x="0"
              y="0"
              onMouseEnter={updateHover}
              onMouseMove={updateHover}
            />
            {path ? <path className="metric-line" d={path} /> : null}
            {metricHistory.map((sample, index) => {
              const x = metricHistory.length === 1 ? chartWidth : (index / (metricHistory.length - 1)) * chartWidth
              const y = chartHeight - (Math.max(0, Math.min(100, sample[keyName])) / 100) * chartHeight
              const isHovered = hover?.index === index
              if (!visiblePointIndexes.has(index) && !isHovered) {
                return null
              }
              return (
                <circle
                  aria-label={`${label} ${formatMetricDateTime(sample.collectedAt)} ${sample[keyName]}%`}
                  className={`metric-point ${isHovered ? 'active' : ''}`}
                  cx={x}
                  cy={y}
                  key={`${sample.collectedAt}-${index}`}
                  r={isHovered ? 4.5 : 3}
                >
                  <title>
                    {`${formatMetricDateTime(sample.collectedAt)} · ${label} ${sample[keyName]}%${
                      keyName === 'memoryPercent' && sample.memoryTotalBytes > 0
                        ? ` · ${formatBytes(sample.memoryUsedBytes)} / ${formatBytes(sample.memoryTotalBytes)}`
                        : ''
                    }`}
                  </title>
                </circle>
              )
            })}
            {metricHistory.length === 0 ? (
              <text className="empty-chart-text" x={chartWidth / 2} y={chartHeight / 2} textAnchor="middle">
                等待采样
              </text>
            ) : null}
          </g>
          <text x="36" y={height - 4}>
            {startLabel}
          </text>
          <text x={width - 2} y={height - 4} textAnchor="end">
            {endLabel}
          </text>
        </svg>
        {hoveredSample ? (
          <div
            className="metric-tooltip"
            style={{
              left: `${36 + hover!.x}px`,
              top: `${8 + hover!.y}px`,
            }}
          >
            <strong>{`${label} ${hoveredSample[keyName]}%`}</strong>
            <span>{formatMetricDateTime(hoveredSample.collectedAt)}</span>
            {keyName === 'memoryPercent' && hoveredSample.memoryTotalBytes > 0 ? (
              <small>
                {formatBytes(hoveredSample.memoryUsedBytes)} / {formatBytes(hoveredSample.memoryTotalBytes)}
              </small>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
