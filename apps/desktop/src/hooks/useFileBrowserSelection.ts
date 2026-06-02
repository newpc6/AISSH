import { useEffect, useMemo, useRef, useState } from 'react'
import type { CompositionEvent, KeyboardEvent, MouseEvent, RefObject } from 'react'
import type { FileEntry } from '@ai-ssh/shared-contracts'
import type { FileSortKey, FileSortState } from '../types'
import { compareFileEntries, normalizeFileSearchText } from '../utils'

type UseFileBrowserSelectionArgs = {
  fileBrowserRef: RefObject<HTMLDivElement | null>
  fileEntries: FileEntry[]
}

export function useFileBrowserSelection({ fileBrowserRef, fileEntries }: UseFileBrowserSelectionArgs) {
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([])
  const [focusedFilePath, setFocusedFilePath] = useState('')
  const [fileSort, setFileSort] = useState<FileSortState>({ key: 'name', direction: 'asc' })
  const lastSelectedFilePathRef = useRef('')
  const fileTypeaheadRef = useRef('')
  const fileTypeaheadTimerRef = useRef<number | undefined>(undefined)

  const sortedFileEntries = useMemo(
    () => [...fileEntries].sort((a, b) => compareFileEntries(a, b, fileSort)),
    [fileEntries, fileSort],
  )

  const selectedFileEntries = useMemo(() => {
    const selected = new Set(selectedFilePaths)
    return sortedFileEntries.filter((entry) => entry.type === 'file' && selected.has(entry.path))
  }, [selectedFilePaths, sortedFileEntries])

  useEffect(() => () => {
    if (fileTypeaheadTimerRef.current) {
      window.clearTimeout(fileTypeaheadTimerRef.current)
    }
  }, [])

  const updateFileSort = (key: FileSortKey) => {
    setFileSort((current) => (
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    ))
  }

  const focusFileEntryRow = (index: number) => {
    window.requestAnimationFrame(() => {
      const row = fileBrowserRef.current?.querySelector<HTMLButtonElement>(`[data-file-index="${index}"]`)
      row?.scrollIntoView({ block: 'nearest' })
      row?.focus({ preventScroll: true })
    })
  }

  const locateFileEntryByText = (text: string) => {
    const keyword = normalizeFileSearchText(text)
    if (!keyword || sortedFileEntries.length === 0) {
      return
    }
    const currentIndex = sortedFileEntries.findIndex((entry) => entry.path === focusedFilePath)
    const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0
    const orderedEntries = [
      ...sortedFileEntries.slice(startIndex),
      ...sortedFileEntries.slice(0, startIndex),
    ]
    const match = (
      orderedEntries.find((entry) => normalizeFileSearchText(entry.name).startsWith(keyword))
      ?? orderedEntries.find((entry) => normalizeFileSearchText(entry.name).includes(keyword))
    )
    if (!match) {
      return
    }

    const matchIndex = sortedFileEntries.findIndex((entry) => entry.path === match.path)
    setFocusedFilePath(match.path)
    if (match.type === 'file') {
      setSelectedFilePaths([match.path])
      lastSelectedFilePathRef.current = match.path
    } else {
      setSelectedFilePaths([])
      lastSelectedFilePathRef.current = ''
    }
    if (matchIndex >= 0) {
      focusFileEntryRow(matchIndex)
    }
  }

  const queueFileTypeaheadReset = () => {
    if (fileTypeaheadTimerRef.current) {
      window.clearTimeout(fileTypeaheadTimerRef.current)
    }
    fileTypeaheadTimerRef.current = window.setTimeout(() => {
      fileTypeaheadRef.current = ''
    }, 900)
  }

  const applyFileTypeahead = (text: string) => {
    fileTypeaheadRef.current = `${fileTypeaheadRef.current}${text}`
    locateFileEntryByText(fileTypeaheadRef.current)
    queueFileTypeaheadReset()
  }

  const handleFileBrowserKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    const isEditableTarget = Boolean(
      target?.closest('input, textarea, select') || target?.isContentEditable,
    )
    if (
      isEditableTarget
      || event.defaultPrevented
      || event.ctrlKey
      || event.metaKey
      || event.altKey
      || event.nativeEvent.isComposing
      || event.key.length !== 1
    ) {
      return
    }
    event.preventDefault()
    applyFileTypeahead(event.key)
  }

  const handleFileBrowserCompositionEnd = (event: CompositionEvent<HTMLDivElement>) => {
    if (event.data) {
      applyFileTypeahead(event.data)
    }
  }

  const clearFileSelection = () => {
    setSelectedFilePaths([])
    lastSelectedFilePathRef.current = ''
  }

  const selectFileEntry = (entry: FileEntry, event: MouseEvent<HTMLButtonElement>) => {
    if (entry.type !== 'file') {
      return
    }
    setFocusedFilePath(entry.path)
    const filePaths = sortedFileEntries.filter((item) => item.type === 'file').map((item) => item.path)
    const currentIndex = filePaths.indexOf(entry.path)
    if (currentIndex < 0) {
      return
    }

    if (event.shiftKey && lastSelectedFilePathRef.current) {
      const anchorIndex = filePaths.indexOf(lastSelectedFilePathRef.current)
      if (anchorIndex >= 0) {
        const start = Math.min(anchorIndex, currentIndex)
        const end = Math.max(anchorIndex, currentIndex)
        const range = filePaths.slice(start, end + 1)
        setSelectedFilePaths((current) => (
          event.ctrlKey || event.metaKey ? Array.from(new Set([...current, ...range])) : range
        ))
        return
      }
    }

    lastSelectedFilePathRef.current = entry.path
    if (event.ctrlKey || event.metaKey) {
      setSelectedFilePaths((current) => (
        current.includes(entry.path)
          ? current.filter((path) => path !== entry.path)
          : [...current, entry.path]
      ))
      return
    }
    setSelectedFilePaths([entry.path])
  }

  return {
    clearFileSelection,
    fileSort,
    focusedFilePath,
    handleFileBrowserCompositionEnd,
    handleFileBrowserKeyDown,
    selectFileEntry,
    selectedFileEntries,
    selectedFilePaths,
    setFocusedFilePath,
    sortedFileEntries,
    updateFileSort,
  }
}
