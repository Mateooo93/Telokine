import { useTrainingStore } from '../store/useTrainingStore'
import { replayWalkerTraining } from './demoReplay'

export const DEMO_POLICY_NAME = 'demo-policy'

let abort = false

export function stopDemoTrain(): void {
  abort = true
}

/** GitHub Pages: replay a real MuJoCo walker training capture. */
export async function startDemoTrain(): Promise<void> {
  abort = false
  useTrainingStore.getState().setError(null)
  useTrainingStore.getState().reset()

  try {
    await replayWalkerTraining(
      () => abort,
      () => useTrainingStore.setState({ policyName: DEMO_POLICY_NAME }),
    )
  } catch (e: unknown) {
    useTrainingStore.getState().setError(e instanceof Error ? e.message : String(e))
  }
}
