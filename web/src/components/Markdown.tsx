import ReactMarkdown from 'react-markdown'

/** Renders LLM markdown (bold, inline code, lists) into styled HTML. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  )
}
