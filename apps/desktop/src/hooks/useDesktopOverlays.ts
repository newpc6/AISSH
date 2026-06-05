import { useCallback } from 'react'
import type { TopMenu } from '../types'

type UseDesktopOverlaysArgs = {
  openHostGroupDialog: () => void
  setIsFeatureGuideOpen: React.Dispatch<React.SetStateAction<boolean>>
  setIsSettingsDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  setIsSkillDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  setIsModelDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  setOpenTopMenu: React.Dispatch<React.SetStateAction<TopMenu>>
  setSettingsSavedMessage: React.Dispatch<React.SetStateAction<string>>
}

export function useDesktopOverlays({
  openHostGroupDialog,
  setIsFeatureGuideOpen,
  setIsSettingsDialogOpen,
  setIsSkillDialogOpen,
  setIsModelDialogOpen,
  setOpenTopMenu,
  setSettingsSavedMessage,
}: UseDesktopOverlaysArgs) {
  const openSettingsDialog = useCallback(() => {
    setOpenTopMenu('')
    setSettingsSavedMessage('')
    setIsSettingsDialogOpen(true)
  }, [setIsSettingsDialogOpen, setOpenTopMenu, setSettingsSavedMessage])

  const openGroupDialog = useCallback(() => {
    setOpenTopMenu('')
    openHostGroupDialog()
  }, [openHostGroupDialog, setOpenTopMenu])

  const openFeatureGuide = useCallback(() => {
    setOpenTopMenu('')
    setIsFeatureGuideOpen(true)
  }, [setIsFeatureGuideOpen, setOpenTopMenu])

  const openSkillDialog = useCallback(() => {
    setOpenTopMenu('')
    setSettingsSavedMessage('')
    setIsSkillDialogOpen(true)
  }, [setIsSkillDialogOpen, setOpenTopMenu, setSettingsSavedMessage])

  const openModelDialog = useCallback(() => {
    setOpenTopMenu('')
    setSettingsSavedMessage('')
    setIsModelDialogOpen(true)
  }, [setIsModelDialogOpen, setOpenTopMenu, setSettingsSavedMessage])

  return {
    openFeatureGuide,
    openGroupDialog,
    openModelDialog,
    openSettingsDialog,
    openSkillDialog,
  }
}
