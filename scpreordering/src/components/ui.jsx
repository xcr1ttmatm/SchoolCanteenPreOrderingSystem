import { statusMeta } from '../lib/format'

export function Squiggle() {
  return (
    <svg className="squiggle" viewBox="0 0 168 13" fill="none" aria-hidden="true">
      <path
        d="M2 8.5c14-6.5 27 3.5 41-1.5 14-5 24 5.5 39 1 13-4 24 2 38-2 11-3.2 25 2.5 45-3"
        stroke="#C23A1E"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function StatCard({ label, value, context, tone = 'paper' }) {
  return (
    <div className={`hard-card stat-card ${tone}`}>
      <span className="tiny-label">{label}</span>
      <div className="stat-number">{value}</div>
      {context ? <p className="stat-context">{context}</p> : null}
    </div>
  )
}

export function StatusTag({ status }) {
  const meta = statusMeta[status] ?? { label: status ?? '—', tone: 'grey' }
  return <span className={`tag ${meta.tone}`}>{meta.label}</span>
}

export function ThroughputChart({ data, title = 'Orders this week' }) {
  const max = Math.max(1, ...data.map((entry) => entry.count))
  const peak = data.reduce((best, entry) => (entry.count > best.count ? entry : best), data[0] ?? { label: '—', count: 0 })
  const description = `${title}. Highest on ${peak.label} with ${peak.count} order${peak.count === 1 ? '' : 's'}.`

  return (
    <section className="hard-card" aria-label={description}>
      <span className="tiny-label">The rhythm of the week</span>
      <h2 className="section-title mt-8">{title}</h2>
      <div className="chart" role="img" aria-label={description}>
        {data.map((entry) => {
          const isPeak = entry.count === max && max > 0
          const isWeekend = ['Sat', 'Sun'].includes(entry.label)
          return (
            <div className="chart-col" key={entry.label}>
              <div
                className={`bar${isPeak ? ' peak' : isWeekend ? ' off' : ''}`}
                style={{ height: `${Math.max(6, Math.round((entry.count / max) * 150))}px` }}
                title={`${entry.label}: ${entry.count}`}
              />
              <span className="chart-label">{entry.label}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function StickyNote({ title, items }) {
  return (
    <aside className="sticky" aria-label={title}>
      <h2 className="sticky-title">{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </aside>
  )
}

export function EmptyState({ title, hint }) {
  return (
    <div className="empty">
      <p className="section-title">{title}</p>
      <p className="muted">{hint}</p>
    </div>
  )
}
