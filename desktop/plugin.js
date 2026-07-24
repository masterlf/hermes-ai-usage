import {
  haptic,
  host,
  PALETTE_AREA,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  STATUSBAR_AREAS,
  Tip,
  usePluginI18n,
  useQuery,
  useValue
} from '@hermes/plugin-sdk'
import { useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'ai-usage-monitor'
const ROUTE = '/ai-usage'
let pluginContext = null

function pluginRest(path, options) {
  if (!pluginContext) throw new Error('AI Usage Monitor is not registered')
  return pluginContext.rest(path, options)
}

function compactNumber(value) {
  const number = Number(value || 0)
  if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(1)}B`
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}k`
  return number.toLocaleString()
}

function formatDate(value) {
  if (!value) return '—'
  const numeric = Number(value)
  const date = new Date(Number.isFinite(numeric) && Math.abs(numeric) < 100_000_000_000 ? numeric * 1000 : value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date)
}

function formatBucket(value, bucket) {
  const date = new Date(Number(value || 0) * 1000)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: bucket === 'hour' ? 'short' : undefined,
    timeZone: 'UTC'
  }).format(date)
}

function sessionReference(value) {
  const sessionId = String(value || '')
  if (sessionId.length < 16) return '—'
  const reference = sessionId.slice(-12)
  return /^[A-Za-z0-9._-]{12}$/.test(reference) ? reference : '—'
}

function bindingWindow(account) {
  const candidates = (account?.windows || []).filter(window => Number.isFinite(window.remaining_percent))
  return candidates.length ? candidates.reduce((lowest, current) =>
    current.remaining_percent < lowest.remaining_percent ? current : lowest
  ) : null
}

function useAccountSnapshot() {
  const profile = useValue(host.state.profile)
  return useQuery({
    queryKey: [ID, 'account', profile],
    queryFn: () => pluginRest('/snapshot?provider=auto', { timeoutMs: 20_000 }),
    refetchInterval: 60_000,
    retry: 1
  })
}

function useSessionUsage() {
  const sessionId = useValue(host.state.activeSessionId)
  const query = useQuery({
    queryKey: [ID, 'session', sessionId],
    queryFn: () => host.request('session.usage', { session_id: sessionId }),
    enabled: Boolean(sessionId),
    refetchInterval: 5_000,
    retry: 1
  })
  return { sessionId, ...query }
}

function useHistory(days, selectedBucket) {
  const profile = useValue(host.state.profile)
  const bucketQuery = selectedBucket === null ? '' : `&bucket_start=${encodeURIComponent(String(selectedBucket))}`
  return useQuery({
    queryKey: [ID, 'history', profile, days, selectedBucket],
    queryFn: () => pluginRest(`/history?days=${days}&limit=200${bucketQuery}`, { timeoutMs: 10_000 }),
    refetchInterval: 30_000,
    retry: 1
  })
}

function Progress({ percent }) {
  const safe = Math.max(0, Math.min(100, Number(percent || 0)))
  return jsx('div', {
    className: 'h-1.5 w-full overflow-hidden rounded-full bg-(--ui-stroke-secondary)',
    children: jsx('div', {
      className: 'h-full rounded-full bg-(--ui-accent) transition-[width]',
      style: { width: `${safe}%` }
    })
  })
}

function StatusChip() {
  const t = usePluginI18n(ID)
  const accountQuery = useAccountSnapshot()
  const sessionQuery = useSessionUsage()
  const account = accountQuery.data?.account
  const quotaWindow = bindingWindow(account)
  const remaining = quotaWindow ? `${Math.round(quotaWindow.remaining_percent)}%` : '—'
  const tokens = sessionQuery.data?.total ? compactNumber(sessionQuery.data.total) : '0'

  return jsx(Tip, {
    label: t('chipTip', remaining, tokens),
    children: jsx('button', {
      className: [
        'inline-flex h-full items-center gap-1.5 px-1.5 text-[0.6875rem] transition-colors',
        'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
      ].join(' '),
      type: 'button',
      onClick: () => {
        haptic('tap')
        host.navigate(ROUTE)
      },
      children: `AI ${remaining} · ${tokens} tok`
    })
  })
}

