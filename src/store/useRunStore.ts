import { create } from 'zustand'
import type { Vec3 } from '../viewport/types'

// Quaternion in Three.js order: [x, y, z, w]. The backend sends [x,y,z,w] too
// (already converted from MuJoCo's [w,x,y,z]), so values pass straight through.
export type Rot = [number, number, number, number]

export interface Transform {
  pos: Vec3
  rot: Rot
}

export interface FrameObject {
  id: string
  pos: Vec3
  rot: Rot
}

interface RunState {
  /** True while a physics rollout is streaming from the backend. */
  running: boolean
  /** Last error from the backend, if any (e.g. no agent in scene). */
  error: string | null
  /** Live per-object transforms for the current frame. */
  transforms: Record<string, Transform>
  setRunning: (running: boolean) => void
  setError: (error: string | null) => void
  setTransforms: (objects: FrameObject[]) => void
  clear: () => void
}

export const useRunStore = create<RunState>((set) => ({
  running: false,
  error: null,
  transforms: {},

  setRunning: (running) => set({ running }),
  setError: (error) => set({ error }),
  setTransforms: (objects) =>
    set({
      transforms: Object.fromEntries(
        objects.map((o) => [o.id, { pos: o.pos, rot: o.rot }]),
      ),
    }),
  clear: () => set({ transforms: {} }),
}))
