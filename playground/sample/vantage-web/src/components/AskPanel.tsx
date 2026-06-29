import { useState } from 'react'
import { ask } from '../api'
import { Markdown } from './Markdown'

interface Props {
  path: string | null
  neighborCount: number
  hasKey: boolean
  onRequestKey: () => void
}

export function AskPanel({ path, neighborCount, hasKey, onRequestKey }: Props) {
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onAsk() {
    if (!path || !q.trim()) return
    setLoading(true)
    setAnswer(null)
    setAnswer(await ask(path, q.trim()))
    setLoading(false)
  }

  if (!hasKey) {
    return (
      <div className="ask">
        <h4>Ask the trail guide</h4>
        <p className="ask-ground">Natural-language Q&amp;A needs a Claude API key.</p>
        <button className="btn-ask btn-needkey" onClick={onRequestKey}>🔑 Set API key</button>
      </div>
    )
  }

  return (
    <div className="ask">
      <h4>Ask the trail guide</h4>
      <p className="ask-ground">
        {path
          ? `grounded in: ${path.split('/').pop()} + ${neighborCount} neighbor(s)`
          : 'open a file first'}
      </p>
      <textarea
        className="ask-input"
        placeholder="What does this file do? How does it fit in?"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        rows={3}
      />
      <button className="btn-ask" onClick={onAsk} disabled={loading || !path}>
        {loading ? 'Asking…' : 'Ask'}
      </button>
      {answer && <div className="ask-answer"><Markdown>{answer}</Markdown></div>}
    </div>
  )
}
