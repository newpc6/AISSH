import { useMemo } from 'react'
import type { LogEntry, LogLevel } from '@ai-ssh/shared-contracts'
import { isVisibleLogLevel } from '../utils'

export function useVisibleLogs(logs: LogEntry[], logLevel: LogLevel, logSearch: string) {
  return useMemo(() => {
    const keyword = logSearch.trim().toLowerCase()
    return logs.filter((entry) => {
      if (!isVisibleLogLevel(entry.level, logLevel)) {
        return false
      }
      if (!keyword) {
        return true
      }
      const haystack = [
        entry.level,
        entry.source,
        entry.message,
        entry.timestamp,
        entry.fields ? JSON.stringify(entry.fields) : '',
      ]
        .join('\n')
        .toLowerCase()
      return haystack.includes(keyword)
    })
  }, [logs, logLevel, logSearch])
}
