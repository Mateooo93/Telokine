import { useSceneStore } from '../store/useSceneStore'
import { useRunStore } from '../store/useRunStore'
import { TYPE_LABEL } from '../viewport/types'

export function StatusBar() {
  const selectedId = useSceneStore((s) => s.selectedId)
  const running = useRunStore((s) => s.running)
  const obj = useSceneStore((s) => s.objects.find((o) => o.id === selectedId)) ?? null

  if (running) {
    return (
      <div className="statusbar">
        <b>● Running</b> · simulating physics — object positions are live from the backend
      </div>
    )
  }

  if (!obj) {
    return <div className="statusbar">No selection</div>
  }

  const [x, y, z] = obj.position

  return (
    <div className="statusbar">
      <b>{TYPE_LABEL[obj.type]}</b> · role {obj.role} · pos ({x.toFixed(2)}, {y.toFixed(2)}, {z.toFixed(2)})
    </div>
  )
}
