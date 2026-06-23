import { useSceneStore } from '../store/useSceneStore'
import { useRunStore } from '../store/useRunStore'
import { useTrainingStore } from '../store/useTrainingStore'
import { TYPE_LABEL } from '../viewport/types'

export function StatusBar() {
  const selectedId = useSceneStore((s) => s.selectedId)
  const running = useRunStore((s) => s.running)
  const trainingStatus = useTrainingStore((s) => s.status)
  const obj = useSceneStore((s) => s.objects.find((o) => o.id === selectedId)) ?? null

  if (trainingStatus === 'training') {
    return (
      <div className="statusbar">
        <b>● Learning</b> · the policy is being trained on the GPU — the cube shows live previews
      </div>
    )
  }
  if (trainingStatus === 'done') {
    return (
      <div className="statusbar">
        <b>✓ Trained</b> · press ▶ Run trained to watch the cube reach the target
      </div>
    )
  }

  if (running) {
    return (
      <div className="statusbar">
        <b>● Running</b> · object positions are live from the backend
      </div>
    )
  }

  if (!obj) {
    return <div className="statusbar">No selection</div>
  }

  const [x, y, z] = obj.position
  return (
    <div className="statusbar">
      <b>{TYPE_LABEL[obj.type]}</b> · pos ({x.toFixed(2)}, {y.toFixed(2)}, {z.toFixed(2)})
    </div>
  )
}
