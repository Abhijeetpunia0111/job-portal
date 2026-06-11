import { ATS_SOURCES } from '../lib/ats'

export function Card({ className = '', children }) {
  return (
    <div className={`rounded-xl border border-ink-700/60 bg-ink-850 ${className}`}>
      {children}
    </div>
  )
}

export function Button({ variant = 'default', className = '', children, ...props }) {
  const base =
    'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500/40'
  const variants = {
    default: 'bg-indigo-500 hover:bg-indigo-400 text-white',
    ghost: 'bg-transparent hover:bg-ink-700/60 text-slate-300',
    outline: 'border border-ink-600 hover:bg-ink-700/50 text-slate-200',
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function Input(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 ${props.className || ''}`}
    />
  )
}

export function Select(props) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 ${props.className || ''}`}
    >
      {props.children}
    </select>
  )
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  )
}

export function SourceBadge({ source }) {
  const s = ATS_SOURCES[source] || ATS_SOURCES.company
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.color + '1f', color: s.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {s.label}
    </span>
  )
}

export function StatusBadge({ status }) {
  const map = {
    active: ['#22c55e', 'Active'],
    paused: ['#f59e0b', 'Paused'],
    error: ['#ef4444', 'Error'],
  }
  const [color, label] = map[status] || map.active
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

export function Pill({ children }) {
  return (
    <span className="rounded-md bg-ink-700/60 px-2 py-0.5 text-xs text-slate-300">{children}</span>
  )
}
