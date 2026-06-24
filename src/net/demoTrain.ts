import { useRunStore } from '../store/useRunStore'
import { useTrainingStore } from '../store/useTrainingStore'
import type { SerializedObject } from '../viewport/types'
import { DemoCubeEnv } from './demoEnv'
import type { RewardBlock } from './demoReward'

export const DEMO_POLICY_NAME = 'demo-policy'

const ROLLOUT_STEPS = 512
const PREVIEW_EVERY_EPISODES = 25
const PREVIEW_STEPS = 45
const WINDOW = 25

let abort = false

export function stopDemoTrain(): void {
  abort = true
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function rollingPush(buf: number[], value: number, max = WINDOW): number[] {
  const next = [...buf, value]
  return next.length > max ? next.slice(next.length - max) : next
}

function mean(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

async function runPreview(
  env: DemoCubeEnv,
  train: ReturnType<typeof useTrainingStore.getState>,
  run: ReturnType<typeof useRunStore.getState>,
  episode: number,
  meanReward: number,
  successRate: number,
): Promise<void> {
  train.onPreview(episode)
  env.reset()
  run.setTransforms(env.frame())
  await nextFrame()

  for (let i = 0; i < PREVIEW_STEPS && !abort; i++) {
    const action = env.policyAction()
    const { terminated, truncated } = env.step(action)
    run.setTransforms(env.frame())
    await nextFrame()
    if (terminated || truncated) break
  }

  train.onPreview(null)
}

/** Browser-only training loop — mirrors backend telemetry, previews, and reward blocks. */
export async function startDemoTrain(
  scene: { objects: SerializedObject[] },
  opts: {
    totalTimesteps?: number
    rewards?: RewardBlock[]
    episodeLength?: number
    actionPower?: number
    curriculum?: number
  } = {},
): Promise<void> {
  abort = false
  const total = opts.totalTimesteps ?? 150_000
  const rewards = opts.rewards ?? []
  const episodeLength = opts.episodeLength ?? 250
  const actionPower = opts.actionPower ?? 1
  const curriculum = opts.curriculum ?? 0.25

  useTrainingStore.getState().setError(null)
  useTrainingStore.getState().reset()

  const agent = scene.objects.find((o) => o.role === 'agent')
  const target = scene.objects.find((o) => o.role === 'target')
  if (!agent || !target) {
    useTrainingStore.getState().setError('Add an agent cube and a target to simulate training.')
    return
  }

  const train = useTrainingStore.getState()
  const run = useRunStore.getState()
  train.onStarted(total)
  train.onDevice('demo')
  run.setRunning(true)

  let timesteps = 0
  let episode = 0
  let lastPreviewEp = 0
  let epRewards: number[] = []
  let epSuccess: number[] = []
  let epOob: number[] = []
  const t0 = performance.now()

  const env = new DemoCubeEnv({
    objects: scene.objects,
    rewards,
    episodeLength,
    actionPower,
    curriculum,
    skill: 0.05,
    seed: 12345,
  })

  try {
    while (timesteps < total && !abort) {
      env.setSkill(Math.min(1, 0.08 + (timesteps / total) * 0.92))

      for (let rollStep = 0; rollStep < ROLLOUT_STEPS && timesteps < total && !abort; rollStep++) {
        env.reset()
        let epReward = 0
        let reached = false
        let oobMetric = 0

        while (!abort) {
          const action = env.policyAction()
          const result = env.step(action)
          epReward += result.reward
          reached = result.info.reached
          oobMetric = result.info.out_of_bounds_metric
          timesteps += 1
          if (result.terminated || result.truncated || timesteps >= total) break
        }

        episode += 1
        epRewards = rollingPush(epRewards, epReward)
        epSuccess = rollingPush(epSuccess, reached ? 1 : 0)
        epOob = rollingPush(epOob, oobMetric)

        if (episode - lastPreviewEp >= PREVIEW_EVERY_EPISODES) {
          lastPreviewEp = episode
          await runPreview(env, useTrainingStore.getState(), useRunStore.getState(), episode, mean(epRewards), mean(epSuccess))
        }
      }

      if (abort) break

      train.onTelemetry({
        step: timesteps,
        reward: mean(epRewards),
        success_rate: mean(epSuccess),
        episode,
        elapsed: (performance.now() - t0) / 1000,
        progress: Math.min(1, timesteps / total),
        out_of_bounds_metric: mean(epOob),
      })
      await nextFrame()
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
