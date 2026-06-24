import { create } from 'zustand'

export interface SavedPolicy {
  name: string
  size: number
  created: number
}

export interface SavedBlocks {
  name: string
  created: number
}

interface PersistenceState {
  policies: SavedPolicy[]
  blocks: SavedBlocks[]
  loading: boolean
  error: string | null

  // Policy management
  loadPolicies: () => Promise<void>
  deletePolicy: (name: string) => Promise<void>

  // Block management
  loadBlocks: () => Promise<void>
  saveBlocks: (name: string, blocks: any[]) => Promise<void>
  deleteBlocks: (name: string) => Promise<void>
  loadBlockConfig: (name: string) => Promise<any[] | null>

  setError: (error: string | null) => void
}

const API_URL = 'http://localhost:8000'

export const usePersistenceStore = create<PersistenceState>((set, get) => ({
  policies: [],
  blocks: [],
  loading: false,
  error: null,

  loadPolicies: async () => {
    set({ loading: true, error: null })
    try {
      const res = await fetch(`${API_URL}/policies`)
      const data = await res.json()
      set({ policies: data.policies || [] })
    } catch (e) {
      set({ error: `Failed to load policies: ${String(e)}` })
    } finally {
      set({ loading: false })
    }
  },

  deletePolicy: async (name: string) => {
    set({ error: null })
    try {
      const res = await fetch(`${API_URL}/policies/${name}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        await get().loadPolicies()
      } else {
        set({ error: data.message })
      }
    } catch (e) {
      set({ error: `Failed to delete policy: ${String(e)}` })
    }
  },

  loadBlocks: async () => {
    set({ loading: true, error: null })
    try {
      const res = await fetch(`${API_URL}/blocks`)
      const data = await res.json()
      set({ blocks: data.blocks || [] })
    } catch (e) {
      set({ error: `Failed to load blocks: ${String(e)}` })
    } finally {
      set({ loading: false })
    }
  },

  saveBlocks: async (name: string, blocks: any[]) => {
    set({ error: null })
    try {
      const res = await fetch(`${API_URL}/blocks/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
      })
      const data = await res.json()
      if (data.success) {
        await get().loadBlocks()
      } else {
        set({ error: data.error })
      }
    } catch (e) {
      set({ error: `Failed to save blocks: ${String(e)}` })
    }
  },

  deleteBlocks: async (name: string) => {
    set({ error: null })
    try {
      const res = await fetch(`${API_URL}/blocks/${name}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        await get().loadBlocks()
      } else {
        set({ error: data.message })
      }
    } catch (e) {
      set({ error: `Failed to delete blocks: ${String(e)}` })
    }
  },

  loadBlockConfig: async (name: string) => {
    try {
      const res = await fetch(`${API_URL}/blocks/${name}`)
      const data = await res.json()
      if (data.error) {
        set({ error: data.error })
        return null
      }
      return data.blocks
    } catch (e) {
      set({ error: `Failed to load block config: ${String(e)}` })
      return null
    }
  },

  setError: (error) => set({ error }),
}))
