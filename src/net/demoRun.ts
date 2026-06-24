import { useRunStore } from '../store/useRunStore'
import { replayWalkerRun } from './demoReplay'

let abort = false

export function stopDemoRun(): void {
  abort = true
}

/** GitHub Pages: replay the captured trained walker rollout. */
export async function startDemoRun(): Promise<void> {
  abort = false
  try {
    await replayWalkerRun(() => abort)
  } catch (e: unknown) {
    useRunStore.getState().setError(e instanceof Error ? e.message : String(e))
  }
}
