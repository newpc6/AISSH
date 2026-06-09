import type { CompositionEvent, DragEvent, KeyboardEvent, MouseEvent, RefObject } from 'react'
import type { FileEntry } from '@ai-ssh/shared-contracts'
import { useTranslation } from 'react-i18next'
import type { FileSortKey, FileSortState, TransferTask } from '../../types'
import { formatBytes, formatLocalizedDateTime, parentPath } from '../../utils'

type FileBrowserPanelProps = {
  fileBrowserRef: RefObject<HTMLDivElement | null>
  fileEntries: FileEntry[]
  fileError: string
  filePath: string
  filePathDraft: string
  fileSort: FileSortState
  focusedFilePath: string
  isFileDropActive: boolean
  isLoadingFiles: boolean
  selectedFileCount: number
  selectedFilePaths: string[]
  trackTerminalPath: boolean
  transferTasks: TransferTask[]
  uploadFileRef: RefObject<HTMLInputElement | null>
  uploadFolderRef: RefObject<HTMLInputElement | null>
  onChooseUploadFiles: () => void | Promise<void>
  onChooseUploadFolder: () => void | Promise<void>
  onCollapse: () => void
  onConfirmRemoveTransferTask: (task: TransferTask) => void
  onDownloadEntry: (entry: FileEntry) => void | Promise<void>
  onDownloadSelectedFiles: () => void | Promise<void>
  onFilePathDraftChange: (value: string) => void
  onFileSortChange: (key: FileSortKey) => void
  onFocusFilePath: (path: string) => void
  onHandleBrowserCompositionEnd: (event: CompositionEvent<HTMLDivElement>) => void
  onHandleBrowserKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onHandleRemoteFileDragEnd: (entry: FileEntry, event: DragEvent<HTMLButtonElement>) => void
  onLoadFiles: (path: string) => void | Promise<void>
  onOpenFilePreview: (entry: FileEntry) => void | Promise<void>
  onResetSelection: () => void
  onSelectEntry: (entry: FileEntry, event: MouseEvent<HTMLButtonElement>) => void
  onSetIsFileDropActive: (value: boolean) => void
  onSetTrackTerminalPath: (value: boolean) => void
  onSetupRemoteFileDrag: (entry: FileEntry, event: DragEvent<HTMLButtonElement>) => void
  onRejectDroppedFolder: () => void
  onUploadInputChange: (files: FileList | null) => void | Promise<void>
  onUploadFolderInputChange: (files: FileList | null) => void | Promise<void>
}

