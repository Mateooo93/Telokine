import { useRunStore } from '../store/useRunStore'
import { useTrainingStore } from '../store/useTrainingStore'
import type { SerializedObject } from '../viewport/types'
import { demoFrame, lerpAgentToward } from './demoFrames'

export const DEMO_POLICY_NAME = 'demo-policy'

let abort = false

export function stopDemoTrain(): void {
  abort = true
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/** Browser-only fake training: telemetry + chained viewport previews, no backend. */
export async function startDemoTrain(
  scene: { objects: SerializedObject[] },
  opts: { totalTimesteps?: number } = {},
): Promise<void> {
  abort = false
  const total = opts.totalTimesteps ?? 150_000
  const objects = scene.objects
  const agent = objects.find((o) => o.role === 'agent')
  const target = objects.find((o) => o.role === 'target')

  useTrainingStore.getState().setError(null)
  useTrainingStore.getState().reset()

  if (!agent || !target) {
    useTrainingStore.getState().setError('Add an agent cube and a target to simulate training.')
    return
  }

  const train = useTrainingStore.getState()
  const run = useRunStore.getState()
  train.onStarted(total)
  train.onDevice('demo')
  run.setRunning(true)

  const startPos = [...agent.position] as [number, number, number]
  const targetPos = [...target.position] as [number, number, number]
  const previews = 12
  const stepsPerPreview = 20
  const t0 = performance.now()
  let episode = 0

  try {
    for (let p = 0; p < previews && !abort; p++) {
      const progress = (p + 1) / previews
      episode += Math.max(1, Math.round(total / previews / 500))
      const success = Math.min(0.98, 0.04 + progress * 0.94)
      const reward = -40 + progress * 90
      const reach = 0.2 + progress * 0.78

      train.onPreview(episode)

      for (let s = 0; s <= stepsPerPreview && !abort; s++) {
        const t = s / stepsPerPreview
        const agentPos = lerpAgentToward(startPos, targetPos, reach * t + reach * 0.05, 0.12 * (1 - progress))
        run.setTransforms(demoFrame(objects, agent.id, startPos, agentPos))
        await nextFrame()
      }

      train.onPreview(null)

      train.onTelemetry({
        step: Math.floor(total * progress),
        reward,
        success_rate: success,
        episode,
        elapsed: (performance.now() - t0) / 1000,
        progress,
      })
      // Next preview starts immediately — no pause between simulations.
    }

    if (!abort) {
      train.onDone()
      useTrainingStore.setState({ policyName: DEMO_POLICY_NAME })
    }
  } finally {
    run.setRunning(false)
    run.clear()
  }
}
