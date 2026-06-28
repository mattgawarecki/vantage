import { useState } from 'react'
import type { FileNode } from '@vantage/shared'
import { depthLabel, scoreBand } from '../ui'

interface Props {
  nodes: FileNode[]
  selected: string | null
  onSelect: (path: string) => void
}

interface TreeDir {
  name: string
  dirs: Map<string, TreeDir>
  files: FileNode[]
}

function buildTree(nodes: FileNode[]): TreeDir {
  const root: TreeDir = { name: '', dirs: new Map(), files: [] }
  for (const node of nodes) {
    const parts = node.id.split('/')
    parts.pop() // drop filename; keep dir segments
    let dir = root
    for (const part of parts) {
      if (!dir.dirs.has(part)) {
        dir.dirs.set(part, { name: part, dirs: new Map(), files: [] })
      }
      dir = dir.dirs.get(part)!
    }
    dir.files.push(node)
  }
  return root
}

function DirView({ dir, depth, selected, onSelect }: {
  dir: TreeDir; depth: number; selected: string | null; onSelect: (p: string) => void
}) {
  return (
    <ul className="tree">
      {[...dir.dirs.values()].map((sub) => (
        <DirBranch key={sub.name} dir={sub} depth={depth} selected={selected} onSelect={onSelect} />
      ))}
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

function DirBranch({ dir, depth, selected, onSelect }: {
  dir: TreeDir; depth: number; selected: string | null; onSelect: (p: string) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <li>
      <button
        className="tree-dir"
        style={{ paddingLeft: depth * 12 }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="tree-caret">{open ? '▾' : '▸'}</span>
        <span>{open ? '📂' : '📁'} {dir.name}</span>
      </button>
      {open && <DirView dir={dir} depth={depth + 1} selected={selected} onSelect={onSelect} />}
    </li>
  )
}

export function FileTree({ nodes, selected, onSelect }: Props) {
  const tree = buildTree([...nodes].sort((a, b) => a.id.localeCompare(b.id)))
  return <DirView dir={tree} depth={0} selected={selected} onSelect={onSelect} />
}
