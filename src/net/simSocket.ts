import { useRunStore, type FrameObject } from '../store/useRunStore'
import type { SerializedObject } from '../viewport/types'

// WebSocket client for the /ws/sim channel (Layer 2 live physics).
//
// The frontend never steps physics itself; it asks the backend to run a
// rollout and mirrors the streamed transforms. A single long-lived connection
// is reused across runs.

const SIM_URL = 'ws://localhost:8000/ws/sim'

let ws: WebSocket | null = null
let connecting: Promise<void> | null = null

function handleMessage(ev: MessageEvent) {
  let msg: { type: string } & Record<string, unknown>
  try {
    msg = JSON.parse(ev.data)
  } catch {
    return
  }
  const store = useRunStore.getState()
  switch (msg.type) {
    case 'started':
      store.setRunning(true)
      store.setError(null)
      break
    case 'frame':
      store.setTransforms(msg.objects as FrameObject[])
      break
    case 'stopped':
      store.setRunning(false)
      store.clear()
      break
    case 'error':
      store.setRunning(false)
      store.setError(String(msg.message ?? 'unknown error'))
      break
  }
}

function handleClose() {
  ws = null
  connecting = null
  // If the socket drops mid-run, drop out of running state so the UI recovers.
  const s = useRunStore.getState()
  if (s.running) {
    s.setRunning(false)
    s.setError('Connection to the simulation backend was lost.')
  }
}

/** Open (or reuse) the websocket. Resolves once it's open. */
export function connect(): Promise<void> {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return connecting ?? Promise.resolve()
  }
  connecting = new Promise<void>((resolve, reject) => {
    const sock = new WebSocket(SIM_URL)
    ws = sock
    sock.onopen = () => {
      connecting = null
      resolve()
    }
    sock.onerror = () => {
      reject(new Error('Could not reach the simulation backend. Is it running on :8000?'))
    }
    sock.onclose = handleClose
    sock.onmessage = handleMessage
  })
  return connecting
}

/** Begin a rollout for the given scene.
 *
 * If `opts.policy` is given (a trained policy name from /ws/train), the agent
 * is driven by that policy instead of free-falling under gravity.
 */
export async function startRun(
  scene: { objects: SerializedObject[] },
  opts: { seed?: number; maxSteps?: number; policy?: string } = {},
): Promise<void> {
  useRunStore.getState().setError(null)
  await connect()
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error('Socket not open')
  }
  const payload: Record<string, unknown> = {
    type: 'start',
    scene,
    seed: opts.seed ?? Date.now(),
    max_steps: opts.maxSteps ?? 1000,
  }
  if (opts.policy) payload.policy = opts.policy
  ws.send(JSON.stringify(payload))
}

/** Request the current rollout to stop. */
export function stopRun(): void {
  ws?.send(JSON.stringify({ type: 'stop' }))
}
