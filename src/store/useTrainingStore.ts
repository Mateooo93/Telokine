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
  /** Episode number of the checkpoint currently being previewed, or null. */
  previewEpisode: number | null
  /** cpu or cuda — reported when training starts. */
  device: string | null
  error: string | null

  onStarted: (totalTimesteps: number) => void
  onTelemetry: (p: { step: number; reward: number; success_rate: number; episode: number; elapsed: number; progress: number }) => void
  onPreview: (episode: number | null) => void
  onDevice: (device: string) => void
  onDone: () => void
  setError: (e: string | null) => void
  /** Drop the saved policy (e.g. the scene changed so it no longer applies). */
  clearPolicy: () => void
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
  previewEpisode: null,
  device: null,
  error: null,

  onStarted: (totalTimesteps) =>
    set({ status: 'training', progress: 0, totalTimesteps, history: [], episodes: 0, elapsed: 0, previewEpisode: null, device: null, error: null }),

  onTelemetry: (p) =>
    set((s) => ({
      progress: p.progress,
      episodes: p.episode,
      elapsed: p.elapsed,
      history: [...s.history, { step: p.step, reward: p.reward, success: p.success_rate }],
    })),

  onPreview: (previewEpisode) => set({ previewEpisode }),

  onDevice: (device) => set({ device }),

  onDone: () => set({ status: 'done', progress: 1, previewEpisode: null }),

  setError: (error) => set({ status: error ? 'error' : 'idle', error, previewEpisode: null }),

  clearPolicy: () =>
    set((s) =>
      // Never disturb an in-flight training run; just forget any finished policy
      // and dismiss the stale "Trained!" banner.
      s.status === 'training'
        ? s
        : { policyName: null, status: s.status === 'done' ? 'idle' : s.status, error: null },
    ),

  reset: () =>
    set({ status: 'idle', progress: 0, history: [], episodes: 0, elapsed: 0, previewEpisode: null, error: null }),
}))