function AccountCard({ account }) {
  const t = usePluginI18n(ID)
  if (!account?.available) {
    return jsxs('section', {
      className: 'rounded-md border border-(--ui-stroke-secondary) p-3',
      children: [
        jsx('h2', { className: 'font-medium', children: t('accountTitle') }),
        jsx('p', {
          className: 'mt-2 text-sm text-(--ui-text-tertiary)',
          children: account?.reason || t('quotaUnavailable')
        })
      ]
    })
  }

  return jsxs('section', {
    className: 'rounded-md border border-(--ui-stroke-secondary) p-3',
    children: [
      jsxs('div', {
        className: 'flex items-start justify-between gap-3',
        children: [
          jsxs('div', {
            children: [
              jsx('h2', { className: 'font-medium', children: t('accountTitle') }),
              jsx('p', {
                className: 'text-xs text-(--ui-text-tertiary)',
                children: `${account.provider}${account.plan ? ` · ${account.plan}` : ''}`
              })
            ]
          }),
          jsx('span', {
            className: 'text-xs text-(--ui-text-quaternary)',
            children: formatDate(account.fetched_at)
          })
        ]
      }),
      jsx('div', {
        className: 'mt-3 grid gap-3',
        children: (account.windows || []).map((quotaWindow, index) => jsxs('div', {
          className: 'grid gap-1',
          children: [
            jsxs('div', {
              className: 'flex items-center justify-between text-sm',
              children: [
                jsx('span', { children: quotaWindow.label }),
                jsx('strong', {
                  children: Number.isFinite(quotaWindow.remaining_percent)
                    ? t('remaining', Math.round(quotaWindow.remaining_percent))
                    : '—'
                })
              ]
            }),
            jsx(Progress, { percent: quotaWindow.used_percent }),
            jsx('div', {
              className: 'text-xs text-(--ui-text-quaternary)',
              children: quotaWindow.reset_at ? t('resets', formatDate(quotaWindow.reset_at)) : quotaWindow.detail || ''
            })
          ],
          key: `${quotaWindow.label}-${index}`
        }))
      }),
      (account.details || []).length ? jsx('div', {
        className: 'mt-3 text-xs text-(--ui-text-tertiary)',
        children: account.details.join(' · ')
      }) : null,
      account.provider === 'openai-codex' ? jsx('p', {
        className: 'mt-3 text-xs text-(--ui-text-quaternary)',
        children: t('codexCaveat')
      }) : null
    ]
  })
}

function SessionCard({ usage, sessionId }) {
  const t = usePluginI18n(ID)
  const rows = [
    [t('input'), usage?.input],
    [t('output'), usage?.output],
    [t('reasoning'), usage?.reasoning],
    [t('apiCalls'), usage?.calls],
    [t('context'), usage?.context_max
      ? `${compactNumber(usage.context_used)} / ${compactNumber(usage.context_max)} (${Math.max(0, Math.min(100, Number(usage.context_percent || 0)))}%)`
      : '—']
  ]
  return jsxs('section', {
    className: 'rounded-md border border-(--ui-stroke-secondary) p-3',
    children: [
      jsx('h2', { className: 'font-medium', children: t('sessionTitle') }),
      jsx('p', {
        className: 'text-xs text-(--ui-text-quaternary)',
        children: sessionId ? sessionReference(sessionId) : t('noActiveSession')
      }),
      jsx('div', {
        className: 'mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm',
        children: rows.flatMap(([label, value]) => [
          jsx('span', { className: 'text-(--ui-text-tertiary)', children: label, key: `${label}-l` }),
          jsx('span', { className: 'text-right tabular-nums', children: typeof value === 'number' ? compactNumber(value) : value || '0', key: `${label}-v` })
        ])
      })
    ]
  })
}

