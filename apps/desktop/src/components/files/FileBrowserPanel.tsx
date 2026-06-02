import type { CompositionEvent, DragEvent, KeyboardEvent, MouseEvent, RefObject } from 'react'
import type { FileEntry } from '@ai-ssh/shared-contracts'
import type { FileSortKey, FileSortState, TransferTask } from '../../types'
import { fileSortLabel, formatBytes, parentPath } from '../../utils'

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
  onChooseUploadFiles: () => void | Promise<void>
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
  onUploadInputChange: (files: FileList | null) => void | Promise<void>
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
  onChooseUploadFiles,
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
  onUploadInputChange,
}: FileBrowserPanelProps) {
  return (
    <div className="left-content">
      <div className="panel-toolbar">
        <strong>远程文件</strong>
        <div>
          <button type="button" title="折叠左侧面板" onClick={onCollapse}>
            ◁
          </button>
          <button type="button" title="进入上级目录" onClick={() => void onLoadFiles(parentPath(filePath))}>
            上级
          </button>
          <button
            type="button"
            title={selectedFileCount > 0 ? `下载选中的 ${selectedFileCount} 个文件` : '先单击选择要下载的文件'}
            disabled={selectedFileCount === 0}
            onClick={() => void onDownloadSelectedFiles()}
          >
            下载{selectedFileCount > 0 ? `(${selectedFileCount})` : ''}
          </button>
          <button type="button" title="上传文件到当前目录" onClick={() => void onChooseUploadFiles()}>
            上传
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
        <input aria-label="远程路径" value={filePathDraft} onChange={(event) => onFilePathDraftChange(event.target.value)} />
        <button type="submit" title="进入输入的远程路径">
          进入
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
      <label className="toggle-row">
        <input checked={trackTerminalPath} type="checkbox" onChange={(event) => onSetTrackTerminalPath(event.target.checked)} />
        <span>跟踪终端路径</span>
      </label>
      <div
        ref={fileBrowserRef}
        aria-label="远程文件目录"
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
            <strong>松开上传</strong>
            <span>上传到 {filePath}</span>
          </div>
        ) : null}
        <div className="file-path-row">
          <span className="file-path-text">{filePath}</span>
          <div className="file-path-actions">
            {isLoadingFiles ? (
              <span className="file-loading-spinner" role="status" aria-label="远程文件加载中" title="远程文件加载中" />
            ) : null}
            <button type="button" title="刷新当前目录" onClick={() => void onLoadFiles(filePath)}>
              刷新
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
                title={`按${fileSortLabel(key)}${fileSort.key === key && fileSort.direction === 'asc' ? '降序' : '升序'}排序`}
                onClick={() => onFileSortChange(key)}
              >
                <span>{fileSortLabel(key)}</span>
                <small aria-hidden="true">{fileSort.key === key ? (fileSort.direction === 'asc' ? '↑' : '↓') : ''}</small>
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
              title={entry.type === 'directory' ? '双击进入目录' : '单击选择，Ctrl/Shift 多选，双击预览，右键下载，拖出快速下载'}
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
              <span>{new Date(entry.modifiedAt).toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>
      {transferTasks.length > 0 ? (
        <div className="transfer-dock">
          <strong>传输任务</strong>
          <div className="transfer-list">
            {transferTasks.slice(0, 4).map((task) => (
              <div key={task.id}>
                <button
                  className="transfer-close"
                  type="button"
                  title={`移除 ${task.name} 传输记录`}
                  onClick={() => onConfirmRemoveTransferTask(task)}
                >
                  ×
                </button>
                <span>{task.direction === 'upload' ? '上传' : '下载'} · {task.name}</span>
                <progress max="100" value={task.progress} />
                <small>{task.status}</small>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
