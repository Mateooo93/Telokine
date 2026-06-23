import { useSceneStore } from '../store/useSceneStore'
import { TYPE_LABEL } from '../viewport/types'

export function StatusBar() {
  const selectedId = useSceneStore((s) => s.selectedId)
  const obj = useSceneStore((s) => s.objects.find((o) => o.id === selectedId)) ?? null

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
