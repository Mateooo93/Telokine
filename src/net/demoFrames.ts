import type { FrameObject } from '../store/useRunStore'
import { eulerXYZToQuat, type SerializedObject, type Vec3 } from '../viewport/types'

function agentGroup(objects: SerializedObject[], agentId: string): Set<string> {
  const ids = new Set<string>([agentId])
  let changed = true
  while (changed) {
    changed = false
    for (const o of objects) {
      if (o.attachedTo && ids.has(o.attachedTo) && !ids.has(o.id)) {
        ids.add(o.id)
        changed = true
      }
    }
  }
  return ids
}

/** Build a viewport frame with the agent group lerped toward the target. */
export function demoFrame(
  objects: SerializedObject[],
  agentId: string,
  agentStart: Vec3,
  agentPos: Vec3,
): FrameObject[] {
  const group = agentGroup(objects, agentId)
  return objects.map((o) => {
    const rot = eulerXYZToQuat(o.rotation)
    if (o.role === 'target' || o.role === 'floor') {
      return { id: o.id, pos: o.position, rot }
    }
    if (group.has(o.id)) {
      const dx = o.position[0] - agentStart[0]
      const dy = o.position[1] - agentStart[1]
      const dz = o.position[2] - agentStart[2]
      return { id: o.id, pos: [agentPos[0] + dx, agentPos[1] + dy, agentPos[2] + dz], rot }
    }
    return { id: o.id, pos: o.position, rot }
  })
}

export function lerpAgentToward(
  start: Vec3,
  target: Vec3,
  reach: number,
  wobble: number,
): Vec3 {
  const t = Math.max(0, Math.min(1, reach))
  const w = wobble * (1 - t)
  return [
    start[0] + (target[0] - start[0]) * t + (Math.random() - 0.5) * w,
    start[1] + (target[1] - start[1]) * t * 0.15,
    start[2] + (target[2] - start[2]) * t + (Math.random() - 0.5) * w,
  ]
}
