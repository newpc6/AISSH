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
import { useTranslation } from 'react-i18next'
import type { FilePreviewTab, LoadState } from '../../types'
import { formatBytes, formatLocalizedDateTime } from '../../utils'
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
  locale,
  kindLabel,
  t,
  onDownloadFile,
  onOpenSearch,
  onSaveFile,
  onSetEditMode,
}: {
  tab: FilePreviewTab
  locale: string
  kindLabel: string
  t: (key: string, options?: Record<string, unknown>) => string
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
        {kindLabel} · {formatBytes(tab.size)} · {formatLocalizedDateTime(tab.modifiedAt, locale)}
      </small>
      <div className="file-preview-actions">
        {tab.kind === 'text' && tab.status === 'ready' ? (
          <>
            <button
              className={!tab.isEditing ? 'active' : ''}
              type="button"
              title={t('filePreview.titlePreview', { name: tab.name })}
              onClick={() => onSetEditMode(tab.id, false)}
            >
              {t('filePreview.preview')}
            </button>
            <button type="button" title={t('filePreview.titleSearch', { name: tab.name })} onClick={onOpenSearch}>
              {t('filePreview.search')}
            </button>
            <button
              className={tab.isEditing ? 'active' : ''}
              type="button"
              title={t('filePreview.titleEdit', { name: tab.name })}
              onClick={() => onSetEditMode(tab.id, true)}
            >
              {t('filePreview.edit')}
            </button>
            <button
              disabled={!tab.isEditing || tab.saveState === 'loading'}
              type="button"
              title={t('filePreview.titleSave', { name: tab.name })}
              onClick={() => void onSaveFile(tab)}
            >
              {tab.saveState === 'loading' ? t('filePreview.saving') : t('filePreview.save')}
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
          title={t('filePreview.titleDownload', { name: tab.name })}
          onClick={() => void onDownloadFile({
            name: tab.name,
            path: tab.path,
            type: 'file',
            size: tab.size,
            modifiedAt: tab.modifiedAt,
          })}
        >
          {t('filePreview.download')}
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
  const { t, i18n } = useTranslation()
  const kindLabel = t(`fileBrowser.kind.${tab.kind === 'binary' ? 'binary' : tab.kind}`)
  const meta = `${tab.hostName} · ${tab.path} · ${formatBytes(tab.size)}`

  let content: React.ReactNode
  if (tab.status === 'loading') {
    content = (
      <div className="file-preview-empty">
        <span className="file-loading-spinner" />
        <strong>{t('filePreview.loading', { name: tab.name })}</strong>
        <small>{meta}</small>
      </div>
    )
  } else if (tab.status === 'error') {
    content = (
      <FilePreviewEmptyState meta={meta} title={t('filePreview.loadFailed')}>
        <small>{tab.error ?? t('filePreview.unableToRead')}</small>
        <button type="button" title={t('filePreview.titleOpenAsText', { name: tab.name })} onClick={() => void onOpenAsText(tab)}>
          {t('filePreview.openAsText')}
        </button>
        <button
          type="button"
          title={t('filePreview.titleDownload', { name: tab.name })}
          onClick={() => void onDownloadFile({
            name: tab.name,
            path: tab.path,
            type: 'file',
            size: tab.size,
            modifiedAt: tab.modifiedAt,
          })}
        >
          {t('filePreview.downloadFile')}
        </button>
      </FilePreviewEmptyState>
    )
  } else if (tab.kind === 'text') {
    const draft = tab.draftContent ?? tab.content ?? ''
    content = (
      <div className={`file-text-preview ${tab.isEditing ? 'editing' : ''}`}>
        {tab.isEditing ? (
          <div className="codemirror-toolbar">
            <span>{t('filePreview.editMode')}</span>
            <div className="codemirror-toolbar-actions">
              <button type="button" title={t('filePreview.titleUndo', { name: tab.name })} onClick={() => codeMirrorRef.current?.runCommand(undo)}>
                {t('filePreview.undo')}
              </button>
              <button type="button" title={t('filePreview.titleRedo', { name: tab.name })} onClick={() => codeMirrorRef.current?.runCommand(redo)}>
                {t('filePreview.redo')}
              </button>
              <button type="button" title={t('filePreview.titleSelectAll', { name: tab.name })} onClick={() => codeMirrorRef.current?.runCommand(selectAll)}>
                {t('filePreview.selectAll')}
              </button>
              <button type="button" title={t('filePreview.titleIndentMore', { name: tab.name })} onClick={() => codeMirrorRef.current?.runCommand(indentMore)}>
                {t('filePreview.indentMore')}
              </button>
              <button type="button" title={t('filePreview.titleIndentLess', { name: tab.name })} onClick={() => codeMirrorRef.current?.runCommand(indentLess)}>
                {t('filePreview.indentLess')}
              </button>
              <button type="button" title={t('filePreview.titleToggleComment', { name: tab.name })} onClick={() => codeMirrorRef.current?.runCommand(toggleComment)}>
                {t('filePreview.toggleComment')}
              </button>
              <button type="button" title={t('filePreview.titleFormat', { name: tab.name })} onClick={() => onFormatDraft(tab)}>
                {t('filePreview.format')}
              </button>
              <button type="button" title={t('filePreview.titleReset', { name: tab.name })} onClick={() => onResetDraft(tab)}>
                {t('filePreview.reset')}
              </button>
              <button type="button" title={t('filePreview.titleCopy', { name: tab.name })} onClick={() => void onCopyDraft(tab)}>
                {t('filePreview.copy')}
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
      <FilePreviewEmptyState meta={meta} title={t('filePreview.unsupported')}>
        <button type="button" title={t('filePreview.titleOpenAsText', { name: tab.name })} onClick={() => void onOpenAsText(tab)}>
          {t('filePreview.openAsText')}
        </button>
        <button
          type="button"
          title={t('filePreview.titleDownload', { name: tab.name })}
          onClick={() => void onDownloadFile({
            name: tab.name,
            path: tab.path,
            type: 'file',
            size: tab.size,
            modifiedAt: tab.modifiedAt,
          })}
        >
          {t('filePreview.downloadFile')}
        </button>
      </FilePreviewEmptyState>
    )
  }

  return (
    <>
      <FilePreviewHeader
        tab={tab}
        locale={i18n.language}
        kindLabel={kindLabel}
        t={t}
        onDownloadFile={onDownloadFile}
        onOpenSearch={() => codeMirrorRef.current?.runCommand(openSearchPanel)}
        onSaveFile={onSaveFile}
        onSetEditMode={onSetEditMode}
      />
      <div className="file-preview-surface">{content}</div>
    </>
  )
}
