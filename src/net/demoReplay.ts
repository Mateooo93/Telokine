import { useRunStore, type FrameObject } from '../store/useRunStore'
import { useTrainingStore } from '../store/useTrainingStore'

const FRAME_MS = 1000 / 30

export interface DemoRecording {
  version: number
  totalTimesteps: number
  duration: number
  frames: { t: number; objects: FrameObject[] }[]
  telemetry: {
    t: number
    step: number
    episode: number
    reward: number
    success_rate: number
    elapsed: number
    progress: number
    out_of_bounds_metric: number
  }[]
  runFrames: FrameObject[][]
}

let cached: DemoRecording | null = null
let loading: Promise<DemoRecording> | null = null

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function loadWalkerRecording(): Promise<DemoRecording> {
  if (cached) return cached
  if (loading) return loading
  loading = fetch(`${import.meta.env.BASE_URL}walker-demo.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`walker-demo.json missing (${r.status})`)
      return r.json() as Promise<DemoRecording>
    })
    .then((data) => {
      cached = data
      return data
    })
  return loading
}

/** Replay a MuJoCo training capture (GitHub Pages Simulate train). */
export async function replayWalkerTraining(
  shouldAbort: () => boolean,
  onDone: () => void,
): Promise<void> {
  const recording = await loadWalkerRecording()
  const train = useTrainingStore.getState()
  const run = useRunStore.getState()

  train.onStarted(recording.totalTimesteps)
  train.onDevice('MuJoCo recording')
  run.setRunning(true)

  if (recording.frames[0]) {
    run.setTransforms(recording.frames[0].objects)
  }

  let telemIdx = 0
  const t0 = performance.now()

  try {
    for (const frame of recording.frames) {
      if (shouldAbort()) break

      const targetMs = frame.t * 1000
      while (performance.now() - t0 < targetMs && !shouldAbort()) {
        await sleep(8)
      }

      run.setTransforms(frame.objects)

      while (telemIdx < recording.telemetry.length && recording.telemetry[telemIdx].t <= frame.t) {
        const p = recording.telemetry[telemIdx]
        train.onTelemetry({
          step: p.step,
          reward: p.reward,
          success_rate: p.success_rate,
          episode: p.episode,
          elapsed: p.elapsed,
          progress: p.progress,
          out_of_bounds_metric: p.out_of_bounds_metric,
        })
        telemIdx += 1
      }
    }

    while (telemIdx < recording.telemetry.length) {
      const p = recording.telemetry[telemIdx]
      train.onTelemetry({
        step: p.step,
        reward: p.reward,
        success_rate: p.success_rate,
        episode: p.episode,
        elapsed: p.elapsed,
        progress: p.progress,
        out_of_bounds_metric: p.out_of_bounds_metric,
      })
      telemIdx += 1
    }

    if (!shouldAbort()) {
      train.onDone()
      onDone()
    }
  } finally {
    run.setRunning(false)
    run.clear()
  }
}

/** Replay the captured trained-policy rollout (GitHub Pages Run trained). */
export async function replayWalkerRun(shouldAbort: () => boolean): Promise<void> {
  const recording = await loadWalkerRecording()
  const run = useRunStore.getState()
  run.setError(null)
  run.setRunning(true)

  try {
    for (const objects of recording.runFrames) {
      if (shouldAbort()) break
      run.setTransforms(objects)
      await sleep(FRAME_MS)
    }
  } finally {
    run.setRunning(false)
    run.clear()
  }
}
