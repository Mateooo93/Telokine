import { create } from 'zustand'
import {
  createObject,
  halfExtentAlong,
  normalizeVec,
  type ObjectType,
  type SceneObject,
  type Vec3,
} from '../viewport/types'
import { useTrainingStore } from './useTrainingStore'

/** A trained policy is tied to the exact scene it learned on. Once the build
 * changes shape (parts added/removed/assembled), that policy no longer applies,
 * so drop it — otherwise Run would keep driving the new scene with stale forces. */
function invalidatePolicy() {
  useTrainingStore.getState().clearPolicy()
}

export type TransformMode = 'translate' | 'rotate'
export type PlacementTool = Extract<ObjectType, 'joint' | 'motor' | 'sensor'> | null
export type ConnectorTool = Extract<ObjectType, 'joint' | 'motor'>
export type RobotTemplate = 'rover' | 'walker' | 'arm'

export interface PlacementDraft {
  type: ConnectorTool
  fromId: string
  fromPoint: Vec3
  fromNormal: Vec3
}

interface SceneState {
  objects: SceneObject[]
  selectedId: string | null
  /** Active gizmo mode in the viewport. */
  transformMode: TransformMode
  placementTool: PlacementTool
  placementDraft: PlacementDraft | null

  addObject: (type: ObjectType) => void
  placeSensorOn: (position: Vec3, normal: Vec3, attachedTo: string) => void
  startConnectorPlacement: (type: ConnectorTool, fromId: string, fromPoint: Vec3, fromNormal: Vec3) => void
  completeConnectorPlacement: (toId: string, toPoint: Vec3, toNormal: Vec3) => void
  cancelPlacement: () => void
  addTemplate: (template: RobotTemplate) => void
  removeObject: (id: string) => void
  select: (id: string | null) => void
  moveObject: (id: string, position: Vec3) => void
  rotateObject: (id: string, rotation: Vec3) => void
  /** Patch any subset of an object's editable properties (size, weight, ...). */
  updateObject: (id: string, patch: Partial<SceneObject>) => void
  setTransformMode: (mode: TransformMode) => void
  setPlacementTool: (tool: PlacementTool) => void
  /** Re-seat a connector's Part B so its face touches the connector pivot. */
  snapConnectedPart: (connectorId: string) => void
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
  placementTool: null,
  placementDraft: null,

  addObject: (type) => {
    invalidatePolicy()
    set((state) => {
      const pos: Vec3 = type === 'floor' ? [0, 0, 0] : [0, 0.5, 0]
      const obj = createObject(type, pos)
      return { objects: [...state.objects, obj], selectedId: obj.id, placementTool: null, placementDraft: null }
    })
  },

  placeSensorOn: (position, normal, attachedTo) => {
    invalidatePolicy()
    set((state) => {
      const obj = createObject('sensor', position)
      obj.attachedTo = attachedTo
      obj.anchor = position
      obj.axis = normal
      obj.pinned = false
      return { objects: [...state.objects, obj], selectedId: obj.id, placementTool: null, placementDraft: null }
    })
  },

  startConnectorPlacement: (type, fromId, fromPoint, fromNormal) =>
    set({ placementTool: type, placementDraft: { type, fromId, fromPoint, fromNormal } }),

  completeConnectorPlacement: (toId, _toPoint, _toNormal) => {
    invalidatePolicy()
    set((state) => {
      const draft = state.placementDraft
      if (!draft || draft.fromId === toId) return state
      const partB = state.objects.find((o) => o.id === toId)
      if (!partB) return state

      // The connector pivot sits exactly on part A's clicked surface point,
      // and the hinge/spin axis is that surface normal — so a wheel mounted on
      // a side face naturally rolls, a turntable spins about the face, etc.
      const pivot = draft.fromPoint
      const axis = normalizeVec(draft.fromNormal)

      // Snap part B so its near face just touches the pivot: move its center
      // out along the normal by exactly its own half-extent in that direction.
      const reach = halfExtentAlong(partB, axis)
      const snapped: Vec3 = [
        pivot[0] + axis[0] * reach,
        pivot[1] + axis[1] * reach,
        pivot[2] + axis[2] * reach,
      ]

      const obj = createObject(draft.type, pivot)
      obj.attachedTo = draft.fromId
      obj.connectedTo = toId
      obj.anchor = pivot
      obj.connectedAnchor = snapped
      obj.axis = axis
      obj.pinned = false
      obj.jointType = 'hinge'
      obj.controlMode = draft.type === 'motor' ? 'torque' : 'passive'

      return {
        objects: [
          ...state.objects.map((o) => (o.id === toId ? { ...o, position: snapped } : o)),
          obj,
        ],
        selectedId: obj.id,
        placementTool: null,
        placementDraft: null,
      }
    })
  },

  cancelPlacement: () => set({ placementTool: null, placementDraft: null }),