export function FileBrowserPanel({
  fileBrowserRef,
  fileEntries,
  fileError,
  filePath,
  filePathDraft,
  fileSort,
  focusedFilePath,
  isFileDropActive,
  isLoadingFiles,
  selectedFileCount,
  selectedFilePaths,
  trackTerminalPath,
  transferTasks,
  uploadFileRef,
  uploadFolderRef,
  onChooseUploadFiles,
  onChooseUploadFolder,
  onCollapse,
  onConfirmRemoveTransferTask,
  onDownloadEntry,
  onDownloadSelectedFiles,
  onFilePathDraftChange,
  onFileSortChange,
  onFocusFilePath,
  onHandleBrowserCompositionEnd,
  onHandleBrowserKeyDown,
  onHandleRemoteFileDragEnd,
  onLoadFiles,
  onOpenFilePreview,
  onResetSelection,
  onSelectEntry,
  onSetIsFileDropActive,
  onSetTrackTerminalPath,
  onSetupRemoteFileDrag,
  onRejectDroppedFolder,
  onUploadInputChange,
  onUploadFolderInputChange,
}: FileBrowserPanelProps) {
  const { t, i18n } = useTranslation()

  const sortLabel = (key: FileSortKey) => t(`fileBrowser.columns.${key}`)

  return (
    <div className="left-content">
      <div className="panel-toolbar">
        <strong>{t('fileBrowser.title')}</strong>
        <div>
          <button type="button" title={t('fileBrowser.collapse')} onClick={onCollapse}>
            ◀
          </button>
          <button type="button" title={t('fileBrowser.parentDirectory')} onClick={() => void onLoadFiles(parentPath(filePath))}>
            {t('files.parentDirectory')}
          </button>
          <button
            type="button"
            title={selectedFileCount > 0 ? t('fileBrowser.downloadSelected', { count: selectedFileCount }) : t('fileBrowser.downloadSelectedEmpty')}
            disabled={selectedFileCount === 0}
            onClick={() => void onDownloadSelectedFiles()}
          >
            {t('fileBrowser.downloadButton')}{selectedFileCount > 0 ? `(${selectedFileCount})` : ''}
          </button>
          <button type="button" title={t('fileBrowser.uploadToCurrent')} onClick={() => void onChooseUploadFiles()}>
            {t('fileBrowser.upload')}
          </button>
          <button type="button" title={t('fileBrowser.uploadFolderToCurrent')} onClick={() => void onChooseUploadFolder()}>
            {t('fileBrowser.uploadFolder')}
          </button>
        </div>
      </div>
      <form
        className="file-path-form"
        onSubmit={(event) => {
          event.preventDefault()
          void onLoadFiles(filePathDraft.trim() || '.')
        }}
      >
        <input aria-label={t('fileBrowser.pathLabel')} value={filePathDraft} onChange={(event) => onFilePathDraftChange(event.target.value)} />
        <button type="submit" title={t('fileBrowser.openPath')}>
          {t('fileBrowser.open')}
        </button>
      </form>
      <input
        ref={uploadFileRef}
        hidden
        multiple
        type="file"
        onChange={(event) => {
          void onUploadInputChange(event.target.files)
          event.target.value = ''
        }}
      />
      <input
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        ref={uploadFolderRef}
        hidden
        multiple
        type="file"
        onChange={(event) => {
          void onUploadFolderInputChange(event.target.files)
          event.target.value = ''
        }}
      />
      <label className="toggle-row">
        <input checked={trackTerminalPath} type="checkbox" onChange={(event) => onSetTrackTerminalPath(event.target.checked)} />
        <span>{t('fileBrowser.trackTerminalPath')}</span>
      </label>
      <div
        ref={fileBrowserRef}
        aria-label={t('fileBrowser.directoryLabel')}
        className={`file-browser ${fileError ? 'has-status' : ''} ${isFileDropActive ? 'drop-active' : ''}`}
        tabIndex={0}
        onCompositionEnd={onHandleBrowserCompositionEnd}
        onDragEnter={(event) => {
          event.preventDefault()
          if (Array.from(event.dataTransfer.types).includes('Files')) {
            onSetIsFileDropActive(true)
          }
        }}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget
          if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
            onSetIsFileDropActive(false)
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={(event) => {
          event.preventDefault()
          onSetIsFileDropActive(false)
          const items = Array.from(event.dataTransfer.items || [])
          const hasDirectory = items.some((item) => {
            const entry = item.kind === 'file' ? item.webkitGetAsEntry?.() : null
            return entry?.isDirectory
          })
          if (hasDirectory) {
            onRejectDroppedFolder()
            return
          }
          if (event.dataTransfer.files.length > 0) {
            void onUploadInputChange(event.dataTransfer.files)
          }
        }}
        onKeyDown={onHandleBrowserKeyDown}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.focus()
          }
        }}
      >
        {isFileDropActive ? (
          <div className="file-drop-overlay">
            <strong>{t('fileBrowser.dropUpload')}</strong>
            <span>{t('fileBrowser.dropTarget', { path: filePath })}</span>
          </div>
        ) : null}
        <div className="file-path-row">
          <span className="file-path-text">{filePath}</span>
          <div className="file-path-actions">
            {isLoadingFiles ? (
              <span className="file-loading-spinner" role="status" aria-label={t('fileBrowser.loadingFiles')} title={t('fileBrowser.loadingFiles')} />
            ) : null}
            <button type="button" title={t('fileBrowser.refreshCurrent')} onClick={() => void onLoadFiles(filePath)}>
              {t('app.refresh')}
            </button>
          </div>
        </div>
        {fileError ? (
          <div className="file-browser-status">
            <p className="error-text">{fileError}</p>
          </div>
        ) : null}
        <div className="file-table">
          <div className="file-table-head">
            {(['name', 'size', 'modifiedAt'] as FileSortKey[]).map((key) => (
              <button
                key={key}
                className={fileSort.key === key ? 'active' : ''}
                type="button"
                title={t('fileBrowser.sortBy', {
                  label: sortLabel(key),
                  direction: t(`fileBrowser.sortDirection.${fileSort.key === key && fileSort.direction === 'asc' ? 'asc' : 'desc'}`),
                })}
                onClick={() => onFileSortChange(key)}
              >
                <span>{sortLabel(key)}</span>
                <small aria-hidden="true">{fileSort.key === key ? (fileSort.direction === 'asc' ? '↓' : '↑') : ''}</small>
              </button>
            ))}
          </div>
          {fileEntries.map((entry, index) => (
            <button
              key={entry.path}
              aria-pressed={selectedFilePaths.includes(entry.path)}
              className={`${selectedFilePaths.includes(entry.path) ? 'selected' : ''} ${focusedFilePath === entry.path ? 'focused' : ''}`}
              data-file-index={index}
              draggable={entry.type === 'file'}
              type="button"
              title={entry.type === 'directory' ? t('fileBrowser.directoryTitle') : t('fileBrowser.fileTitle')}
              onClick={(event) => {
                onFocusFilePath(entry.path)
                if (entry.type === 'file') {
                  onSelectEntry(entry, event)
                } else {
                  onResetSelection()
                }
              }}
              onDragStart={(event) => {
                onSetupRemoteFileDrag(entry, event)
              }}
              onDragEnd={(event) => {
                onHandleRemoteFileDragEnd(entry, event)
              }}
              onDoubleClick={() => {
                if (entry.type === 'directory') {
                  void onLoadFiles(entry.path)
                } else {
                  void onOpenFilePreview(entry)
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                if (entry.type === 'file') {
                  void onDownloadEntry(entry)
                }
              }}
            >
              <span>{entry.type === 'directory' ? '▸ ' : ''}{entry.name}</span>
              <span>{entry.type === 'directory' ? '-' : formatBytes(entry.size)}</span>
              <span>{formatLocalizedDateTime(entry.modifiedAt, i18n.language)}</span>
            </button>
          ))}
        </div>
      </div>
      {transferTasks.length > 0 ? (
        <div className="transfer-dock">
          <strong>{t('fileBrowser.transferTasks')}</strong>
          <div className="transfer-list">
            {transferTasks.slice(0, 4).map((task) => (
              <div key={task.id}>
                <button
                  className="transfer-close"
                  type="button"
                  title={t('fileBrowser.removeTransfer', { name: task.name })}
                  onClick={() => onConfirmRemoveTransferTask(task)}
                >
                  ?
                </button>
                <span>{t(`fileBrowser.transferDirection.${task.direction}`)} / {task.name}</span>
                <progress max="100" value={task.progress} />
                <small>
                  {task.mode === 'folder' && task.totalFiles
                    ? t('fileBrowser.transferFolderProgress', {
                        current: task.currentFileIndex ?? 0,
                        total: task.totalFiles,
                        file: task.currentFileName || '-',
                      })
                    : task.currentFileName || task.name}
                </small>
                <small>
                  {task.mode === 'folder'
                    ? t('fileBrowser.transferFolderBytes', {
                        current: formatBytes(task.currentFileTransferredBytes ?? 0),
                        total: formatBytes(task.currentFileTotalBytes ?? 0),
                        progress: task.progress,
                      })
                    : t('fileBrowser.transferFileBytes', {
                        current: formatBytes(task.transferredBytes ?? 0),
                        total: formatBytes(task.totalBytes ?? 0),
                        progress: task.progress,
                      })}
                </small>
                <small>{task.status}</small>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
