import { useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { FileContent, Signal } from '@vantage/shared'

interface Props {
  content: FileContent | null
  signals: Signal[]
  onPickLine: (line: number) => void
  /** The currently-focused marker line, emphasized more strongly. */
  activeLine?: number | null
  /** Scroll target from the annotations panel. `n` bumps so repeat clicks re-fire. */
  reveal?: { line: number; n: number } | null
}

// Loosely typed Monaco handles — avoids a hard dep on monaco's types here.
type EditorHandle = Parameters<OnMount>[0]
type MonacoHandle = Parameters<OnMount>[1]

export function CodeView({ content, signals, onPickLine, activeLine, reveal }: Props) {
  const editorRef = useRef<EditorHandle | null>(null)
  const monacoRef = useRef<MonacoHandle | null>(null)
  const decoRef = useRef<{ clear: () => void } | null>(null)

  function applyDecorations() {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return
    decoRef.current?.clear()
    // Expand each signal to all its contributing lines (e.g. every hook).
    const decos = signals.flatMap((s) => {
      const lines = s.lines?.length ? s.lines : s.line ? [s.line] : []
      return lines.map((line) => {
        const isActive = line === activeLine
        return {
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: isActive ? 'trail-line trail-line-active' : 'trail-line',
            glyphMarginClassName: 'trail-glyph',
            glyphMarginHoverMessage: { value: `**${s.kind}** — ${s.detail}` },
            linesDecorationsClassName: 'trail-strip',
            overviewRuler: {
              color: isActive ? '#f0a85c' : '#e08a3c',
              position: monaco.editor.OverviewRulerLane.Right,
            },
          },
        }
      })
    })
    decoRef.current = editor.createDecorationsCollection(decos)
  }

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    applyDecorations()
    editor.onMouseDown((e) => {
      const GLYPH = monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
      if (e.target.type === GLYPH && e.target.position) {
        onPickLine(e.target.position.lineNumber)
      }
    })
  }

  // Re-apply markers when the file or its signals change.
  useEffect(applyDecorations, [content?.path, signals, activeLine]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to a line when the annotations panel requests it.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !reveal) return
    editor.revealLineInCenter(reveal.line)
    editor.setPosition({ lineNumber: reveal.line, column: 1 })
  }, [reveal])

  if (!content) {
    return <div className="code-empty">Select a file from the trail.</div>
  }

  return (
    <Editor
      key={content.path}
      height="100%"
      theme="vs-dark"
      path={content.path}
      defaultLanguage={content.language}
      value={content.source}
      onMount={handleMount}
      options={{
        readOnly: true,
        glyphMargin: true,
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
        renderLineHighlight: 'all',
      }}
    />
  )
}
