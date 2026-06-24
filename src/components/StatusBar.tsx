import { useSceneStore } from '../store/useSceneStore'
import { useRunStore } from '../store/useRunStore'
import { useTrainingStore } from '../store/useTrainingStore'
import { TYPE_LABEL } from '../viewport/types'

function dist(a: [number, number, number], b: [number, number, number]) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function StatusBar() {
  const selectedId = useSceneStore((s) => s.selectedId)
  const objects = useSceneStore((s) => s.objects)
  const running = useRunStore((s) => s.running)
  const transforms = useRunStore((s) => s.transforms)
  const trainingStatus = useTrainingStore((s) => s.status)
  const device = useTrainingStore((s) => s.device)
  const obj = objects.find((o) => o.id === selectedId) ?? null

  const agent = objects.find((o) => o.role === 'agent')
  const target = objects.find((o) => o.role === 'target')
  const agentPos = agent ? (transforms[agent.id]?.pos ?? agent.position) : null
  const targetPos = target?.position ?? null
  const gap =
    agentPos && targetPos ? dist(agentPos, targetPos) : null

  if (trainingStatus === 'training') {
    return (
      <div className="statusbar">
        <b>Learning</b>
        <span className="status-sep">·</span>
        training on {device === 'cuda' ? 'GPU' : 'CPU'}
        {gap != null && (
          <>
            <span className="status-sep">·</span>
            {gap.toFixed(2)}m to target
          </>
        )}
      </div>
    )
  }
  if (trainingStatus === 'done') {
    return (
      <div className="statusbar">
        <b>Done</b>
        <span className="status-sep">·</span>
        press Run trained to replay the policy
      </div>
    )
  }

  if (running) {
    return (
      <div className="statusbar">
        <b>Live</b>
        <span className="status-sep">·</span>
        physics from backend
        {gap != null && (
          <>
            <span className="status-sep">·</span>
            {gap.toFixed(2)}m to target
          </>
        )}
      </div>
    )
  }

  if (!obj) {
    return (
      <div className="statusbar">
        {gap != null ? (
          <>
            <b>Target</b>
            <span className="status-sep">·</span>
            {gap.toFixed(2)}m away
            <span className="status-sep">·</span>
            <span className="status-hint">R resets camera</span>
          </>
        ) : (
          <span className="status-hint">Select a part · R resets camera</span>
        )}
      </div>
    )
  }

  const [x, y, z] = obj.position
  return (
    <div className="statusbar">
      <b>{TYPE_LABEL[obj.type]}</b>
      <span className="status-sep">·</span>
      ({x.toFixed(2)}, {y.toFixed(2)}, {z.toFixed(2)})
      {gap != null && (
        <>
          <span className="status-sep">·</span>
          {gap.toFixed(2)}m to target
        </>
      )}
    </div>
  )
}
