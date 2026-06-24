// Scene object model. This is the single source of truth for what is in the
// world. The same shape is serialized to JSON and sent to the Python backend,
// so the editor view and the training sim always describe the same scene.

export type Vec3 = [number, number, number]

export type ObjectType =
  | 'cube'
  | 'sphere'
  | 'capsule'
  | 'beam'
  | 'wheel'
  | 'joint'
  | 'motor'
  | 'sensor'
  | 'target'
  | 'floor'

// - agent : the thing being trained (always dynamic + controllable).
// - prop  : a generic object. Falls under gravity & collides unless `pinned`.
// - target: a non-colliding goal marker (stays put).
// - floor : welded ground.
export type ObjectRole = 'agent' | 'prop' | 'connector' | 'sensor' | 'target' | 'floor'

export type JointType = 'fixed' | 'hinge' | 'slider' | 'ball'
export type ControlMode = 'passive' | 'position' | 'velocity' | 'torque'

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
  attachedTo: string | null
  connectedTo: string | null
  jointType: JointType
  anchor: Vec3
  connectedAnchor: Vec3
  axis: Vec3
  motorStrength: number
  controlMode: ControlMode
  sensorChannel: string
}

export const TYPE_LABEL: Record<ObjectType, string> = {
  cube: 'Cube',
  sphere: 'Sphere',
  capsule: 'Capsule',
  beam: 'Beam',
  wheel: 'Wheel',
  joint: 'Joint',
  motor: 'Motor',
  sensor: 'Sensor',
  target: 'Target',
  floor: 'Floor',
}

export const ROLE_LABEL: Record<ObjectRole, string> = {
  agent: 'Agent',
  prop: 'Object',
  connector: 'Connector',
  sensor: 'Sensor',
  target: 'Target',
  floor: 'Floor',
}

let _counter = 0
export function uid(prefix = 'obj'): string {
  _counter += 1
  return `${prefix}_${Date.now().toString(36)}_${_counter}`
}

// --- Geometry helpers ------------------------------------------------------
// These let the editor snap parts so they actually touch when connected, and
// keep the snap math identical to how the backend assembles the kinematic
// tree (Euler XYZ order, matching three.js and sim.py).

type Quat = [number, number, number, number] // x, y, z, w

/** Euler XYZ (radians) -> quaternion [x,y,z,w], matching three.js order 'XYZ'. */
export function eulerXYZToQuat(e: Vec3): Quat {
  const [ex, ey, ez] = e
  const c1 = Math.cos(ex / 2), s1 = Math.sin(ex / 2)
  const c2 = Math.cos(ey / 2), s2 = Math.sin(ey / 2)
  const c3 = Math.cos(ez / 2), s3 = Math.sin(ez / 2)
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ]
}

function rotateByQuat(v: Vec3, q: Quat): Vec3 {
  const [x, y, z, w] = q
  const [vx, vy, vz] = v
  const tx = 2 * (y * vz - z * vy)
  const ty = 2 * (z * vx - x * vz)
  const tz = 2 * (x * vy - y * vx)
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ]
}

/** Local half-extents of an object's geometry, in its own frame. */
function localHalfExtents(obj: SceneObject): Vec3 {
  switch (obj.type) {
    case 'cube':
    case 'beam':
      return [obj.dimensions[0] / 2, obj.dimensions[1] / 2, obj.dimensions[2] / 2]
    case 'sphere':
    case 'target':
      return [obj.radius, obj.radius, obj.radius]
    case 'capsule':
      return [obj.radius, obj.size / 2 + obj.radius, obj.radius]
    case 'wheel':
      // Cylinder whose spin axis is local Z (see SceneObjectMesh).
      return [obj.radius, obj.radius, obj.size / 2]
    default:
      return [obj.radius, obj.radius, obj.radius]
  }
}

export function normalizeVec(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

/**
 * How far the object's surface sits from its center along a world-space
 * direction — the support distance. Used to snap a part so its face just
 * touches a connector instead of overlapping or floating.
 */
export function halfExtentAlong(obj: SceneObject, dirWorld: Vec3): number {
  const q = eulerXYZToQuat(obj.rotation)
  const qInv: Quat = [-q[0], -q[1], -q[2], q[3]]
  const d = rotateByQuat(normalizeVec(dirWorld), qInv)
  const h = localHalfExtents(obj)
  return Math.abs(d[0]) * h[0] + Math.abs(d[1]) * h[1] + Math.abs(d[2]) * h[2]
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
    attachedTo: null,
    connectedTo: null,
    jointType: 'fixed' as JointType,
    anchor: [0, 0, 0] as Vec3,
    connectedAnchor: [0, 0, 0] as Vec3,
    axis: [1, 0, 0] as Vec3,
    motorStrength: 1,
    controlMode: 'passive' as ControlMode,
    sensorChannel: 'distance_to_target',
  }

  switch (type) {
    case 'cube':
      return { ...base, color: '#d18b3d', role: 'agent', position: position ?? [0, 0.5, 0] }
    case 'sphere':
      return { ...base, color: '#8fa3ad', role: 'prop', position: position ?? [0, 0.5, 0] }
    case 'capsule':
      return { ...base, color: '#7fb7a8', role: 'prop', position: position ?? [0, 0.75, 0] }
    case 'beam':
      return { ...base, color: '#b9c0c3', role: 'prop', dimensions: [2.2, 0.28, 0.28], weight: 0.7, position: position ?? [0, 0.7, 0] }
    case 'wheel':
      return { ...base, color: '#2f3337', role: 'prop', radius: 0.45, size: 0.28, friction: 1.1, position: position ?? [0, 0.55, 0] }
    case 'joint':
      return { ...base, color: '#c7a35a', role: 'connector', radius: 0.22, size: 0.3, pinned: true, jointType: 'hinge', position: position ?? [0, 0.55, 0] }
    case 'motor':
      return { ...base, color: '#a86f37', role: 'connector', radius: 0.26, size: 0.38, pinned: true, jointType: 'hinge', motorStrength: 2.5, controlMode: 'torque', position: position ?? [0, 0.55, 0] }
    case 'sensor':
      return { ...base, color: '#6f8f9b', role: 'sensor', radius: 0.22, size: 0.3, pinned: true, sensorChannel: 'distance_to_target', position: position ?? [0, 0.9, 0] }
    case 'target':
      return { ...base, color: '#d6a246', role: 'target', position: position ?? [0, 0.5, 0] }
    case 'floor':
      return { ...base, color: '#1d2225', role: 'floor', size: 12, position: position ?? [0, 0, 0] }
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
  attachedTo: string | null
  connectedTo: string | null
  jointType: JointType
  anchor: Vec3
  connectedAnchor: Vec3
  axis: Vec3
  motorStrength: number
  controlMode: ControlMode
  sensorChannel: string
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
      attachedTo: o.attachedTo,
      connectedTo: o.connectedTo,
      jointType: o.jointType,
      anchor: o.anchor,
      connectedAnchor: o.connectedAnchor,
      axis: o.axis,
      motorStrength: o.motorStrength,
      controlMode: o.controlMode,
      sensorChannel: o.sensorChannel,
    })),
  }
}
