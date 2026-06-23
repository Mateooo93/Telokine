// Scene object model. This is the single source of truth for what is in the
// world. The same shape is serialized to JSON and sent to the Python backend,
// so the editor view and the training sim always describe the same scene.

export type Vec3 = [number, number, number]

export type ObjectType = 'cube' | 'sphere' | 'capsule' | 'target' | 'floor'

export type ObjectRole = 'agent' | 'target' | 'static' | 'floor'

export interface SceneObject {
  id: string
  type: ObjectType
  position: Vec3
  color: string
  // Editable physical-ish properties. Wired to the sim in later steps.
  size: number
  radius: number
  weight: number
  friction: number
  role: ObjectRole
}

export const TYPE_LABEL: Record<ObjectType, string> = {
  cube: 'Cube',
  sphere: 'Sphere',
  capsule: 'Capsule',
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
    size: 1,
    radius: 0.5,
    weight: 1,
    friction: 0.5,
  }

  switch (type) {
    case 'cube':
      return { ...base, color: '#4f9cff', role: 'agent', position: position ?? [0, 0.5, 0] }
    case 'sphere':
      return { ...base, color: '#b07cff', role: 'static', position: position ?? [0, 0.5, 0] }
    case 'capsule':
      return { ...base, color: '#3fd0c9', role: 'static', position: position ?? [0, 0.75, 0] }
    case 'target':
      return { ...base, color: '#ff6b35', role: 'target', position: position ?? [0, 0.5, 0] }
    case 'floor':
      return { ...base, color: '#222632', role: 'floor', size: 12, position: position ?? [0, 0, 0] }
  }
}
