import { useRunStore } from '../store/useRunStore'
import type { SerializedObject } from '../viewport/types'
import { DemoCubeEnv } from './demoEnv'
import type { RewardBlock } from './demoReward'

let abort = false

export function stopDemoRun(): void {
  abort = true
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/** Replay a trained demo policy using the same env + reward blocks as simulate train. */
export async function startDemoRun(
  scene: { objects: SerializedObject[] },
  opts: { rewards?: RewardBlock[]; episodeLength?: number; actionPower?: number } = {},
): Promise<void> {
  abort = false
  const run = useRunStore.getState()
  const agent = scene.objects.find((o) => o.role === 'agent')
  const target = scene.objects.find((o) => o.role === 'target')

  if (!agent || !target) {
    run.setError('Add an agent cube and a target.')
    return
  }

  run.setError(null)
  run.setRunning(true)

  const env = new DemoCubeEnv({
    objects: scene.objects,
    rewards: opts.rewards ?? [],
    episodeLength: opts.episodeLength ?? 250,
    actionPower: opts.actionPower ?? 1,
    curriculum: 0,
    skill: 1,
    seed: 54321,
  })

  try {
    env.reset()
    run.setTransforms(env.frame())
    await nextFrame()

    for (let i = 0; i < 400 && !abort; i++) {
      const action = env.policyAction()
      const { terminated, truncated } = env.step(action)
      run.setTransforms(env.frame())
      await nextFrame()
      if (terminated || truncated) break
    }
  } finally {
    run.setRunning(false)
    run.clear()
  }
}
