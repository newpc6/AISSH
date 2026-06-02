import { useMemo, useRef, useState } from 'react'
import type { HostRecord } from '@ai-ssh/shared-contracts'

export function useBatchSelection(hosts: HostRecord[]) {
  const [batchSelectedHostIds, setBatchSelectedHostIds] = useState<string[]>([])
  const batchSelectedHostIdsRef = useRef<string[]>([])

  const batchSelectedHosts = useMemo(
    () =>
      batchSelectedHostIds.map((hostId) => {
        const host = hosts.find((item) => item.id === hostId)
        return { id: hostId, name: host?.name || hostId }
      }),
    [batchSelectedHostIds, hosts],
  )

  const setSelectedHostIds = (updater: string[] | ((current: string[]) => string[])) => {
    setBatchSelectedHostIds((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater
      batchSelectedHostIdsRef.current = next
      return next
    })
  }

  const toggleBatchHostSelection = (hostId: string) => {
    setSelectedHostIds((current) =>
      current.includes(hostId)
        ? current.filter((id) => id !== hostId)
        : [...current, hostId],
    )
  }

  const removeBatchSelectedHost = (hostId: string) => {
    setSelectedHostIds((current) => current.filter((id) => id !== hostId))
  }

  const clearBatchSelection = () => {
    setSelectedHostIds([])
  }

  return {
    batchSelectedHostIds,
    batchSelectedHostIdsRef,
    batchSelectedHosts,
    clearBatchSelection,
    removeBatchSelectedHost,
    setBatchSelectedHostIds: setSelectedHostIds,
    toggleBatchHostSelection,
  }
}
