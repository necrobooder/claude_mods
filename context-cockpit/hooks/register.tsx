import { atom, read, update } from 'claude-code'
import type { Register, SessionCompactResult, SessionUsage } from 'claude-code'

import type { AgentRow, CacheMode, Panel, SmartMode, Ttl } from '../types'

const percent = atom({ plugin: 'context-cockpit', key: 'percent' } as const, null)
const tokens = atom({ plugin: 'context-cockpit', key: 'tokens' } as const, null)
const windowSize = atom({ plugin: 'context-cockpit', key: 'windowSize' } as const, null)
const cost = atom({ plugin: 'context-cockpit', key: 'cost' } as const, null)
const model = atom({ plugin: 'context-cockpit', key: 'model' } as const, '')
const breakdown = atom({ plugin: 'context-cockpit', key: 'breakdown' } as const, [])
const panel = atom({ plugin: 'context-cockpit', key: 'panel' } as const, 'none')
const isAutoOn = atom({ plugin: 'context-cockpit', key: 'isAutoOn' } as const, true)
const threshold = atom({ plugin: 'context-cockpit', key: 'threshold' } as const, 70)
const smartMode = atom({ plugin: 'context-cockpit', key: 'smartMode' } as const, 'none')
const smartMin = atom({ plugin: 'context-cockpit', key: 'smartMin' } as const, 30)
const cacheMode = atom({ plugin: 'context-cockpit', key: 'cacheMode' } as const, 'compact')
const ttl = atom({ plugin: 'context-cockpit', key: 'ttl' } as const, '1h')
const lastResponseAt = atom({ plugin: 'context-cockpit', key: 'lastResponseAt' } as const, null)
const nowMs = atom({ plugin: 'context-cockpit', key: 'nowMs' } as const, 0)
const pings = atom({ plugin: 'context-cockpit', key: 'pings' } as const, 0)
const note = atom({ plugin: 'context-cockpit', key: 'note' } as const, '')
const agents = atom({ plugin: 'context-cockpit', key: 'agents' } as const, [], {
  shape: 'agents-1',
})
const promptNo = atom({ plugin: 'context-cockpit', key: 'promptNo' } as const, 0)
const fiveHour = atom({ plugin: 'context-cockpit', key: 'fiveHour' } as const, null)
const sevenDay = atom({ plugin: 'context-cockpit', key: 'sevenDay' } as const, null)

// The engine's calls the shared helpers need, written out where `$` is in
// scope (session.start), so no helper ever takes `$` itself.
type Io = {
  usage: () => Promise<SessionUsage>
  model: () => Promise<string>
  now: () => Promise<number>
  compact: (instructions: string) => Promise<SessionCompactResult>
  ask: (prompt: string) => Promise<{ isAnswered: boolean; text: string }>
  sleep: (ms: number) => Promise<unknown>
  resubmit: (text: string) => Promise<unknown>
  setNote: (text: string) => Promise<unknown>
  setLast: (ms: number | null) => Promise<unknown>
  setNow: (ms: number) => Promise<unknown>
  setPings: (count: number) => Promise<unknown>
  setUsage: (usage: SessionUsage, current: string) => Promise<unknown>
  snapshot: () => Promise<{
    pct: number | null
    last: number | null
    auto: boolean
    limit: number
    mode: CacheMode
    life: Ttl
    sent: number
  }>
}

const KEEP =
  'Keep the current goal, decisions made, file paths and open questions. Drop tool output dumps, dead ends and exploration that led nowhere.'

const FAMILY_COLOR: Record<string, string> = {
  opus: '#2f54eb',
  sonnet: '#4096ff',
  haiku: '#91d5ff',
  fable: '#b37feb',
  other: '#8b949e',
}
const FLAME = '#f0883e'
const MODE_COLOR: Record<CacheMode, string> = {
  ping: FLAME,
  compact: '#6fcf97',
  ignore: '#6e7681',
}
const MODE_NAME: Record<CacheMode, string> = { ping: 'Ping', compact: 'Compact', ignore: 'Ignore' }
const MODE_NEXT: Record<CacheMode, CacheMode> = { ping: 'compact', compact: 'ignore', ignore: 'ping' }
const GREEN = '#3fb950'
const AMBER = '#d29922'
const RED = '#f85149'
const GRAY = '#8b949e'
const ICE = '#8fc9ff'