function UsageChart({ history, days, selectedBucket, onDays, onSelect }) {
  const t = usePluginI18n(ID)
  const points = history?.series?.points || []
  const width = Math.max(720, points.length * 22 + 64)
  const baseline = 182
  const chartHeight = 142
  const step = (width - 64) / Math.max(1, points.length)
  const barWidth = Math.max(4, Math.min(18, step * 0.68))
  const maximum = Math.max(1, ...points.map(point => Number(point.total_tokens || 0)))
  const labelStep = Math.max(1, Math.ceil(points.length / 7))
  const colors = {
    input: 'var(--ui-accent)',
    output: 'var(--ui-text-secondary)',
    reasoning: 'var(--ui-accent)',
    cacheRead: 'var(--ui-text-tertiary)',
    cacheWrite: 'var(--ui-text-quaternary)'
  }
  const legend = [
    ['input', t('input')],
    ['output', t('output')],
    ['reasoning', t('reasoningSubset')],
    ['cacheRead', t('cacheRead')],
    ['cacheWrite', t('cacheWrite')]
  ]

  return jsxs('section', {
    className: 'rounded-md border border-(--ui-stroke-secondary)',
    children: [
      jsxs('div', {
        className: 'flex items-end justify-between gap-3 border-b border-(--ui-stroke-secondary) p-3',
        children: [
          jsxs('div', {
            children: [
              jsx('h2', { className: 'font-medium', children: t('usageChart') }),
              jsx('p', { className: 'text-xs text-(--ui-text-tertiary)', children: t('chartHint') })
            ]
          }),
          jsx('div', {
            className: 'flex gap-1',
            children: [1, 7, 30, 90].map(period => jsx('button', {
              type: 'button',
              className: [
                'rounded border px-2 py-1 text-xs',
                period === days
                  ? 'border-(--ui-accent) text-foreground'
                  : 'border-(--ui-stroke-secondary) text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)'
              ].join(' '),
              onClick: () => onDays(period),
              children: period === 1 ? '24h' : `${period}d`
            }, period))
          })
        ]
      }),
      points.length ? jsx('div', {
        className: 'overflow-x-auto px-2 pt-1',
        children: jsxs('svg', {
          viewBox: `0 0 ${width} 220`,
          className: 'block h-[220px] max-w-none',
          style: { width: `${width}px` },
          role: 'img',
          'aria-label': t('usageChart'),
          children: [
            jsx('line', { x1: 32, y1: baseline, x2: width - 24, y2: baseline, stroke: 'var(--ui-stroke-secondary)' }),
            ...points.map((point, index) => {
              const reasoning = Math.min(Number(point.reasoning_tokens || 0), Number(point.output_tokens || 0))
              const segments = [
                ['input', Number(point.input_tokens || 0), 1],
                ['cacheRead', Number(point.cache_read_tokens || 0), 1],
                ['cacheWrite', Number(point.cache_write_tokens || 0), 1],
                ['output', Math.max(0, Number(point.output_tokens || 0) - reasoning), 1],
                ['reasoning', reasoning, 0.58]
              ]
              const x = 32 + index * step + (step - barWidth) / 2
              let y = baseline
              const rectangles = segments.map(([name, value, opacity]) => {
                const segmentHeight = Math.max(0, value / maximum * chartHeight)
                y -= segmentHeight
                return jsx('rect', {
                  x,
                  y,
                  width: barWidth,
                  height: segmentHeight,
                  fill: colors[name],
                  opacity,
                  stroke: selectedBucket === Number(point.bucket_start) ? 'var(--ui-accent)' : 'none',
                  strokeWidth: 1.5
                }, name)
              })
              const label = formatBucket(point.bucket_start, history?.series?.bucket)
              const tooltip = `${label} · ${compactNumber(point.total_tokens)} ${t('tokens')} · ${compactNumber(point.sessions)} ${t('sessions')}`
              return jsxs('g', {
                role: 'button',
                tabIndex: 0,
                className: 'cursor-pointer opacity-80 hover:opacity-100 focus:opacity-100',
                'aria-label': tooltip,
                onClick: () => onSelect(Number(point.bucket_start)),
                onKeyDown: event => {
                  if (event.key === 'Enter' || event.key === ' ') onSelect(Number(point.bucket_start))
                },
                children: [
                  jsx('title', { children: tooltip }),
                  ...rectangles,
                  index % labelStep === 0 || index === points.length - 1 ? jsx('text', {
                    x: x + barWidth / 2,
                    y: baseline + 22,
                    textAnchor: 'middle',
                    fill: 'var(--ui-text-quaternary)',
                    fontSize: 9,
                    children: label
                  }) : null
                ]
              }, point.bucket_start)
            })
          ]
        })
      }) : jsx('p', { className: 'p-3 text-sm text-(--ui-text-tertiary)', children: t('noHistory') }),
      jsx('div', {
        className: 'flex flex-wrap gap-x-4 gap-y-2 border-t border-(--ui-stroke-secondary) p-3 text-xs text-(--ui-text-tertiary)',
        children: legend.map(([name, label]) => jsxs('span', {
          className: 'inline-flex items-center gap-1.5',
          children: [
            jsx('i', { className: 'inline-block size-2.5', style: { backgroundColor: colors[name], opacity: name === 'reasoning' ? 0.58 : 1 } }),
            label
          ]
        }, name))
      })
    ]
  })
}

