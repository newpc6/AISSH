import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history as editorHistory, historyKeymap } from '@codemirror/commands'
import { indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { search, searchKeymap } from '@codemirror/search'
import { codeMirrorLanguage } from '../../utils'

type CodeMirrorEditorProps = {
  value: string
  fileName: string
  readOnly: boolean
  onChange: (value: string) => void
}

export type CodeMirrorEditorHandle = {
  runCommand: (command: (view: EditorView) => boolean) => boolean
  focus: () => void
}

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, CodeMirrorEditorProps>(
  function CodeMirrorEditor({ value, fileName, readOnly, onChange }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const viewRef = useRef<EditorView | null>(null)
    const onChangeRef = useRef(onChange)
    const language = useMemo(() => codeMirrorLanguage(fileName), [fileName])

    useImperativeHandle(ref, () => ({
      runCommand(command) {
        const view = viewRef.current
        if (!view) return false
        const handled = command(view)
        view.focus()
        return handled
      },
      focus() {
        viewRef.current?.focus()
      },
    }))

    useEffect(() => {
      onChangeRef.current = onChange
    }, [onChange])

    useEffect(() => {
      const container = containerRef.current
      if (!container) return undefined
      const view = new EditorView({
        parent: container,
        state: EditorState.create({
          doc: value,
          extensions: [
            lineNumbers(),
            editorHistory(),
            indentOnInput(),
            search({ top: true }),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap]),
            language,
            EditorView.lineWrapping,
            EditorView.editable.of(!readOnly),
            EditorState.readOnly.of(readOnly),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                onChangeRef.current(update.state.doc.toString())
              }
            }),
          ],
        }),
      })
      viewRef.current = view
      return () => {
        view.destroy()
        viewRef.current = null
      }
    }, [fileName, language, readOnly])

    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      const current = view.state.doc.toString()
      if (current === value) return
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      })
    }, [value])

    return <div className="codemirror-host" ref={containerRef} />
  },
)