  addTemplate: (template) => {
    invalidatePolicy()
    set((state) => {
      // Loading a starter robot replaces the current build but keeps world
      // pieces (targets + floors), so the scene is immediately runnable with a
      // single, fully assembled agent — no leftover stray cube blocking Run.
      const world = state.objects.filter((o) => o.role === 'target' || o.role === 'floor')
      const robot = createTemplate(template)
      return {
        objects: [...world, ...robot],
        selectedId: robot[0]?.id ?? null,
        placementTool: null,
        placementDraft: null,
      }
    })
  },

  removeObject: (id) => {
    invalidatePolicy()
    set((state) => ({
      objects: state.objects.filter((o) => o.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    }))
  },

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

  setPlacementTool: (placementTool) => set({ placementTool, placementDraft: null }),

  snapConnectedPart: (connectorId) =>
    set((state) => {
      const conn = state.objects.find((o) => o.id === connectorId)
      if (!conn || !conn.connectedTo) return state
      const part = state.objects.find((o) => o.id === conn.connectedTo)
      if (!part) return state
      const axis = normalizeVec(conn.axis)
      const reach = halfExtentAlong(part, axis)
      const pivot = conn.position
      const snapped: Vec3 = [
        pivot[0] + axis[0] * reach,
        pivot[1] + axis[1] * reach,
        pivot[2] + axis[2] * reach,
      ]
      return {
        objects: state.objects.map((o) =>
          o.id === part.id ? { ...o, position: snapped } : o.id === conn.id ? { ...o, connectedAnchor: snapped } : o,
        ),
      }
    }),
}))

function createTemplate(template: RobotTemplate): SceneObject[] {
  if (template === 'walker') return walkerTemplate()
  if (template === 'arm') return armTemplate()
  return roverTemplate()
}

/** Wire a connector (motor/joint) between two parts, with the pivot + spin axis. */
function connector(
  type: 'motor' | 'joint',
  parent: SceneObject,
  child: SceneObject,
  pivot: Vec3,
  axis: Vec3,
): SceneObject {
  const c = createObject(type, pivot)
  c.attachedTo = parent.id
  c.connectedTo = child.id
  c.anchor = pivot
  c.connectedAnchor = child.position
  c.axis = normalizeVec(axis)
  c.jointType = 'hinge'
  c.controlMode = type === 'motor' ? 'torque' : 'passive'
  return c
}

// Rover: a chassis (the agent) on four powered wheels. Wheels spin about Z and
// roll toward +X (the target). Everything starts touching and attached.
function roverTemplate(): SceneObject[] {
  const chassis = createObject('cube', [-2, 0.55, 0])
  chassis.role = 'agent'
  chassis.dimensions = [1.7, 0.34, 0.95]
  chassis.color = '#c9933f'

  const wheelY = 0.42
  const corners: { x: number; z: number }[] = [
    { x: -2.55, z: -0.62 },
    { x: -1.45, z: -0.62 },
    { x: -2.55, z: 0.62 },
    { x: -1.45, z: 0.62 },
  ]
  const parts: SceneObject[] = [chassis]
  for (const corner of corners) {
    const wheel = createObject('wheel', [corner.x, wheelY, corner.z])
    wheel.radius = 0.42
    wheel.size = 0.26
    wheel.color = '#26292c'
    const pivot: Vec3 = [corner.x, wheelY, corner.z < 0 ? -0.48 : 0.48]
    const motor = connector('motor', chassis, wheel, pivot, [0, 0, 1])
    motor.motorStrength = 3.2
    parts.push(wheel, motor)
  }
  return parts
}

// Walker: a torso (the agent) with two powered legs that swing about Z.
function walkerTemplate(): SceneObject[] {
  const body = createObject('cube', [-2, 1.05, 0])
  body.role = 'agent'
  body.dimensions = [1.1, 0.42, 0.6]
  body.color = '#c9933f'

  const mkLeg = (z: number, sign: number): SceneObject[] => {
    const leg = createObject('beam', [-2, 0.5, z])
    leg.dimensions = [0.24, 1.1, 0.24]
    leg.color = '#b9c0c3'
    leg.rotation = [0, 0, sign * 0.35]
    const motor = connector('motor', body, leg, [-2, 0.84, z], [0, 0, 1])
    motor.motorStrength = 4
    return [leg, motor]
  }
  return [body, ...mkLeg(-0.36, 1), ...mkLeg(0.36, -1)]
}

// Arm: a heavy base (the agent) carrying a powered link with a sensor tip.
function armTemplate(): SceneObject[] {
  const base = createObject('cube', [-2, 0.45, 0])
  base.role = 'agent'
  base.dimensions = [0.85, 0.8, 0.85]
  base.color = '#c9933f'
  base.weight = 4

  const link = createObject('beam', [-1.2, 1.5, 0])
  link.dimensions = [1.7, 0.26, 0.26]
  link.color = '#b9c0c3'
  link.rotation = [0, 0, Math.PI / 4]

  const motor = connector('motor', base, link, [-2, 0.92, 0], [0, 0, 1])
  motor.motorStrength = 5

  const sensor = createObject('sensor', [-0.6, 2.1, 0])
  sensor.attachedTo = link.id
  sensor.anchor = sensor.position
  return [base, link, motor, sensor]
}