const familyOf = (id: string) =>
  /haiku/i.test(id)
    ? 'haiku'
    : /sonnet/i.test(id)
      ? 'sonnet'
      : /opus/i.test(id)
        ? 'opus'
        : /fable/i.test(id)
          ? 'fable'
          : 'other'

const k = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : `${Math.round(n)}`

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

const span = (ms: number) => {
  const minutes = Math.max(1, Math.ceil(ms / 60000))

  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`
}

const minutesOnly = (ms: number) => `${Math.max(1, Math.ceil(ms / 60000))}m`

const ring = (p: number, color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="22" height="22">` +
  `<circle cx="22" cy="22" r="18" fill="none" stroke="#888" stroke-opacity="0.3" stroke-width="3.5"/>` +
  `<circle cx="22" cy="22" r="18" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" pathLength="100" stroke-dasharray="${p} 100" transform="rotate(-90 22 22)"/>` +
  `<text x="22" y="28" text-anchor="middle" font-size="19" font-weight="800" font-family="sans-serif" fill="${color}">${Math.round(p)}</text>` +
  `</svg>`

const pill = (label: string, color: string) => {
  const width = 92

  return {
    width,
    source:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 18" width="${width}" height="18">` +
      `<rect width="${width}" height="18" rx="9" fill="${color}"/>` +
      `<text x="${width / 2}" y="12.5" text-anchor="middle" font-size="11" font-weight="700" font-family="sans-serif" fill="#fff">${label}</text>` +
      `</svg>`,
  }
}

// Fixed-size drawings for text that changes, so the bar never re-lays out.
const counts = (opus: number, sonnet: number, haiku: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 18" width="60" height="18" font-family="sans-serif" font-size="14" font-weight="700" text-anchor="middle">` +
  `<text x="10" y="14" fill="${FAMILY_COLOR.opus}">${opus}</text>` +
  `<text x="30" y="14" fill="${FAMILY_COLOR.sonnet}">${sonnet}</text>` +
  `<text x="50" y="14" fill="${FAMILY_COLOR.haiku}">${haiku}</text>` +
  `</svg>`

const slot = (text: string, color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 18" width="50" height="18">` +
  `<text x="0" y="14" font-size="14" font-weight="700" font-family="sans-serif" fill="${color}">${text}</text>` +
  `</svg>`

const COLD_BLANK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 24" width="34" height="20"></svg>`

const icon = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 3 24 24" width="16" height="16">${inner}</svg>`

const FLAME_ICON = icon(
  `<g transform="translate(12 22)"><g>` +
    `<animateTransform attributeName="transform" type="scale" values="1 1;0.93 1.1;1.05 0.94;0.97 1.06;1 1" dur="0.9s" repeatCount="indefinite"/>` +
    `<g transform="translate(-12 -22)">` +
    `<path d="M12 2c.8 3.6-2.2 5-2.2 8 0 1.3.9 2.3 2.2 2.3s2.2-1 2.2-2.3c2 1.4 4 3.9 4 7.2a8.2 8.2 0 0 1-16.4 0c0-3.8 2.6-6 3.8-8.8.9.9 1.4 1.8 1.4 1.8C10.4 7.6 12 5.6 12 2z" fill="${FLAME}"/>` +
    `<path d="M12 12.5c1 2 2.6 3 2.6 5a2.6 2.6 0 0 1-5.2 0c0-2 1.6-3 2.6-5z" fill="#ffd27a"><animate attributeName="opacity" values="1;0.55;1" dur="0.6s" repeatCount="indefinite"/></path>` +
    `</g></g></g>`,
)
const SNOW_ICON = (color: string) =>
  icon(
    `<g stroke="${color}" stroke-width="2" stroke-linecap="round" fill="none"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.8L12 6.3l2.5-2.5M9.5 20.2L12 17.7l2.5 2.5M2.8 10.2l3.4.9-.9 3.4M21.2 13.8l-3.4-.9.9-3.4M2.8 13.8l3.4-.9-.9-3.4M21.2 10.2l-3.4.9.9 3.4"/></g>`,
  )

const COLD_ALERT =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 24" width="34" height="20">` +
  `<g><animateTransform attributeName="transform" type="rotate" values="-14 10 12;14 10 12;-14 10 12" dur="0.7s" repeatCount="indefinite"/>` +
  `<rect x="8" y="2" width="4" height="12" rx="2" fill="${RED}"/><circle cx="10" cy="19" r="2.6" fill="${RED}"/></g>` +
  `<text x="22" y="19" font-size="18" fill="${ICE}">❄</text>` +
  `</svg>`

const tallyBy = (rows: readonly AgentRow[]) => {
  const out: Record<string, { count: number; tokens: number }> = {}

  for (const row of rows) {
    const family = familyOf(row.model)
    const slot = out[family] ?? { count: 0, tokens: 0 }
    out[family] = { count: slot.count + 1, tokens: slot.tokens + row.tokens }
  }

  return out
}

export const register: Register = (on, options) => {
  const opt = (key: string, fallback: number) => {
    const value = Number((options as Record<string, unknown>)[key])

    return Number.isFinite(value) && value > 0 ? value : fallback
  }
  const optText = (key: string, fallback: string) => {
    const value = (options as Record<string, unknown>)[key]

    return typeof value === 'string' && value !== '' ? value : fallback
  }
  const lifeMs = (life: Ttl) => (life === '5m' ? 300000 : 3600000)
  const leadMs = () => opt('leadSeconds', 90) * 1000
  const preColdFloor = () => opt('preColdCompactPercent', 20)
  const pingCap = () => opt('pingMax', 12)

  let io: Io | null = null
  let isBusy = false
  let isTurnRunning = false
  let pendingAuto = false
  let compactedFor: number | null = null
  let lastPingTry = 0
  let noteSeq = 0

  const refresh = async () => {
    if (io === null) return

    const usage = await io.usage()
    const current = await io.model()
    await io.setUsage(usage, current)
  }

  const compactNow = async (
    why: string,
    instructions: string = KEEP,
  ): Promise<'done' | 'skipped' | 'failed' | 'busy'> => {
    const api = io

    if (api === null) return 'failed'
    if (isBusy) return 'busy'

    isBusy = true
    await api.setNote(`Compacting (${why})...`)

    try {
      const result = await api.compact(instructions)

      if (result.skip !== undefined) {
        await api.setNote(`Compact skipped: ${result.skip}`)

        return 'skipped'
      }

      const before = result.tokensBefore
      const after = result.tokensAfter
      await api.setNote(
        before !== undefined && after !== undefined
          ? `Compacted (${why}): ${k(before)} -> ${k(after)} tokens`
          : `Compacted (${why})`,
      )
      await api.setLast(null)
      await api.setPings(0)
      await refresh()

      return 'done'
    } catch {
      await api.setNote(`Compact (${why}) failed: a turn is probably running`)

      return 'failed'
    } finally {
      isBusy = false
    }
  }

  const tick = async () => {
    const api = io

    if (api === null || isBusy || isTurnRunning) return

    const now = await api.now()
    await api.setNow(now)

    const { pct, last, auto, limit, mode, life, sent } = await api.snapshot()

    if (pendingAuto && auto && pct !== null && pct >= limit) {
      const outcome = await compactNow(`auto at ${limit}%`)

      if (outcome !== 'failed' && outcome !== 'busy') pendingAuto = false

      return
    }

    if (pct !== null && pct < limit) pendingAuto = false

    if (last === null) return

    const idle = now - last
    const isNearCold = idle > lifeMs(life) - leadMs() && idle <= lifeMs(life)

    if (!isNearCold) return

    if (mode === 'ping' && sent < pingCap() && now - lastPingTry > 30000) {
      lastPingTry = now
      const reply = await api.ask('Reply with the single word: ok')

      if (reply.isAnswered) {
        await api.setLast(await api.now())
        await api.setPings(sent + 1)
      }
    }

    if (mode === 'compact' && last !== compactedFor && pct !== null) {
      compactedFor = last

      if (pct >= preColdFloor()) {
        await compactNow('before the cache goes cold')
      } else {
        await api.setNote(`Cache going cold: context ${Math.round(pct)}% is under the ${preColdFloor()}% floor, left alone`)
      }
    }
  }

  on('session.start', async ($, e, next) => {
    io = {
      usage: () => $.session.usage({ breakdown: 'summary' }),
      model: () => $.session.model(),
      now: () => $.clock.now(),
      compact: instructions => $.session.compact({ instructions }),
      ask: prompt => $.model.fork({ prompt }),
      sleep: ms => $.clock.sleep(ms),
      resubmit: text => $.prompt.submit({ text, asUser: true }),
      setNote: async text => {
        noteSeq += 1
        const mine = noteSeq
        await update($, note, () => text)

        // Routine notes fade after 15 s; failures stay until dismissed or replaced.
        if (/failed|skipped/i.test(text)) return

        void (async () => {
          await $.clock.sleep(15000)

          if (noteSeq === mine) await update($, note, () => '')
        })()
      },
      setLast: ms => update($, lastResponseAt, () => ms),
      setNow: ms => update($, nowMs, () => ms),
      setPings: count => update($, pings, () => count),
      setUsage: async (usage, current) => {
        const slices = (usage.context.breakdown?.categories ?? [])
          .filter(c => !c.isDeferred && c.tokens > 0)
          .map(c => ({ name: c.name, tokens: c.tokens }))
        await update($, percent, () => usage.context.percent ?? null)
        await update($, tokens, () => usage.context.tokens ?? null)
        await update($, windowSize, () => usage.context.window)
        await update($, cost, () => usage.cost?.usd ?? null)
        await update($, model, () => current)
        await update($, breakdown, () => slices)

        const five = usage.rateLimits.find(r => r.kind === 'five_hour')
        const seven = usage.rateLimits.find(r => r.kind === 'seven_day')
        await update($, fiveHour, () =>
          five
            ? { used: five.percentUsed, resetsAt: five.resetsAt ? Date.parse(five.resetsAt) : null }
            : null,
        )
        await update($, sevenDay, () =>
          seven
            ? { used: seven.percentUsed, resetsAt: seven.resetsAt ? Date.parse(seven.resetsAt) : null }
            : null,
        )
      },
      snapshot: async () => ({
        pct: await read($, percent),
        last: await read($, lastResponseAt),
        auto: await read($, isAutoOn),
        limit: await read($, threshold),
        mode: await read($, cacheMode),
        life: await read($, ttl),
        sent: await read($, pings),
      }),
    }

    const savedLimit = await $.store.get('threshold')
    const savedAuto = await $.store.get('isAutoOn')
    const savedSmart = await $.store.get('smartMode')
    const savedMin = await $.store.get('smartMin')
    const savedMode = await $.store.get('cacheMode')
    const savedTtl = await $.store.get('ttl')
    const startLimit = typeof savedLimit === 'number' ? savedLimit : opt('autoCompactPercent', 70)
    const startMin = typeof savedMin === 'number' ? savedMin : opt('smartMinPercent', 30)
    const startTtl = savedTtl === '5m' || savedTtl === '1h' ? savedTtl : optText('cacheTtl', '1h')
    await update($, threshold, () => clamp(startLimit, 30, 95))
    await update($, isAutoOn, () => (typeof savedAuto === 'boolean' ? savedAuto : true))
    await update($, smartMode, () =>
      savedSmart === 'mild' || savedSmart === 'aggressive' ? savedSmart : 'none',
    )
    await update($, smartMin, () => clamp(startMin, 10, 90))
    await update($, cacheMode, () =>
      savedMode === 'ping' || savedMode === 'ignore' ? savedMode : 'compact',
    )
    await update($, ttl, () => (startTtl === '5m' ? '5m' : '1h'))
    await update($, nowMs, () => 0)
    await update($, pings, () => 0)
    await refresh()
    $.clock.every(5000, () => {
      void tick()
    })

    return next(e)
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    await update($, ttl, () => (e.cache_ttl === '5m' ? '5m' : '1h'))
    await $.store.set('ttl', e.cache_ttl)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const isReal = !e.command && !e.isMeta && e.origin.kind !== 'plugin'

    if (!isReal) return next(e)

    await update($, promptNo, n => n + 1)

    const mode = await read($, smartMode)
    const pct = await read($, percent)
    const floor = await read($, smartMin)

    if (mode === 'none' || pct === null || pct < floor || e.attachments !== undefined) {
      return next(e)
    }

    const messages = await $.session.messages()

    if (!Array.isArray(messages) || messages.length === 0) return next(e)

    const tail = messages
      .slice(-14)
      .map(m => `${m.role}: ${String(m.text).slice(0, 280)}`)
      .join('\n')
    const rule =
      mode === 'mild'
        ? `Answer COMPACT only if the next message clearly starts unrelated work and nearly all of the existing context is irrelevant to it.`
        : `Answer COMPACT if a large part of the existing context (finished tasks, resolved threads, old tool output) is not needed for the next message; answer KEEP only if the message depends on most of it.`
    const ask =
      `You judge whether a coding assistant's conversation context is still needed for the user's next message.\n\n` +
      `Recent conversation (truncated):\n${tail}\n\nNext user message:\n${e.text.slice(0, 800)}\n\n` +
      `The context window is ${Math.round(pct)}% full. ${rule} Reply with ONE line: ` +
      `"COMPACT: <reason, at most 14 words>" or "KEEP: <reason>".`
    const verdict = await $.model.complete({
      model: optText('smartModel', 'haiku'),
      prompt: ask,
      maxTokens: 60,
      timeoutMs: 8000,
    })

    if (verdict.isAnswered && /^\s*COMPACT/i.test(verdict.text)) {
      const reason = verdict.text.replace(/^\s*COMPACT:?\s*/i, '').trim() || 'context not needed'
      const text = e.text
      const why = `smart ${mode}: ${reason}`
      const instructions = `${KEEP} The user's next task: ${text.slice(0, 300)}`

      // A compact is refused while a turn runs, and a submit is a turn starting: drop the
      // prompt here, compact once this hook has returned, then send the same text again.
      void (async () => {
        const api = io

        if (api === null) return

        let outcome = await compactNow(why, instructions)

        for (let tries = 0; tries < 6 && (outcome === 'failed' || outcome === 'busy'); tries++) {
          await api.sleep(500)
          outcome = await compactNow(why, instructions)
        }

        await api.resubmit(text)
      })()

      return { drop: `Compacting first (${reason}); your message is sent right after.` }
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      isTurnRunning = true

      const now = await $.clock.now()
      await update($, lastResponseAt, () => now)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId === undefined) {
      isTurnRunning = false
      compactedFor = null

      const now = await $.clock.now()
      await update($, lastResponseAt, () => now)
      await update($, pings, () => 0)
      await refresh()

      const auto = await read($, isAutoOn)
      const limit = await read($, threshold)
      const pct = await read($, percent)

      if (auto && pct !== null && pct >= limit) pendingAuto = true
    } else {
      const usage = e.usage
      const total = usage
        ? usage.input_tokens +
          usage.output_tokens +
          usage.cache_read_input_tokens +
          usage.cache_creation_input_tokens
        : 0
      const id = e.agentId
      await update($, agents, list =>
        list.map(row => (row.id === id ? { ...row, tokens: row.tokens + total, isDone: true } : row)),
      )
    }

    return done
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)

    if (started.deny !== undefined) return started

    const row: AgentRow = {
      id: started.agentId ?? e.tool_use_id,
      promptNo: await read($, promptNo),
      type: e.subagentType,
      model: started.model,
      description: e.description,
      tokens: 0,
      isDone: false,
    }
    await update($, agents, list => [...list, row].slice(-200))

    return started
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.hasSurvey) return next(e)

    const { Box, Text, Button, Svg } = $.ui.resolve(e)
    const pct = await read($, percent)
    const used = await read($, tokens)
    const win = await read($, windowSize)
    const usd = await read($, cost)
    const slices = await read($, breakdown)
    const open = await read($, panel)
    const auto = await read($, isAutoOn)
    const limit = await read($, threshold)
    const smart = await read($, smartMode)
    const floor = await read($, smartMin)
    const mode = await read($, cacheMode)
    const life = await read($, ttl)
    const last = await read($, lastResponseAt)
    const now = await read($, nowMs)
    const sent = await read($, pings)
    const message = await read($, note)
    const rows = await read($, agents)
    const thisPrompt = await read($, promptNo)
    const five = await read($, fiveHour)
    const seven = await read($, sevenDay)

    const clockNow = now === 0 ? Date.now() : now
    const WEEK = 7 * 24 * 3600000
    // Linear projection of the window's usage at its reset, at the pace so far.
    const projectedAt = (limitUsed: number, resetsAt: number | null, windowMs: number) => {
      if (resetsAt === null) return limitUsed

      const elapsed = clamp(windowMs - (resetsAt - clockNow), windowMs * 0.03, windowMs)

      return (limitUsed * windowMs) / elapsed
    }
    const sevenProjected = seven === null ? null : projectedAt(seven.used, seven.resetsAt, WEEK)
    const sevenTone =
      seven === null || sevenProjected === null
        ? GRAY
        : seven.used >= 100 || sevenProjected >= 110
          ? RED
          : sevenProjected >= 95
            ? AMBER
            : GREEN
    const fiveTone =
      five === null ? GRAY : five.used >= 100 ? RED : five.used >= 80 ? AMBER : GREEN
    const resetIn = (limit: { resetsAt: number | null } | null) =>
      limit === null || limit.resetsAt === null ? '' : `resets in ${span(limit.resetsAt - clockNow)}`

    const tone = pct === null ? GRAY : pct >= limit ? RED : pct >= limit - 20 ? AMBER : GREEN

    const deadline = last === null ? null : last + lifeMs(life)
    const isCold = deadline !== null && now !== 0 && now > deadline
    const isWarm = deadline !== null && !isCold

    const lastTally = tallyBy(rows.filter(row => row.promptNo === thisPrompt))
    const allTally = tallyBy(rows)
    const count = (family: string) => lastTally[family]?.count ?? 0

    const togglePanel = (which: Panel) => update($, panel, p => (p === which ? 'none' : which))
    const stepLimit = async (delta: number) => {
      const value = clamp((await read($, threshold)) + delta, 30, 95)
      await update($, threshold, () => value)
      await $.store.set('threshold', value)
    }
    const stepFloor = async (delta: number) => {
      const value = clamp((await read($, smartMin)) + delta, 10, 90)
      await update($, smartMin, () => value)
      await $.store.set('smartMin', value)
    }
    const flipAuto = async () => {
      const value = !(await read($, isAutoOn))
      await update($, isAutoOn, () => value)
      await $.store.set('isAutoOn', value)
    }
    const pickSmart = async (value: SmartMode) => {
      await update($, smartMode, () => value)
      await $.store.set('smartMode', value)
    }
    const cycleMode = async () => {
      const value = MODE_NEXT[await read($, cacheMode)]
      await update($, cacheMode, () => value)
      await $.store.set('cacheMode', value)
      await update($, pings, () => 0)
    }
    const flipTtl = async () => {
      const value: Ttl = (await read($, ttl)) === '1h' ? '5m' : '1h'
      await update($, ttl, () => value)
      await $.store.set('ttl', value)
    }

    const bar = (id: string) => (
      <Text key={id} dimColor weight="bold">
        |
      </Text>
    )
    const modeLabel = mode === 'ping' ? `${MODE_NAME[mode]} ${sent}/${pingCap()}` : MODE_NAME[mode]
    const modePill = pill(modeLabel, MODE_COLOR[mode])

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2} alignItems="center" flexWrap="wrap">
          <Box flexDirection="row" gap={1} alignItems="center">
            <Box key="gauge" hover={{ scope: 'ctx' }}>
              <Svg
                source={ring(pct ?? 0, tone)}
                alt={`Context ${pct === null ? 'unknown' : Math.round(pct)} percent`}
                width={22}
                height={22}
              />
            </Box>
            <Button
              key="compact"
              label="Compact"
              variant={isCold ? 'primary' : 'secondary'}
              onPress={() => compactNow('manual')}
            />
            <Button
              key="more"
              label="+"
              variant={open === 'compact' ? 'primary' : 'secondary'}
              onPress={() => togglePanel('compact')}
            />
            <Svg
              source={isCold ? COLD_ALERT : COLD_BLANK}
              alt={isCold ? 'Cache is cold: compacting is a good idea' : ''}
              width={34}
              height={20}
              isInteractive={isCold}
            />
          </Box>

          {bar('g1')}
          <Box flexDirection="row" gap={1} alignItems="center">
            <Svg
              source={counts(count('opus'), count('sonnet'), count('haiku'))}
              alt={`Subagents last prompt: ${count('opus')} Opus, ${count('sonnet')} Sonnet, ${count('haiku')} Haiku`}
              width={60}
              height={18}
            />
            <Button
              key="agents"
              plain
              dimColor
              label={open === 'agents' ? '▴' : '▾'}
              onPress={() => togglePanel('agents')}
            />
          </Box>

          {bar('g2')}
          <Box flexDirection="row" gap={1} alignItems="center">
            <Button key="ttl" plain dimColor label={life} onPress={() => flipTtl()} />
            <Svg
              source={isWarm ? FLAME_ICON : SNOW_ICON(isCold ? ICE : GRAY)}
              alt={isWarm ? 'Cache warm' : isCold ? 'Cache cold' : 'No cache yet'}
              width={16}
              height={16}
              isInteractive={isWarm}
            />
            <Svg
              source={slot(isWarm && deadline !== null ? minutesOnly(deadline - now) : '', FLAME)}
              alt={isWarm && deadline !== null ? `Cache warm for ${minutesOnly(deadline - now)}` : ''}
              width={50}
              height={18}
            />
            <Svg
              source={modePill.source}
              alt={`Cache mode ${modeLabel}`}
              width={modePill.width}
              height={18}
            />
            <Button key="mode" plain dimColor label="⇄" onPress={() => cycleMode()} />
          </Box>
          {bar('g3')}
          <Box flexDirection="row" gap={1} alignItems="center">
            <Box key="lim5" hover={{ scope: 'lim5' }} flexDirection="row" gap={1} alignItems="center">
              <Svg
                source={ring(five?.used ?? 0, fiveTone)}
                alt={`Session limit ${five === null ? 'unknown' : Math.round(five.used)} percent used`}
                width={22}
                height={22}
              />
            </Box>
            <Box key="lim7" hover={{ scope: 'lim7' }} flexDirection="row" gap={1} alignItems="center">
              <Svg
                source={ring(seven?.used ?? 0, sevenTone)}
                alt={`Weekly limit ${seven === null ? 'unknown' : Math.round(seven.used)} percent used`}
                width={22}
                height={22}
              />
            </Box>
          </Box>
        </Box>

        <Box
          key="lim-tip"
          display="none"
          hover={{ display: 'flex', scope: 'lim5' }}
          flexDirection="row"
          gap={1}
        >
          <Text weight="bold">
            Session (5h): {five === null ? 'no reading yet' : `${Math.round(five.used)}% used  |  ${resetIn(five)}`}
          </Text>
        </Box>
        <Box
          key="lim7-tip"
          display="none"
          hover={{ display: 'flex', scope: 'lim7' }}
          flexDirection="row"
          gap={1}
        >
          <Text weight="bold">
            Week: {seven === null || sevenProjected === null ? 'no reading yet' : `${Math.round(seven.used)}% used  |  heading for ${Math.round(sevenProjected)}% at reset  |  ${resetIn(seven)}`}
          </Text>
        </Box>

        <Box
          key="ctx-tip"
          display="none"
          hover={{ display: 'flex', scope: 'ctx' }}
          flexDirection="column"
          borderStyle="round"
          borderColor={tone}
          paddingX={1}
        >
          <Text weight="bold">
            Context {used === null || win === null ? '' : `${k(used)} / ${k(win)}`}
            {usd === null ? '' : `  |  $${usd.toFixed(2)} this session`}
          </Text>
          {slices.map(slice => (
            <Box key={slice.name} flexDirection="row" gap={2} justifyContent="space-between">
              <Text dimColor weight="bold">
                {slice.name}
              </Text>
              <Text weight="bold" tabular>
                {k(slice.tokens)}
              </Text>
            </Box>
          ))}
        </Box>

        {open === 'compact' ? (
          <Box
            flexDirection="row"
            gap={1}
            alignItems="center"
            flexWrap="wrap"
            borderStyle="round"
            borderColor={ICE}
            paddingX={1}
          >
              <Text weight="bold">Auto</Text>
              <Button key="auto" label={auto ? 'On' : 'Off'} variant={auto ? 'primary' : 'secondary'} onPress={() => flipAuto()} />
              {bar('c1')}
              <Text dimColor weight="bold">at context</Text>
              <Button key="less" label="-" onPress={() => stepLimit(-5)} />
              <Text weight="bold" tabular>{limit}</Text>
              <Button key="plus" label="+" onPress={() => stepLimit(5)} />
              {bar('c3')}
              <Text weight="bold">Smart</Text>
              <Button key="smart-none" label="None" variant={smart === 'none' ? 'primary' : 'secondary'} onPress={() => pickSmart('none')} />
              <Button key="smart-mild" label="Mild" variant={smart === 'mild' ? 'primary' : 'secondary'} onPress={() => pickSmart('mild')} />
              <Button key="smart-aggressive" label="Aggressive" variant={smart === 'aggressive' ? 'primary' : 'secondary'} onPress={() => pickSmart('aggressive')} />
              {bar('c2')}
              <Text dimColor weight="bold">above</Text>
              <Button key="floor-less" label="-" onPress={() => stepFloor(-5)} />
              <Text weight="bold" tabular>{floor}</Text>
              <Button key="floor-more" label="+" onPress={() => stepFloor(5)} />
          </Box>
        ) : null}

        {open === 'agents' ? (
          <Box
            flexDirection="column"
            rowGap="sm"
            borderStyle="round"
            borderColor={ICE}
            paddingX={1}
            paddingY="sm"
          >
            <Box flexDirection="row" justifyContent="space-between" alignItems="center">
              <Text weight="bold">Subagents this session: {rows.length}</Text>
              <Button key="close-agents" plain dimColor label="close" onPress={() => update($, panel, () => 'none')} />
            </Box>
            {['opus', 'sonnet', 'haiku', 'fable', 'other']
              .filter(family => allTally[family] !== undefined)
              .map(family => (
                <Box key={family} flexDirection="row" gap={2}>
                  <Text color={FAMILY_COLOR[family]} weight="bold">{family}</Text>
                  <Text weight="bold" tabular>{allTally[family]?.count ?? 0} agents</Text>
                  <Text dimColor weight="bold" tabular>{k(allTally[family]?.tokens ?? 0)} tokens</Text>
                </Box>
              ))}
            {rows.length === 0 ? <Text dimColor weight="bold">No subagents yet.</Text> : null}
            {[...rows]
              .reverse()
              .slice(0, 8)
              .map(row => (
                <Box key={row.id} flexDirection="row" gap={1}>
                  <Text dimColor weight="bold">#{row.promptNo}</Text>
                  <Text color={FAMILY_COLOR[familyOf(row.model)]} weight="bold">{familyOf(row.model)}</Text>
                  <Text dimColor weight="bold">{row.type}</Text>
                  <Text wrap="truncate-end" weight="bold">{row.description}</Text>
                  <Text dimColor weight="bold">{k(row.tokens)} {row.isDone ? 'done' : 'running'}</Text>
                </Box>
              ))}
          </Box>
        ) : null}

        {message === '' ? null : (
          <Box flexDirection="row" gap={1} alignItems="center">
            <Button key="dismiss" plain dimColor label="×" onPress={() => update($, note, () => '')} />
            <Text dimColor weight="bold">
              {message}
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
