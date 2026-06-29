// Mock analysis so the UI renders before the server/analyzer are wired.
// Swapped for live /analyze data once the server is up (see api.ts fallback).
import type { Analysis, FileContent } from '@vantage/shared'

export const mockAnalysis: Analysis = {
  repoRoot: '/example/shop-app',
  entrypoints: ['src/main.tsx'],
  summary: {
    fileCount: 9,
    topDirs: ['src/features', 'src/components', 'src/lib'],
    framework: 'React + Vite',
    entrypoints: ['src/main.tsx'],
    orphanCount: 1,
    cycleCount: 0,
    warnings: [],
  },
  edges: [
    { from: 'src/main.tsx', to: 'src/App.tsx', dynamic: false, typeOnly: false },
    { from: 'src/App.tsx', to: 'src/features/Cart.tsx', dynamic: true, typeOnly: false },
    { from: 'src/App.tsx', to: 'src/components/Header.tsx', dynamic: false, typeOnly: false },
    { from: 'src/features/Cart.tsx', to: 'src/lib/api.ts', dynamic: false, typeOnly: false },
    { from: 'src/features/Cart.tsx', to: 'src/lib/money.ts', dynamic: false, typeOnly: false },
    { from: 'src/components/Header.tsx', to: 'src/lib/money.ts', dynamic: false, typeOnly: false },
  ],
  nodes: [
    {
      id: 'src/main.tsx', depth: 0, loc: 11, mtimeMs: 0, score: 0.15,
      signals: [],
    },
    {
      id: 'src/App.tsx', depth: 1, loc: 64, mtimeMs: 0, score: 0.55,
      signals: [
        { kind: 'dynamic-import', line: 8, detail: 'Lazy route: React.lazy(() => import("./features/Cart"))', severity: 0.6 },
      ],
    },
    {
      id: 'src/features/Cart.tsx', depth: 2, loc: 142, mtimeMs: 0, score: 0.92,
      signals: [
        { kind: 'complex-state', line: 14, detail: '3 useState + 1 useReducer + 2 useEffect — dense state', severity: 0.9 },
        { kind: 'boundary-crossing', line: 39, detail: 'fetch() to /api/checkout — implicit client→server', severity: 0.8 },
        { kind: 'recency', detail: 'Modified 2 hours ago — active work', severity: 0.7 },
      ],
    },
    {
      id: 'src/lib/api.ts', depth: 3, loc: 51, mtimeMs: 0, score: 0.78,
      signals: [
        { kind: 'high-fan-in', detail: '6 internal dependents and non-trivial logic', severity: 0.85 },
        { kind: 'boundary-crossing', line: 12, detail: 'axios base client — network boundary', severity: 0.7 },
      ],
    },
    {
      id: 'src/lib/money.ts', depth: 3, loc: 9, mtimeMs: 0, score: 0.12,
      signals: [], // trivial popular util — suppressed, not a trail marker
    },
    {
      id: 'src/components/Header.tsx', depth: 2, loc: 28, mtimeMs: 0, score: 0.2,
      signals: [],
    },
    {
      id: 'src/lib/legacy.ts', depth: null, loc: 73, mtimeMs: 0, score: 0.3,
      signals: [{ kind: 'recency', detail: 'Untouched in 9 months — possibly dead', severity: 0.4 }],
    },
  ],
}

export const mockSources: Record<string, FileContent> = {
  'src/main.tsx': {
    path: 'src/main.tsx', language: 'typescript',
    source: `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`,
  },
  'src/App.tsx': {
    path: 'src/App.tsx', language: 'typescript',
    source: `import { lazy, Suspense } from 'react'
import { Header } from './components/Header'

// Code-split the cart — only loads when the route is hit.
const Cart = lazy(() => import('./features/Cart'))

export default function App() {
  return (
    <div className="app">
      <Header />
      <Suspense fallback={<p>Loading cart…</p>}>
        <Cart />
      </Suspense>
    </div>
  )
}
`,
  },
  'src/features/Cart.tsx': {
    path: 'src/features/Cart.tsx', language: 'typescript',
    source: `import { useEffect, useReducer, useState } from 'react'
import { post } from '../lib/api'
import { formatMoney } from '../lib/money'

type Item = { id: string; price: number; qty: number }

export default function Cart() {
  const [items, setItems] = useState<Item[]>([])
  const [coupon, setCoupon] = useState('')
  const [busy, setBusy] = useState(false)
  const [state, dispatch] = useReducer(reducer, initial)

  useEffect(() => { load() }, [])
  useEffect(() => { recompute(items) }, [items, coupon])

  async function checkout() {
    setBusy(true)
    // implicit client -> server boundary
    const res = await fetch('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ items, coupon }),
    })
    setBusy(false)
    return res.ok
  }

  return <section>{/* … */}</section>
}
`,
  },
  'src/lib/api.ts': {
    path: 'src/lib/api.ts', language: 'typescript',
    source: `import axios from 'axios'

// Shared HTTP client — imported all over the app.
const client = axios.create({ baseURL: '/api' })

export function get<T>(url: string) {
  return client.get<T>(url).then((r) => r.data)
}

export function post<T>(url: string, body: unknown) {
  return client.post<T>(url, body).then((r) => r.data)
}
`,
  },
  'src/lib/money.ts': {
    path: 'src/lib/money.ts', language: 'typescript',
    source: `export function formatMoney(cents: number) {
  return '$' + (cents / 100).toFixed(2)
}
`,
  },
  'src/components/Header.tsx': {
    path: 'src/components/Header.tsx', language: 'typescript',
    source: `import { formatMoney } from '../lib/money'

export function Header({ total = 0 }: { total?: number }) {
  return <header><strong>Shop</strong> · {formatMoney(total)}</header>
}
`,
  },
  'src/lib/legacy.ts': {
    path: 'src/lib/legacy.ts', language: 'typescript',
    source: `// No one imports this anymore. Off-trail (depth = null).
export function oldCheckout() {
  throw new Error('replaced by Cart.checkout')
}
`,
  },
}
