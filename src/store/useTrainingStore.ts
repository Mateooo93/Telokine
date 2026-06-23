import { create } from 'zustand'

export type TrainingStatus = 'idle' | 'training' | 'done' | 'error'

export interface TelemetryPoint {
  step: number
  reward: number
  success: number
}

interface TrainingState {
  status: TrainingStatus
  progress: number // 0..1
  totalTimesteps: number
  history: TelemetryPoint[]
  episodes: number
  elapsed: number
  /** Filename of the trained policy (without extension) — used by Run. */
  policyName: string | null
  error: string | null

  onStarted: (totalTimesteps: number) => void
  onTelemetry: (p: { step: number; reward: number; success_rate: number; episode: number; elapsed: number; progress: number }) => void
  onDone: () => void
  setError: (e: string | null) => void
  reset: () => void
}

export const useTrainingStore = create<TrainingState>((set) => ({
  status: 'idle',
  progress: 0,
  totalTimesteps: 0,
  history: [],
  episodes: 0,
  elapsed: 0,
  policyName: null,
  error: null,

  onStarted: (totalTimesteps) =>
    set({ status: 'training', progress: 0, totalTimesteps, history: [], episodes: 0, elapsed: 0, error: null }),

  onTelemetry: (p) =>
    set((s) => ({
      progress: p.progress,
      episodes: p.episode,
      elapsed: p.elapsed,
      history: [...s.history, { step: p.step, reward: p.reward, success: p.success_rate }],
    })),

  onDone: () => set({ status: 'done', progress: 1 }),

  setError: (error) => set({ status: error ? 'error' : 'idle', error }),

  reset: () =>
    set({ status: 'idle', progress: 0, history: [], episodes: 0, elapsed: 0, error: null }),
}))
