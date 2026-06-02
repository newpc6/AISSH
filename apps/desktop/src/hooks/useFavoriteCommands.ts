import { useCallback, useState } from 'react'
import type { ConfirmDialogState } from '../types'
import { normalizeFavoriteCommands, stripTerminalControlSequences } from '../utils'

type UseFavoriteCommandsArgs = {
  initialCommands: string[]
  onPersist: (commands: string[]) => void
  onRequestConfirm: (dialog: NonNullable<ConfirmDialogState>) => void
}

export function useFavoriteCommands({
  initialCommands,
  onPersist,
  onRequestConfirm,
}: UseFavoriteCommandsArgs) {
  const [favoriteCommands, setFavoriteCommands] = useState<string[]>(initialCommands)
  const [favoriteCommandDraft, setFavoriteCommandDraft] = useState('')

  const persistFavoriteCommands = useCallback((commands: string[]) => {
    const normalized = normalizeFavoriteCommands(commands)
    setFavoriteCommands(normalized)
    onPersist(normalized)
  }, [onPersist])

  const deleteFavoriteCommand = useCallback((command: string) => {
    const normalized = stripTerminalControlSequences(command).trim()
    if (!normalized) {
      return
    }
    persistFavoriteCommands(favoriteCommands.filter((item) => item !== normalized))
  }, [favoriteCommands, persistFavoriteCommands])

  const confirmDeleteFavoriteCommand = useCallback((command: string) => {
    const normalized = stripTerminalControlSequences(command).trim()
    if (!normalized) {
      return
    }
    onRequestConfirm({
      section: '收藏命令',
      title: '删除收藏',
      message: '确定删除这条收藏命令吗？',
      detail: normalized,
      confirmText: '删除',
      danger: true,
      onConfirm: () => deleteFavoriteCommand(normalized),
    })
  }, [deleteFavoriteCommand, onRequestConfirm])

  const toggleFavoriteCommand = useCallback((command: string) => {
    const normalized = stripTerminalControlSequences(command).trim()
    if (!normalized) {
      return
    }
    if (favoriteCommands.includes(normalized)) {
      confirmDeleteFavoriteCommand(normalized)
      return
    }
    persistFavoriteCommands([normalized, ...favoriteCommands.filter((item) => item !== normalized)])
  }, [confirmDeleteFavoriteCommand, favoriteCommands, persistFavoriteCommands])

  const addFavoriteCommand = useCallback(() => {
    const normalized = stripTerminalControlSequences(favoriteCommandDraft).trim()
    if (!normalized) {
      return
    }
    persistFavoriteCommands([...favoriteCommands.filter((item) => item !== normalized), normalized])
    setFavoriteCommandDraft('')
  }, [favoriteCommandDraft, favoriteCommands, persistFavoriteCommands])

  const moveFavoriteCommand = useCallback((index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= favoriteCommands.length) {
      return
    }
    const next = [...favoriteCommands]
    const [item] = next.splice(index, 1)
    next.splice(targetIndex, 0, item)
    persistFavoriteCommands(next)
  }, [favoriteCommands, persistFavoriteCommands])

  const isFavoriteCommand = useCallback(
    (command: string) => favoriteCommands.includes(stripTerminalControlSequences(command).trim()),
    [favoriteCommands],
  )

  return {
    addFavoriteCommand,
    favoriteCommandDraft,
    favoriteCommands,
    isFavoriteCommand,
    moveFavoriteCommand,
    persistFavoriteCommands,
    setFavoriteCommandDraft,
    setFavoriteCommands,
    toggleFavoriteCommand,
    confirmDeleteFavoriteCommand,
  }
}
