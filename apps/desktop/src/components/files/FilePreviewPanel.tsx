import type { RefObject } from 'react'
import {
  indentLess,
  indentMore,
  redo,
  selectAll,
  toggleComment,
  undo,
} from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import type { FilePreviewTab, LoadState } from '../../types'
import { formatBytes, previewKindLabel } from '../../utils'
import { CodeMirrorEditor, type CodeMirrorEditorHandle } from './CodeMirrorEditor'

type DownloadableFile = {
  name: string
  path: string
  type: 'file'
  size: number
  modifiedAt: string
}

type FilePreviewPanelProps = {
  tab: FilePreviewTab
  codeMirrorRef: RefObject<CodeMirrorEditorHandle | null>
  onDownloadFile: (file: DownloadableFile) => void | Promise<void>
  onOpenAsText: (tab: FilePreviewTab) => void | Promise<void>
  onCopyDraft: (tab: FilePreviewTab) => void | Promise<void>
  onFormatDraft: (tab: FilePreviewTab) => void
  onResetDraft: (tab: FilePreviewTab) => void
  onSaveFile: (tab: FilePreviewTab) => void | Promise<void>
  onSetEditMode: (tabId: string, isEditing: boolean) => void
  onUpdateDraft: (tabId: string, value: string) => void
}

function FilePreviewEmptyState({
  children,
  meta,
  title,
}: {
  children?: React.ReactNode
  meta: string
  title: string
}) {
  return (
    <div className="file-preview-empty">
      <strong>{title}</strong>
      <small>{meta}</small>
      {children}
    </div>
  )
}

function FilePreviewHeader({
  tab,
  onDownloadFile,
  onOpenSearch,
  onSaveFile,
  onSetEditMode,
}: {
  tab: FilePreviewTab
  onDownloadFile: (file: DownloadableFile) => void | Promise<void>
  onOpenSearch: () => void
  onSaveFile: (tab: FilePreviewTab) => void | Promise<void>
  onSetEditMode: (tabId: string, isEditing: boolean) => void
}) {
  return (
    <div className="file-preview-header">
      <div className="file-preview-title">
        <strong>{tab.name}</strong>
        <span>{tab.hostName} · {tab.path}</span>
      </div>
      <small className="file-preview-meta">
        {previewKindLabel(tab.kind)} · {formatBytes(tab.size)} · {new Date(tab.modifiedAt).toLocaleString()}
      </small>
      <div className="file-preview-actions">
        {tab.kind === 'text' && tab.status === 'ready' ? (
          <>
            <button
              className={!tab.isEditing ? 'active' : ''}
              type="button"
              title={`以预览模式查看 ${tab.name}`}
              onClick={() => onSetEditMode(tab.id, false)}
            >
              预览
            </button>
            <button type="button" title={`搜索 ${tab.name} 内容`} onClick={onOpenSearch}>
              搜索
            </button>
            <button
              className={tab.isEditing ? 'active' : ''}
              type="button"
              title={`编辑 ${tab.name}`}
              onClick={() => onSetEditMode(tab.id, true)}
            >
              编辑
            </button>
            <button
              disabled={!tab.isEditing || tab.saveState === 'loading'}
              type="button"
              title={`保存 ${tab.name}`}
              onClick={() => void onSaveFile(tab)}
            >
              {tab.saveState === 'loading' ? '保存中' : '保存'}
            </button>
            {tab.saveMessage ? (
              <span className={`file-save-message file-save-${(tab.saveState ?? 'idle') as LoadState}`}>
                {tab.saveMessage}
              </span>
            ) : null}
          </>
        ) : null}
        <button
          type="button"
          title={`下载 ${tab.name}`}
          onClick={() => void onDownloadFile({
            name: tab.name,
            path: tab.path,
            type: 'file',
            size: tab.size,
            modifiedAt: tab.modifiedAt,
          })}
        >
          下载
        </button>
      </div>
    </div>
  )
}

