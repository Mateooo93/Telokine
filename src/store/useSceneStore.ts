import { create } from 'zustand'
import { createObject, type ObjectType, type SceneObject, type Vec3 } from '../viewport/types'

export type TransformMode = 'translate' | 'rotate'

interface SceneState {
  objects: SceneObject[]
  selectedId: string | null
  /** Active gizmo mode in the viewport. */
  transformMode: TransformMode

  addObject: (type: ObjectType) => void
  removeObject: (id: string) => void
  select: (id: string | null) => void
  moveObject: (id: string, position: Vec3) => void
  rotateObject: (id: string, rotation: Vec3) => void
  /** Patch any subset of an object's editable properties (size, weight, ...). */
  updateObject: (id: string, patch: Partial<SceneObject>) => void
  setTransformMode: (mode: TransformMode) => void
}

const INITIAL_SCENE: SceneObject[] = [
  // The stage floor lives in the viewport, not here, so the default scene is
  // just the agent cube and its target — the exact setup from the vision.
  createObject('cube', [0, 0.5, 0]),
  createObject('target', [4, 0.5, 0]),
]

export const useSceneStore = create<SceneState>((set) => ({
  objects: INITIAL_SCENE,
  selectedId: null,
  transformMode: 'translate',

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

  rotateObject: (id, rotation) =>
    set((state) => ({
      objects: state.objects.map((o) => (o.id === id ? { ...o, rotation } : o)),
    })),

  updateObject: (id, patch) =>
    set((state) => ({
      objects: state.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    })),

  setTransformMode: (transformMode) => set({ transformMode }),
}))
