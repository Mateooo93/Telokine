import { useRunStore, type FrameObject } from '../store/useRunStore'
import { useTrainingStore } from '../store/useTrainingStore'

// WebSocket client for the /ws/train channel (Layer 3 PPO training).
//
// Streams telemetry (reward/success/progress) to the training store and routes
// periodic policy-preview frames into the run store so the viewport mirrors the
// learning cube live. A single long-lived connection is reused.

const TRAIN_URL = 'ws://localhost:8000/ws/train'

let ws: WebSocket | null = null
let connecting: Promise<void> | null = null
let currentModelId: string | null = null

function handleMessage(ev: MessageEvent) {
  let msg: { type: string } & Record<string, unknown>
  try {
    msg = JSON.parse(ev.data)
  } catch {
    return
  }
  const train = useTrainingStore.getState()
  const run = useRunStore.getState()

  switch (msg.type) {
    case 'started': {
      currentModelId = (msg.model_id as string) ?? null
      train.onStarted((msg.total_timesteps as number) ?? 0)
      run.setRunning(true) // mirror mode on, for preview frames
      break
    }
    case 'telemetry':
      train.onTelemetry({
        step: msg.step as number,
        reward: msg.reward as number,
        success_rate: msg.success_rate as number,
        episode: msg.episode as number,
        elapsed: msg.elapsed as number,
        progress: msg.progress as number,
      })
      break
    case 'frame':
      // Policy preview — mirror it in the viewport.
      run.setTransforms(msg.objects as FrameObject[])
      break
    case 'done':
      // Trained policy saved. Remember its name so Run can use it.
      train.onDone()
      if (currentModelId) useTrainingStore.setState({ policyName: currentModelId })
      break
    case 'error':
      train.setError(String(msg.message ?? 'training error'))
      run.setRunning(false)
      break
    case 'finished':
      run.setRunning(false)
      run.clear()
      break
  }
}

function handleClose() {
  ws = null
  connecting = null
  const s = useTrainingStore.getState()
  if (s.status === 'training') s.setError('Connection to the training backend was lost.')
  const r = useRunStore.getState()
  if (r.running) {
    r.setRunning(false)
    r.clear()
  }
}

export function connectTrain(): Promise<void> {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return connecting ?? Promise.resolve()
  }
  connecting = new Promise<void>((resolve, reject) => {
    const sock = new WebSocket(TRAIN_URL)
    ws = sock
    sock.onopen = () => {
      connecting = null
      resolve()
    }
    sock.onerror = () => reject(new Error('Could not reach the training backend. Is it running on :8000?'))
    sock.onclose = handleClose
    sock.onmessage = handleMessage
  })
  return connecting
}

interface SerializedObject {
  id: string
  type: string
  position: [number, number, number]
  rotation: [number, number, number]
  dimensions: [number, number, number]
  size: number
  radius: number
  weight: number
  friction: number
  pinned: boolean
  role: string
  color: string
}

export async function startTrain(
  scene: { objects: SerializedObject[] },
  opts: { totalTimesteps?: number } = {},
): Promise<void> {
  useTrainingStore.getState().setError(null)
  await connectTrain()
  if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('Train socket not open')
  ws.send(
    JSON.stringify({
      type: 'start',
      scene,
      total_timesteps: opts.totalTimesteps ?? 150_000,
    }),
  )
}

export function stopTrain(): void {
  ws?.send(JSON.stringify({ type: 'stop' }))
}
