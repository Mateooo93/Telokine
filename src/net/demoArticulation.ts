import type { FrameObject } from '../store/useRunStore'
import { eulerXYZToQuat, type SerializedObject, type Vec3 } from '../viewport/types'

export interface MotorLink {
  motorId: string
  childId: string
  pivot: Vec3
  axis: Vec3
  restChildPos: Vec3
  restChildRot: Vec3
  phaseOffset: number
}

/** All parts that belong to the robot (body, motors, legs, wheels, …). */
export function robotGroup(objects: SerializedObject[], agentId: string): Set<string> {
  const ids = new Set<string>([agentId])
  let changed = true
  while (changed) {
    changed = false
    for (const o of objects) {
      if (ids.has(o.id)) continue
      if (o.attachedTo && ids.has(o.attachedTo)) {
        ids.add(o.id)
        changed = true
      }
    }
    for (const c of objects) {
      if (c.type !== 'motor' && c.type !== 'joint') continue
      if (!ids.has(c.id) && c.attachedTo && ids.has(c.attachedTo)) {
        ids.add(c.id)
        changed = true
      }
      if (ids.has(c.id) && c.connectedTo && !ids.has(c.connectedTo)) {
        ids.add(c.connectedTo)
        changed = true
      }
    }
  }
  return ids
}

export function findMotors(objects: SerializedObject[], agentId: string): MotorLink[] {
  const group = robotGroup(objects, agentId)
  const byId = Object.fromEntries(objects.map((o) => [o.id, o]))
  const links: MotorLink[] = []
  let i = 0
  for (const o of objects) {
    if (o.type !== 'motor' || !o.connectedTo || !group.has(o.id)) continue
    const child = byId[o.connectedTo]
    if (!child) continue
    links.push({
      motorId: o.id,
      childId: child.id,
      pivot: [...o.position] as Vec3,
      axis: [...o.axis] as Vec3,
      restChildPos: [...child.position] as Vec3,
      restChildRot: [...child.rotation] as Vec3,
      phaseOffset: i * Math.PI,
    })
    i += 1
  }
  return links
}

function rotateAroundZ(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/** Build a frame with root motion plus hinged leg/wheel motion from motor angles. */
export function buildRobotFrame(
  objects: SerializedObject[],
  agentId: string,
  agentStart: Vec3,
  rootPos: Vec3,
  rootEuler: Vec3,
  motorAngles: Record<string, number>,
  motors: MotorLink[],
): FrameObject[] {
  const group = robotGroup(objects, agentId)
  const rootDelta = sub(rootPos, agentStart)
  const childAngle: Record<string, number> = {}
  for (const m of motors) childAngle[m.childId] = motorAngles[m.motorId] ?? 0

  return objects.map((o) => {
    if (o.role === 'target' || o.role === 'floor') {
      return { id: o.id, pos: o.position, rot: eulerXYZToQuat(o.rotation) }
    }
    if (!group.has(o.id)) {
      return { id: o.id, pos: o.position, rot: eulerXYZToQuat(o.rotation) }
    }

    let pos: Vec3 = add(o.position, rootDelta)
    let rot = [...o.rotation] as Vec3

    if (o.id === agentId) {
      rot = [rootEuler[0], rootEuler[1], rootEuler[2]]
    }

    const link = motors.find((m) => m.childId === o.id)
    if (link) {
      const angle = childAngle[o.id] ?? 0
      const offset = sub(link.restChildPos, link.pivot)
      const swung = rotateAroundZ(offset, angle)
      pos = add(add(link.pivot, rootDelta), swung)
      rot = [link.restChildRot[0], link.restChildRot[1], link.restChildRot[2] + angle]
    }

    if (o.type === 'wheel') {
      const angle = childAngle[o.id] ?? 0
      rot = [o.rotation[0], o.rotation[1], o.rotation[2] + angle * 2]
    }

    return { id: o.id, pos, rot: eulerXYZToQuat(rot) }
  })
}

/** Simple root-only frame for cube agents without motors. */
export function buildRootFrame(
  objects: SerializedObject[],
  agentId: string,
  agentStart: Vec3,
  rootPos: Vec3,
  rootEuler: Vec3,
): FrameObject[] {
  const group = robotGroup(objects, agentId)
  return objects.map((o) => {
    const rot = o.id === agentId ? eulerXYZToQuat(rootEuler) : eulerXYZToQuat(o.rotation)
    if (o.role === 'target' || o.role === 'floor') {
      return { id: o.id, pos: o.position, rot: eulerXYZToQuat(o.rotation) }
    }
    if (group.has(o.id)) {
      const dx = o.position[0] - agentStart[0]
      const dy = o.position[1] - agentStart[1]
      const dz = o.position[2] - agentStart[2]
      return { id: o.id, pos: [rootPos[0] + dx, rootPos[1] + dy, rootPos[2] + dz], rot }
    }
    return { id: o.id, pos: o.position, rot: eulerXYZToQuat(o.rotation) }
  })
}
