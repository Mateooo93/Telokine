import { useSceneStore } from '../store/useSceneStore'
import { TYPE_LABEL, type ObjectType } from '../viewport/types'

const PALETTE: { type: ObjectType; color: string }[] = [
  { type: 'cube', color: '#4f9cff' },
  { type: 'sphere', color: '#b07cff' },
  { type: 'capsule', color: '#3fd0c9' },
  { type: 'target', color: '#ff6b35' },
  { type: 'floor', color: '#222632' },
]

export function Palette() {
  const addObject = useSceneStore((s) => s.addObject)
  return (
    <div className="sidebar">
      <h3>Objects</h3>
      <div className="palette">
        {PALETTE.map((p) => (
          <button key={p.type} className="item" onClick={() => addObject(p.type)}>
            <span className="swatch" style={{ background: p.color }} />
            {TYPE_LABEL[p.type]}
          </button>
        ))}
      </div>
      <div className="hint">
        Click to add an object. Drag objects across the floor. Scroll to zoom, drag the background to orbit.
        <br />
        <br />
        Reward blocks &amp; the Train button arrive in the next steps.
      </div>
    </div>
  )
}
