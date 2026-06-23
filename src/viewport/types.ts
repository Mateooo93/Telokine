// Scene object model. This is the single source of truth for what is in the
// world. The same shape is serialized to JSON and sent to the Python backend,
// so the editor view and the training sim always describe the same scene.

export type Vec3 = [number, number, number]

export type ObjectType = 'cube' | 'sphere' | 'capsule' | 'target' | 'floor'

// - agent : the thing being trained (always dynamic + controllable).
// - prop  : a generic object. Falls under gravity & collides unless `pinned`.
// - target: a non-colliding goal marker (stays put).
// - floor : welded ground.
export type ObjectRole = 'agent' | 'prop' | 'target' | 'floor'

export interface SceneObject {
  id: string
  type: ObjectType
  position: Vec3
  rotation: Vec3
  color: string
  // Per-shape sizing. `dimensions` is the full extent [w,h,d] for cubes; `size`
  // is capsule length / floor square; `radius` is sphere/target/capsule radius.
  dimensions: Vec3
  size: number
  radius: number
  weight: number
  friction: number
  // prop only: when true the object is welded in place (a platform/obstacle)
  // instead of falling under gravity.
  pinned: boolean
  role: ObjectRole
}

export const TYPE_LABEL: Record<ObjectType, string> = {
  cube: 'Cube',
  sphere: 'Sphere',
  capsule: 'Capsule',
  target: 'Target',
  floor: 'Floor',
}

export const ROLE_LABEL: Record<ObjectRole, string> = {
  agent: 'Agent',
  prop: 'Object',
  target: 'Target',
  floor: 'Floor',
}

let _counter = 0
export function uid(prefix = 'obj'): string {
  _counter += 1
  return `${prefix}_${Date.now().toString(36)}_${_counter}`
}

export function createObject(type: ObjectType, position?: Vec3): SceneObject {
  const base = {
    id: uid(),
    type,
    dimensions: [1, 1, 1] as Vec3,
    size: 1,
    radius: 0.5,
    weight: 1,
    friction: 0.5,
    rotation: [0, 0, 0] as Vec3,
    pinned: false,
  }

  switch (type) {
    case 'cube':
      return { ...base, color: '#4f9cff', role: 'agent', position: position ?? [0, 0.5, 0] }
    case 'sphere':
      return { ...base, color: '#b07cff', role: 'prop', position: position ?? [0, 0.5, 0] }
    case 'capsule':
      return { ...base, color: '#3fd0c9', role: 'prop', position: position ?? [0, 0.75, 0] }
    case 'target':
      return { ...base, color: '#ff6b35', role: 'target', position: position ?? [0, 0.5, 0] }
    case 'floor':
      return { ...base, color: '#222632', role: 'floor', size: 12, position: position ?? [0, 0, 0] }
  }
}

/** Serialize the editor scene into the JSON shape the Python backend expects. */
export interface SerializedObject {
  id: string
  type: ObjectType
  position: Vec3
  rotation: Vec3
  dimensions: Vec3
  size: number
  radius: number
  weight: number
  friction: number
  pinned: boolean
  role: ObjectRole
  color: string
}

export function serializeScene(objects: SceneObject[]): { objects: SerializedObject[] } {
  return {
    objects: objects.map((o) => ({
      id: o.id,
      type: o.type,
      position: o.position,
      rotation: o.rotation,
      dimensions: o.dimensions,
      size: o.size,
      radius: o.radius,
      weight: o.weight,
      friction: o.friction,
      pinned: o.pinned,
      role: o.role,
      color: o.color,
    })),
  }
}
