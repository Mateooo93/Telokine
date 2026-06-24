import { useRunStore } from '../store/useRunStore'
import type { SerializedObject } from '../viewport/types'
import { demoFrame, lerpAgentToward } from './demoFrames'

let abort = false

export function stopDemoRun(): void {
  abort = true
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/** Play back a fake trained rollout in the browser (GitHub Pages demo). */
export async function startDemoRun(scene: { objects: SerializedObject[] }): Promise<void> {
  abort = false
  const objects = scene.objects
  const agent = objects.find((o) => o.role === 'agent')
  const target = objects.find((o) => o.role === 'target')
  const run = useRunStore.getState()

  if (!agent || !target) {
    run.setError('Add an agent cube and a target.')
    return
  }

  run.setError(null)
  run.setRunning(true)

  const startPos = [...agent.position] as [number, number, number]
  const targetPos = [...target.position] as [number, number, number]
  const steps = 36

  try {
    for (let s = 0; s <= steps && !abort; s++) {
      const t = s / steps
      const agentPos = lerpAgentToward(startPos, targetPos, t, 0.04 * (1 - t))
      run.setTransforms(demoFrame(objects, agent.id, startPos, agentPos))
      await nextFrame()
    }
  } finally {
    run.setRunning(false)
    run.clear()
  }
}
