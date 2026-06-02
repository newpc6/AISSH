import { useCallback, useMemo } from 'react'
import type { HostGroup, HostRecord } from '@ai-ssh/shared-contracts'
import type { ConfirmDialogState } from '../types'
import { normalizeHostGroups } from '../utils'

type UseHostGroupDialogArgs = {
  deletedGroupDrafts: string[]
  groupDrafts: string[]
  hostGroups: HostGroup[]
  hosts: HostRecord[]
  onRequestConfirm: (dialog: NonNullable<ConfirmDialogState>) => void
  originalGroupDrafts: string[]
  setDeletedGroupDrafts: React.Dispatch<React.SetStateAction<string[]>>
  setGroupDialogError: React.Dispatch<React.SetStateAction<string>>
  setGroupDialogMessage: React.Dispatch<React.SetStateAction<string>>
  setGroupDrafts: React.Dispatch<React.SetStateAction<string[]>>
  setIsGroupDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  setOriginalGroupDrafts: React.Dispatch<React.SetStateAction<string[]>>
}

export function useHostGroupDialog({
  deletedGroupDrafts,
  groupDrafts,
  hostGroups,
  hosts,
  onRequestConfirm,
  originalGroupDrafts,
  setDeletedGroupDrafts,
  setGroupDialogError,
  setGroupDialogMessage,
  setGroupDrafts,
  setIsGroupDialogOpen,
  setOriginalGroupDrafts,
}: UseHostGroupDialogArgs) {
  const groupDraftUsedCounts = useMemo(
    () =>
      groupDrafts.map((group, index) => {
        const groupName = group.trim()
        const originalName = originalGroupDrafts[index]?.trim()
        return hosts.filter((host) => (host.group || '默认') === (originalName || groupName)).length
      }),
    [groupDrafts, hosts, originalGroupDrafts],
  )

  const openGroupDialog = useCallback(() => {
    const groups = normalizeHostGroups(hostGroups, hosts)
    const names = groups.map((group) => group.name)
    setGroupDrafts(names)
    setOriginalGroupDrafts(names)
    setDeletedGroupDrafts([])
    setGroupDialogMessage('')
    setGroupDialogError('')
    setIsGroupDialogOpen(true)
  }, [
    hostGroups,
    hosts,
    setDeletedGroupDrafts,
    setGroupDialogError,
    setGroupDialogMessage,
    setGroupDrafts,
    setIsGroupDialogOpen,
    setOriginalGroupDrafts,
  ])

  const closeGroupDialog = useCallback(() => {
    setIsGroupDialogOpen(false)
  }, [setIsGroupDialogOpen])

  const clearGroupDialogMessage = useCallback(() => {
    setGroupDialogMessage('')
  }, [setGroupDialogMessage])

  const addGroupDraft = useCallback(() => {
    setGroupDrafts((current) => [...current, '新分组'])
    setOriginalGroupDrafts((current) => [...current, ''])
    setGroupDialogMessage('')
  }, [setGroupDialogMessage, setGroupDrafts, setOriginalGroupDrafts])

  const moveGroupDraft = useCallback((index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    setGroupDrafts((current) => {
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current
      }
      const next = [...current]
      ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
      return next
    })
    setOriginalGroupDrafts((current) => {
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current
      }
      const next = [...current]
      ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
      return next
    })
    setGroupDialogMessage('')
  }, [setGroupDialogMessage, setGroupDrafts, setOriginalGroupDrafts])

  const confirmDeleteGroupDraft = useCallback(
    (index: number, group: string) => {
      const name = group.trim() || '未命名分组'
      const originalName = originalGroupDrafts[index]?.trim()
      const usedCount = hosts.filter((host) => (host.group || '默认') === (originalName || name)).length
      onRequestConfirm({
        section: 'SSH 分组',
        title: '删除分组',
        message: `确定删除分组「${name}」吗？`,
        detail:
          usedCount > 0
            ? `保存后该分组下的 ${usedCount} 台服务器会移动到默认分组。`
            : '保存后会从分组配置中移除。',
        confirmText: '删除',
        danger: true,
        onConfirm: () => {
          if (originalName) {
            setDeletedGroupDrafts((current) => [...new Set([...current, originalName])])
          }
          setGroupDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))
          setOriginalGroupDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))
          setGroupDialogMessage('')
        },
      })
    },
    [hosts, onRequestConfirm, originalGroupDrafts, setDeletedGroupDrafts, setGroupDialogMessage, setGroupDrafts, setOriginalGroupDrafts],
  )

  const syncSavedGroups = useCallback((nextGroups: HostGroup[]) => {
    const nextGroupNames = nextGroups.map((group) => group.name)
    setOriginalGroupDrafts(nextGroupNames)
    setGroupDrafts(nextGroupNames)
    setDeletedGroupDrafts([])
    setGroupDialogError('')
    setGroupDialogMessage('分组已保存')
  }, [setDeletedGroupDrafts, setGroupDialogError, setGroupDialogMessage, setGroupDrafts, setOriginalGroupDrafts])

  return {
    addGroupDraft,
    clearGroupDialogMessage,
    closeGroupDialog,
    confirmDeleteGroupDraft,
    deletedGroupDrafts,
    groupDraftUsedCounts,
    moveGroupDraft,
    openGroupDialog,
    syncSavedGroups,
  }
}