export function FilePreviewPanel({
  tab,
  codeMirrorRef,
  onCopyDraft,
  onDownloadFile,
  onFormatDraft,
  onOpenAsText,
  onResetDraft,
  onSaveFile,
  onSetEditMode,
  onUpdateDraft,
}: FilePreviewPanelProps) {
  const meta = `${tab.hostName} · ${tab.path} · ${formatBytes(tab.size)}`

  let content: React.ReactNode
  if (tab.status === 'loading') {
    content = (
      <div className="file-preview-empty">
        <span className="file-loading-spinner" />
        <strong>正在加载 {tab.name}</strong>
        <small>{meta}</small>
      </div>
    )
  } else if (tab.status === 'error') {
    content = (
      <FilePreviewEmptyState meta={meta} title="预览失败">
        <small>{tab.error ?? '无法读取远程文件'}</small>
        <button type="button" title={`以文本方式打开 ${tab.name}`} onClick={() => void onOpenAsText(tab)}>
          以文本方式打开
        </button>
        <button
          type="button"
          title={`下载 ${tab.name}`}
          onClick={() => void onDownloadFile({
            name: tab.name,
            path: tab.path,
            type: 'file',
            size: tab.size,
            modifiedAt: tab.modifiedAt,
          })}
        >
          下载文件
        </button>
      </FilePreviewEmptyState>
    )
  } else if (tab.kind === 'text') {
    const draft = tab.draftContent ?? tab.content ?? ''
    content = (
      <div className={`file-text-preview ${tab.isEditing ? 'editing' : ''}`}>
        {tab.isEditing ? (
          <div className="codemirror-toolbar">
            <span>编辑模式</span>
            <div className="codemirror-toolbar-actions">
              <button type="button" title={`撤销 ${tab.name} 的上一步编辑`} onClick={() => codeMirrorRef.current?.runCommand(undo)}>
                撤销
              </button>
              <button type="button" title={`重做 ${tab.name} 的编辑`} onClick={() => codeMirrorRef.current?.runCommand(redo)}>
                重做
              </button>
              <button type="button" title={`全选 ${tab.name} 内容`} onClick={() => codeMirrorRef.current?.runCommand(selectAll)}>
                全选
              </button>
              <button type="button" title={`增加 ${tab.name} 选中行缩进`} onClick={() => codeMirrorRef.current?.runCommand(indentMore)}>
                缩进
              </button>
              <button type="button" title={`减少 ${tab.name} 选中行缩进`} onClick={() => codeMirrorRef.current?.runCommand(indentLess)}>
                反缩进
              </button>
              <button type="button" title={`切换 ${tab.name} 选中内容注释`} onClick={() => codeMirrorRef.current?.runCommand(toggleComment)}>
                注释
              </button>
              <button type="button" title={`格式化 ${tab.name}`} onClick={() => onFormatDraft(tab)}>
                格式化
              </button>
              <button type="button" title={`还原 ${tab.name} 到已保存内容`} onClick={() => onResetDraft(tab)}>
                还原
              </button>
              <button type="button" title={`复制 ${tab.name} 当前内容`} onClick={() => void onCopyDraft(tab)}>
                复制
              </button>
            </div>
          </div>
        ) : null}
        <CodeMirrorEditor
          fileName={tab.name}
          ref={codeMirrorRef}
          readOnly={!tab.isEditing}
          value={draft}
          onChange={(value) => onUpdateDraft(tab.id, value)}
        />
      </div>
    )
  } else if (tab.kind === 'image' && tab.objectUrl) {
    content = (
      <div className="file-media-preview">
        <img alt={tab.name} src={tab.objectUrl} />
      </div>
    )
  } else if (tab.kind === 'video' && tab.objectUrl) {
    content = (
      <div className="file-media-preview">
        <video controls src={tab.objectUrl} />
      </div>
    )
  } else {
    content = (
      <FilePreviewEmptyState meta={meta} title="暂不支持直接预览这种文件">
        <button type="button" title={`以文本方式打开 ${tab.name}`} onClick={() => void onOpenAsText(tab)}>
          以文本方式打开
        </button>
        <button
          type="button"
          title={`下载 ${tab.name}`}
          onClick={() => void onDownloadFile({
            name: tab.name,
            path: tab.path,
            type: 'file',
            size: tab.size,
            modifiedAt: tab.modifiedAt,
          })}
        >
          下载文件
        </button>
      </FilePreviewEmptyState>
    )
  }

  return (
    <>
      <FilePreviewHeader
        tab={tab}
        onDownloadFile={onDownloadFile}
        onOpenSearch={() => codeMirrorRef.current?.runCommand(openSearchPanel)}
        onSaveFile={onSaveFile}
        onSetEditMode={onSetEditMode}
      />
      <div className="file-preview-surface">{content}</div>
    </>
  )
}
