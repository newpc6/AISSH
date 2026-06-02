import { useMemo } from 'react'
import type { HostGroup, HostRecord } from '@ai-ssh/shared-contracts'
import type { HostGroupView } from '../types'
import { normalizeHostGroups } from '../utils'

export function useVisibleHostGroups(hostGroups: HostGroup[], hosts: HostRecord[], serverSearch: string) {
  const groupedHosts = useMemo<HostGroupView[]>(() => {
    const groups = normalizeHostGroups(hostGroups, hosts)
    const keyword = serverSearch.trim().toLowerCase()
    const matchesSearch = (host: HostRecord) => {
      if (!keyword) {
        return true
      }
      const haystack = [
        host.name,
        host.address,
        host.username,
        host.group || '默认',
        String(host.port),
      ]
        .join('\n')
        .toLowerCase()
      return haystack.includes(keyword)
    }
    return groups.map((group) => ({
      ...group,
      hosts: hosts.filter((host) => (host.group || '榛樿') === group.name).filter(matchesSearch),
    }))
  }, [hostGroups, hosts, serverSearch])

  const visibleHostCount = useMemo(
    () => groupedHosts.reduce((count, group) => count + group.hosts.length, 0),
    [groupedHosts],
  )

  const visibleHostGroups = useMemo(
    () => (serverSearch.trim() ? groupedHosts.filter((group) => group.hosts.length > 0) : groupedHosts),
    [groupedHosts, serverSearch],
  )

  return {
    groupedHosts,
    visibleHostCount,
    visibleHostGroups,
  }
}
