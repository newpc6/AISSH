import { useCallback, useState } from 'react'
import type { ConfirmDialogState } from '../types'

export function useConfirmDialog() {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null)

  const requestConfirm = useCallback((dialog: NonNullable<ConfirmDialogState>) => {
    setConfirmDialog(dialog)
  }, [])

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog(null)
  }, [])

  const confirmAndRun = useCallback(() => {
    if (!confirmDialog) {
      return
    }
    const action = confirmDialog.onConfirm
    setConfirmDialog(null)
    void action()
  }, [confirmDialog])

  return {
    closeConfirmDialog,
    confirmAndRun,
    confirmDialog,
    requestConfirm,
    setConfirmDialog,
  }
}