function HistoryCard({ history, selectedBucket }) {
  const t = usePluginI18n(ID)
  const rows = history?.rows || []
  const totals = history?.totals || {}
  const bucketSeconds = Number(history?.series?.bucket_seconds || 86400)
  const visibleRows = selectedBucket === null
    ? rows.slice(0, 30)
    : rows.filter(row => {
        const eventTime = Number(row.ended_at || row.started_at || 0)
        return Math.floor(eventTime / bucketSeconds) * bucketSeconds === selectedBucket
      })
  return jsxs('section', {
    className: 'rounded-md border border-(--ui-stroke-secondary) p-3',
    children: [
      jsxs('div', {
        className: 'flex items-end justify-between gap-3',
        children: [
          jsxs('div', {
            children: [
              jsx('h2', { className: 'font-medium', children: t('historyTitle') }),
              jsx('p', {
                className: 'text-xs text-(--ui-text-tertiary)',
                children: selectedBucket === null ? t('historySubtitle') : t('filteredHistory')
              }),
              selectedBucket !== null && history?.rows_truncated ? jsx('p', {
                className: 'mt-1 text-xs text-(--ui-accent)',
                children: t('truncatedHistory')
              }) : null
            ]
          }),
          jsx('span', {
            className: 'text-xs tabular-nums text-(--ui-text-quaternary)',
            children: `${compactNumber(totals.total_tokens)} tok · ${compactNumber(totals.api_calls)} calls`
          })
        ]
      }),
      visibleRows.length ? jsx('div', {
        className: 'mt-3 overflow-auto',
        children: jsxs('div', {
          className: 'min-w-[800px] text-xs',
          children: [
            jsxs('div', {
              className: 'grid grid-cols-[140px_1fr_90px_120px_70px_80px] gap-2 border-b border-(--ui-stroke-secondary) pb-2 text-(--ui-text-tertiary)',
              children: [t('when'), t('modelProvider'), t('source'), t('logsRef'), t('calls'), t('tokens')].map(label => jsx('span', { children: label, key: label }))
            }),
            ...visibleRows.map((row, index) => jsxs('div', {
              className: 'grid grid-cols-[140px_1fr_90px_120px_70px_80px] gap-2 border-b border-(--ui-stroke-secondary) py-2 last:border-0',
              children: [
                jsx('span', { children: formatDate(row.ended_at || row.started_at) }),
                jsx('span', { className: 'truncate', children: `${row.model || 'unknown'} · ${row.provider || 'unknown'}` }),
                jsx('span', { className: 'truncate text-(--ui-text-tertiary)', children: row.source || 'unknown' }),
                jsx('code', { className: 'select-all text-(--ui-text-secondary)', children: row.session_ref || '—' }),
                jsx('span', { className: 'text-right tabular-nums', children: compactNumber(row.api_call_count) }),
                jsx('span', {
                  className: 'text-right tabular-nums',
                  title: `${t('input')} ${compactNumber(row.input_tokens)} · ${t('output')} ${compactNumber(row.output_tokens)} · ${t('cacheRead')} ${compactNumber(row.cache_read_tokens)} · ${t('cacheWrite')} ${compactNumber(row.cache_write_tokens)}`,
                  children: compactNumber(row.total_tokens)
                })
              ],
              key: row.session_ref || `${row.ended_at || row.started_at || 'session'}-${index}`
            }))
          ]
        })
      }) : jsx('p', { className: 'mt-3 text-sm text-(--ui-text-tertiary)', children: t('noHistory') })
    ]
  })
}

