export type AgentRow = {
  id: string
  promptNo: number
  type: string
  model: string
  description: string
  tokens: number
  isDone: boolean
}

export type Slice = { name: string; tokens: number }

export type Limit = { used: number; resetsAt: number | null }

export type Panel = 'none' | 'compact' | 'agents'
export type SmartMode = 'none' | 'mild' | 'aggressive'
export type CacheMode = 'ping' | 'compact' | 'ignore'
export type Ttl = '5m' | '1h'

declare module 'claude-code' {
  interface PluginState {
    'context-cockpit': {
      percent: number | null
      tokens: number | null
      windowSize: number | null
      cost: number | null
      model: string
      breakdown: Slice[]
      panel: Panel
      isAutoOn: boolean
      threshold: number
      smartMode: SmartMode
      smartMin: number
      cacheMode: CacheMode
      ttl: Ttl
      lastResponseAt: number | null
      nowMs: number
      pings: number
      note: string
      agents: AgentRow[]
      promptNo: number
      fiveHour: Limit | null
      sevenDay: Limit | null
    }
  }
}
