import { useCallback } from 'react'
import type { LogEntry, LogLevel, LogSettings, LogsResponse } from '@ai-ssh/shared-contracts'

type UseLogDialogArgs = {
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
  logHealthChecks: boolean
  logLevel: LogLevel
  setErrorMessage: (message: string) => void
  setIsLogDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  setLogHealthChecks: React.Dispatch<React.SetStateAction<boolean>>
  setLogLevel: React.Dispatch<React.SetStateAction<LogLevel>>
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>
  setOpenTopMenu: React.Dispatch<React.SetStateAction<'file' | 'edit' | 'session' | 'transfer' | 'tools' | 'settings' | ''>>
}

export function useLogDialog({
  apiFetch,
  logHealthChecks,
  logLevel,
  setErrorMessage,
  setIsLogDialogOpen,
  setLogHealthChecks,
  setLogLevel,
  setLogs,
  setOpenTopMenu,
}: UseLogDialogArgs) {
  const loadLogs = useCallback(async () => {
    const [logsResponse, settingsResponse] = await Promise.all([
      apiFetch('/logs?limit=200'),
      apiFetch('/logs/settings'),
    ])

    if (logsResponse.ok) {
      const data = (await logsResponse.json()) as LogsResponse
      setLogs((current) => [...current, ...data.logs].slice(-300))
    }
    if (settingsResponse.ok) {
      const settings = (await settingsResponse.json()) as LogSettings
      setLogLevel(settings.level)
      setLogHealthChecks(Boolean(settings.logHealthChecks))
    }
  }, [apiFetch, setLogHealthChecks, setLogLevel, setLogs])

  const openLogDialog = useCallback(() => {
    setOpenTopMenu('')
    setIsLogDialogOpen(true)
    void loadLogs()
  }, [loadLogs, setIsLogDialogOpen, setOpenTopMenu])

  const updateLogSettings = useCallback(async (nextSettings: Partial<LogSettings>) => {
    const payload: LogSettings = {
      level: nextSettings.level ?? logLevel,
      logHealthChecks: nextSettings.logHealthChecks ?? logHealthChecks,
    }
    setLogLevel(payload.level)
    setLogHealthChecks(payload.logHealthChecks)
    const response = await apiFetch('/logs/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      setErrorMessage(`设置日志参数失败：${response.status}`)
      await loadLogs()
      return
    }
    await loadLogs()
  }, [apiFetch, loadLogs, logHealthChecks, logLevel, setErrorMessage, setLogHealthChecks, setLogLevel])

  return {
    loadLogs,
    openLogDialog,
    updateLogSettings,
  }
}