function UsagePage() {
  const t = usePluginI18n(ID)
  const [days, setDays] = useState(7)
  const [selectedBucket, setSelectedBucket] = useState(null)
  const accountQuery = useAccountSnapshot()
  const sessionQuery = useSessionUsage()
  const historyQuery = useHistory(days, selectedBucket)
  const refreshing = accountQuery.isFetching || sessionQuery.isFetching || historyQuery.isFetching

  return jsxs('main', {
    className: 'h-full overflow-auto p-5',
    children: [
      jsxs('header', {
        className: 'mb-4 flex items-start justify-between gap-4',
        children: [
          jsxs('div', {
            children: [
              jsx('h1', { className: 'text-lg font-semibold', children: t('title') }),
              jsx('p', { className: 'mt-1 text-sm text-(--ui-text-tertiary)', children: t('subtitle') })
            ]
          }),
          jsx('button', {
            type: 'button',
            className: 'rounded-md border border-(--ui-stroke-secondary) px-3 py-1.5 text-xs hover:bg-(--chrome-action-hover)',
            disabled: refreshing,
            onClick: () => {
              haptic('tap')
              accountQuery.refetch()
              sessionQuery.refetch()
              historyQuery.refetch()
            },
            children: refreshing ? t('refreshing') : t('refresh')
          })
        ]
      }),
      accountQuery.error ? jsx('p', { className: 'mb-3 text-sm text-(--ui-text-tertiary)', children: t('loadError') }) : null,
      jsxs('div', {
        className: 'grid gap-4 xl:grid-cols-2',
        children: [
          jsx(AccountCard, { account: accountQuery.data?.account }),
          jsx(SessionCard, { usage: sessionQuery.data, sessionId: sessionQuery.sessionId })
        ]
      }),
      jsx('div', {
        className: 'mt-4',
        children: jsx(UsageChart, {
          history: historyQuery.data?.history,
          days,
          selectedBucket,
          onDays: value => {
            setSelectedBucket(null)
            setDays(value)
          },
          onSelect: value => setSelectedBucket(current => current === value ? null : value)
        })
      }),
      jsx('div', {
        className: 'mt-4',
        children: jsx(HistoryCard, { history: historyQuery.data?.history, selectedBucket })
      }),
      jsx('p', {
        className: 'mt-4 text-xs text-(--ui-text-quaternary)',
        children: t('dataNote')
      })
    ]
  })
}

