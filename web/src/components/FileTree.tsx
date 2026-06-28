import { useEffect, useState } from 'react'
import type { FileNode } from '@vantage/shared'
import { depthLabel, scoreBand } from '../ui'

interface Props {
  nodes: FileNode[]
  selected: string | null
  onSelect: (path: string) => void
}

interface TreeDir {
  name: string
  path: string // full dir path, e.g. "src/components"
  dirs: Map<string, TreeDir>
  files: FileNode[]
}

function buildTree(nodes: FileNode[]): TreeDir {
  const root: TreeDir = { name: '', path: '', dirs: new Map(), files: [] }
  for (const node of nodes) {
    const parts = node.id.split('/')
    parts.pop() // drop filename; keep dir segments
    let dir = root
    for (const part of parts) {
      if (!dir.dirs.has(part)) {
        const path = dir.path ? `${dir.path}/${part}` : part
        dir.dirs.set(part, { name: part, path, dirs: new Map(), files: [] })
      }
      dir = dir.dirs.get(part)!
    }
    dir.files.push(node)
  }
  return root
}

/** Ancestor dir paths of a file: "a/b/c.ts" -> ["a", "a/b"]. */
function ancestorDirs(path: string): string[] {
  const parts = path.split('/')
  parts.pop()
  const out: string[] = []
  let acc = ''
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p
    out.push(acc)
  }
  return out
}

function DirView({ dir, depth, selected, expanded, onToggle, onSelect }: {
  dir: TreeDir
  depth: number
  selected: string | null
  expanded: Set<string>
  onToggle: (path: string) => void
  onSelect: (p: string) => void
}) {
  return (
    <ul className="tree">
      {[...dir.dirs.values()].map((sub) => {
        const open = expanded.has(sub.path)
        return (
          <li key={sub.path}>
            <button
              className="tree-dir"
              style={{ paddingLeft: depth * 12 }}
              onClick={() => onToggle(sub.path)}
              aria-expanded={open}
            >
              <span className="tree-caret">{open ? '▾' : '▸'}</span>
              <span>{open ? '📂' : '📁'} {sub.name}</span>
            </button>
            {open && (
              <DirView
                dir={sub}
                depth={depth + 1}
                selected={selected}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            )}
          </li>
        )
      })}
      {dir.files.map((node) => {
        const file = node.id.split('/').pop()
        return (
          <li key={node.id}>
            <button
              className={`tree-file${selected === node.id ? ' is-selected' : ''}`}
              style={{ paddingLeft: depth * 12 + 4 }}
              onClick={() => onSelect(node.id)}
              title={`score ${node.score.toFixed(2)} · depth ${node.depth ?? 'off-trail'}`}
            >
              <span className={`dot dot-${scoreBand(node.score)}`} />
              <span className="tree-name">{file}</span>
              <span className={`depth-badge${node.depth === null ? ' off' : ''}`}>
                {depthLabel(node.depth)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function FileTree({ nodes, selected, onSelect }: Props) {
  const tree = buildTree([...nodes].sort((a, b) => a.id.localeCompare(b.id)))
  // All collapsed by default; reveal the selected file's ancestors (VS Code style).
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!selected) return
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const dir of ancestorDirs(selected)) next.add(dir)
      return next
    })
  }, [selected])

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <DirView
      dir={tree}
      depth={0}
      selected={selected}
      expanded={expanded}
      onToggle={toggle}
      onSelect={onSelect}
    />
  )
}
