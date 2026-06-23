import { create } from 'zustand'
import { createObject, type ObjectType, type SceneObject, type Vec3 } from '../viewport/types'

interface SceneState {
  objects: SceneObject[]
  selectedId: string | null
  addObject: (type: ObjectType) => void
  removeObject: (id: string) => void
  select: (id: string | null) => void
  moveObject: (id: string, position: Vec3) => void
}

const INITIAL_SCENE: SceneObject[] = [
  // The stage floor (shadow receiver + drag surface) lives in the viewport, not
  // here, so the default scene is just the agent cube and its target — the
  // exact setup described in the vision for proving the core concept.
  createObject('cube', [0, 0.5, 0]),
  createObject('target', [4, 0.5, 0]),
]

export const useSceneStore = create<SceneState>((set) => ({
  objects: INITIAL_SCENE,
  selectedId: null,

  addObject: (type) =>
    set((state) => {
      const pos: Vec3 = type === 'floor' ? [0, 0, 0] : [0, 0.5, 0]
      const obj = createObject(type, pos)
      return { objects: [...state.objects, obj], selectedId: obj.id }
    }),

  removeObject: (id) =>
    set((state) => ({
      objects: state.objects.filter((o) => o.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  select: (id) => set({ selectedId: id }),

  moveObject: (id, position) =>
    set((state) => ({
      objects: state.objects.map((o) => (o.id === id ? { ...o, position } : o)),
    })),
}))