export default {
  id: ID,
  name: 'AI Usage Monitor',
  register(ctx) {
    pluginContext = ctx
    ctx.i18n.register({
      en: {
        title: 'AI usage',
        subtitle: 'Provider quota, active-session tokens, and local Hermes history.',
        accountTitle: 'Account quota',
        sessionTitle: 'Active session',
        historyTitle: 'Recent usage',
        historySubtitle: 'Session-level history; no prompt content is read or displayed.',
        filteredHistory: 'Sessions in the selected chart bucket.',
        truncatedHistory: 'Bounded results: some sessions in this bucket are not displayed.',
        usageChart: 'Token usage',
        chartHint: 'UTC buckets · select a bar to isolate its sessions below.',
        logsRef: 'Log ref',
        quotaUnavailable: 'Account quota is unavailable for this provider.',
        codexCaveat: 'This is the Codex allowance attached to your ChatGPT subscription, not a universal percentage for ordinary ChatGPT conversations.',
        remaining: value => `${value}% remaining`,
        resets: value => `Resets ${value}`,
        input: 'Input tokens',
        output: 'Output tokens',
        reasoning: 'Reasoning tokens',
        reasoningSubset: 'Reasoning (within output)',
        cacheRead: 'Cache read',
        cacheWrite: 'Cache write',
        apiCalls: 'API calls',
        context: 'Current context',
        noActiveSession: 'No active session',
        noHistory: 'No recorded usage in this period.',
        when: 'When',
        modelProvider: 'Model · provider',
        source: 'Surface',
        calls: 'Calls',
        sessions: 'sessions',
        tokens: 'Tokens',
        refresh: 'Refresh',
        refreshing: 'Refreshing…',
        loadError: 'Usage data could not be loaded. Refresh or restart the Hermes backend.',
        chipTip: (remaining, tokens) => `${remaining} remaining · ${tokens} tokens in active session`,
        dataNote: 'Quota percentages come from the provider API when available. Token counts come from Hermes/provider responses. They are related, but they are not interchangeable.',
        open: 'Open AI usage'
      },
      fr: {
        title: 'Consommation IA',
        subtitle: 'Quota fournisseur, tokens de la session active et historique local Hermes.',
        accountTitle: 'Quota du compte',
        sessionTitle: 'Session active',
        historyTitle: 'Consommation récente',
        historySubtitle: 'Historique par session ; aucun contenu de prompt n’est lu ni affiché.',
        filteredHistory: 'Sessions du créneau sélectionné dans le graphique.',
        truncatedHistory: 'Résultats bornés : certaines sessions du créneau ne sont pas affichées.',
        usageChart: 'Utilisation des tokens',
        chartHint: 'Créneaux UTC · sélectionne une barre pour isoler ses sessions ci-dessous.',
        logsRef: 'Réf. logs',
        quotaUnavailable: 'Le quota du compte n’est pas disponible pour ce fournisseur.',
        codexCaveat: 'Il s’agit du quota Codex rattaché à ton abonnement ChatGPT, pas d’un pourcentage universel pour les conversations ChatGPT ordinaires.',
        remaining: value => `${value} % restants`,
        resets: value => `Réinitialisation ${value}`,
        input: 'Tokens en entrée',
        output: 'Tokens en sortie',
        reasoning: 'Tokens de raisonnement',
        reasoningSubset: 'Raisonnement (dans la sortie)',
        cacheRead: 'Cache lu',
        cacheWrite: 'Cache écrit',
        apiCalls: 'Appels API',
        context: 'Contexte actuel',
        noActiveSession: 'Aucune session active',
        noHistory: 'Aucune consommation enregistrée sur cette période.',
        when: 'Date',
        modelProvider: 'Modèle · fournisseur',
        source: 'Surface',
        calls: 'Appels',
        sessions: 'sessions',
        tokens: 'Tokens',
        refresh: 'Actualiser',
        refreshing: 'Actualisation…',
        loadError: 'Les données de consommation n’ont pas pu être chargées. Actualise ou redémarre le backend Hermes.',
        chipTip: (remaining, tokens) => `${remaining} restants · ${tokens} tokens dans la session active`,
        dataNote: 'Les pourcentages viennent de l’API du fournisseur lorsqu’elle existe. Les tokens viennent de Hermes et des réponses du fournisseur. Les deux sont liés, mais ne sont pas interchangeables.',
        open: 'Ouvrir la consommation IA'
      }
    })

    ctx.registerMany([
      {
        id: 'page',
        area: ROUTES_AREA,
        data: { path: ROUTE },
        render: () => jsx(UsagePage, {})
      },
      {
        id: 'nav',
        area: SIDEBAR_NAV_AREA,
        data: { path: ROUTE, label: 'AI Usage', codicon: 'pulse' }
      },
      {
        id: 'chip',
        area: STATUSBAR_AREAS.right,
        order: 118,
        render: () => jsx(StatusChip, {})
      },
      {
        id: 'open',
        area: PALETTE_AREA,
        data: {
          id: 'ai-usage.open',
          label: 'Open AI usage',
          keywords: ['tokens', 'quota', 'usage', 'chatgpt', 'codex'],
          run: () => host.navigate(ROUTE)
        }
      }
    ])
  }
}
