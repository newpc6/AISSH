import { useCallback } from 'react'
import type { HostRecord, HostUpsertRequest } from '@ai-ssh/shared-contracts'
import type { HostDialogMode } from '../types'
import { emptyHostForm } from '../utils'

type UseHostDialogStateArgs = {
  defaultGroupName: string
  duplicateSuffix: string
  setEditingHostId: React.Dispatch<React.SetStateAction<string>>
  setHostDialogError: React.Dispatch<React.SetStateAction<string>>
  setHostDialogMode: React.Dispatch<React.SetStateAction<HostDialogMode>>
  setHostForm: React.Dispatch<React.SetStateAction<HostUpsertRequest>>
  setIsHostDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  setOpenHostMenuId: React.Dispatch<React.SetStateAction<string>>
  setSavePassword: React.Dispatch<React.SetStateAction<boolean>>
  setSavePrivateKey: React.Dispatch<React.SetStateAction<boolean>>
}

export function useHostDialogState({
  defaultGroupName,
  duplicateSuffix,
  setEditingHostId,
  setHostDialogError,
  setHostDialogMode,
  setHostForm,
  setIsHostDialogOpen,
  setOpenHostMenuId,
  setSavePassword,
  setSavePrivateKey,
}: UseHostDialogStateArgs) {
  const resetHostForm = useCallback(() => {
    setHostForm(emptyHostForm)
    setSavePassword(false)
    setSavePrivateKey(false)
    setHostDialogError('')
    setHostDialogMode('create')
    setEditingHostId('')
  }, [setEditingHostId, setHostDialogError, setHostDialogMode, setHostForm, setSavePassword, setSavePrivateKey])

  const openAddHostDialog = useCallback(() => {
    resetHostForm()
    setHostForm((current) => ({ ...current, group: defaultGroupName }))
    setIsHostDialogOpen(true)
  }, [defaultGroupName, resetHostForm, setHostForm, setIsHostDialogOpen])

  const openEditHostDialog = useCallback((host: HostRecord) => {
    setHostDialogMode('edit')
    setEditingHostId(host.id)
    setHostForm({
      name: host.name,
      protocol: host.protocol ?? 'ssh',
      address: host.address,
      port: host.port,
      username: host.username,
      authType: host.authType,
      hostKeyPolicy: host.hostKeyPolicy ?? 'accept-new',
      group: host.group ?? defaultGroupName,
      description: host.description ?? '',
      password: '',
      privateKey: '',
      wslDistro: host.wslDistro ?? '',
    })
    setSavePassword(Boolean(host.hasPassword))
    setSavePrivateKey(Boolean(host.hasPrivateKey))
    setHostDialogError('')
    setOpenHostMenuId('')
    setIsHostDialogOpen(true)
  }, [
    defaultGroupName,
    setEditingHostId,
    setHostDialogError,
    setHostDialogMode,
    setHostForm,
    setIsHostDialogOpen,
    setOpenHostMenuId,
    setSavePassword,
    setSavePrivateKey,
  ])

  const closeHostDialog = useCallback(() => {
    setIsHostDialogOpen(false)
    resetHostForm()
  }, [resetHostForm, setIsHostDialogOpen])

  const duplicateHost = useCallback((host: HostRecord) => {
    setOpenHostMenuId('')
    setHostDialogMode('create')
    setEditingHostId('')
    setHostForm({
      name: `${host.name} ${duplicateSuffix}`,
      protocol: host.protocol ?? 'ssh',
      address: host.address,
      port: host.port,
      username: host.username,
      authType: host.authType,
      hostKeyPolicy: host.hostKeyPolicy ?? 'accept-new',
      group: host.group ?? defaultGroupName,
      description: host.description ?? '',
      password: '',
      privateKey: '',
      wslDistro: host.wslDistro ?? '',
    })
    setSavePassword(false)
    setSavePrivateKey(false)
    setHostDialogError('')
    setIsHostDialogOpen(true)
  }, [
    defaultGroupName,
    duplicateSuffix,
    setEditingHostId,
    setHostDialogError,
    setHostDialogMode,
    setHostForm,
    setIsHostDialogOpen,
    setOpenHostMenuId,
    setSavePassword,
    setSavePrivateKey,
  ])

  return {
    closeHostDialog,
    duplicateHost,
    openAddHostDialog,
    openEditHostDialog,
    resetHostForm,
  }
}
