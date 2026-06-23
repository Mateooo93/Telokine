import { useSceneStore } from '../store/useSceneStore'
import { ROLE_LABEL, TYPE_LABEL, type SceneObject, type Vec3 } from '../viewport/types'

const RAD2DEG = 180 / Math.PI
const DEG2RAD = Math.PI / 180

export function Inspector() {
  const selectedId = useSceneStore((s) => s.selectedId)
  const obj = useSceneStore((s) => s.objects.find((o) => o.id === selectedId)) ?? null
  const updateObject = useSceneStore((s) => s.updateObject)
  const rotateObject = useSceneStore((s) => s.rotateObject)
  const removeObject = useSceneStore((s) => s.removeObject)

  if (!obj) {
    return (
      <aside className="inspector">
        <h3>Properties</h3>
        <p className="empty">Select an object to edit it. Use the Move / Rotate tools to transform it in the viewport.</p>
      </aside>
    )
  }

  const setRot = (axis: 0 | 1 | 2, deg: number) => {
    const rot: Vec3 = [...obj.rotation] as Vec3
    rot[axis] = deg * DEG2RAD
    rotateObject(obj.id, rot)
  }

  return (
    <aside className="inspector">
      <h3>Properties</h3>
      <div className="obj-title">
        <span className="swatch" style={{ background: obj.color }} />
        <b>{TYPE_LABEL[obj.type]}</b>
        <span className="role">{ROLE_LABEL[obj.role]}</span>
      </div>

      <Section title="Transform">
        <NumField
          label="Pos X"
          value={obj.position[0]}
          step={0.1}
          onValue={(v) => updateObject(obj.id, { position: [v, obj.position[1], obj.position[2]] })}
        />
        <NumField
          label="Pos Y"
          value={obj.position[1]}
          step={0.1}
          onValue={(v) => updateObject(obj.id, { position: [obj.position[0], v, obj.position[2]] })}
        />
        <NumField
          label="Pos Z"
          value={obj.position[2]}
          step={0.1}
          onValue={(v) => updateObject(obj.id, { position: [obj.position[0], obj.position[1], v] })}
        />
        {obj.type !== 'floor' && (
          <>
            <NumField label="Rot X°" value={obj.rotation[0] * RAD2DEG} step={5} onValue={(v) => setRot(0, v)} />
            <NumField label="Rot Y°" value={obj.rotation[1] * RAD2DEG} step={5} onValue={(v) => setRot(1, v)} />
            <NumField label="Rot Z°" value={obj.rotation[2] * RAD2DEG} step={5} onValue={(v) => setRot(2, v)} />
          </>
        )}
      </Section>

      <Section title="Shape">
        {obj.type === 'cube' && (
          <>
            <NumField
              label="Width"
              value={obj.dimensions[0]}
              step={0.1}
              min={0.1}
              onValue={(v) => updateObject(obj.id, { dimensions: [Math.max(0.1, v), obj.dimensions[1], obj.dimensions[2]] })}
            />
            <NumField
              label="Height"
              value={obj.dimensions[1]}
              step={0.1}
              min={0.1}
              onValue={(v) => updateObject(obj.id, { dimensions: [obj.dimensions[0], Math.max(0.1, v), obj.dimensions[2]] })}
            />
            <NumField
              label="Depth"
              value={obj.dimensions[2]}
              step={0.1}
              min={0.1}
              onValue={(v) => updateObject(obj.id, { dimensions: [obj.dimensions[0], obj.dimensions[1], Math.max(0.1, v)] })}
            />
          </>
        )}
        {(obj.type === 'capsule' || obj.type === 'floor') && (
          <NumField
            label="Size"
            value={obj.size}
            step={0.1}
            min={0.1}
            onValue={(v) => updateObject(obj.id, { size: Math.max(0.1, v) })}
          />
        )}
        {(obj.type === 'sphere' || obj.type === 'target' || obj.type === 'capsule') && (
          <NumField
            label="Radius"
            value={obj.radius}
            step={0.1}
            min={0.1}
            onValue={(v) => updateObject(obj.id, { radius: Math.max(0.1, v) })}
          />
        )}
      </Section>

      <Section title="Physics">
        {obj.role === 'prop' && (
          <label className="field">
            <span>Pinned in place</span>
            <input
              type="checkbox"
              checked={obj.pinned}
              onChange={(e) => updateObject(obj.id, { pinned: e.target.checked })}
            />
          </label>
        )}
        {(obj.type === 'cube' || obj.type === 'sphere' || obj.type === 'capsule') && (
          <SliderField label="Weight" value={obj.weight} min={0.1} max={5} step={0.1} onValue={(v) => updateObject(obj.id, { weight: v })} />
        )}
        {obj.type !== 'target' && (
          <SliderField label="Friction" value={obj.friction} min={0} max={1.5} step={0.05} onValue={(v) => updateObject(obj.id, { friction: v })} />
        )}
      </Section>

      <Section title="Appearance">
        <label className="field">
          <span>Color</span>
          <input
            type="color"
            value={obj.color}
            onChange={(e) => updateObject(obj.id, { color: e.target.value })}
          />
        </label>
      </Section>

      <button className="btn danger" onClick={() => removeObject(obj.id)}>
        Delete object
      </button>
    </aside>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">{title}</div>
      {children}
    </div>
  )
}

function NumField({
  label,
  value,
  onValue,
  step = 0.1,
  min,
  max,
}: {
  label: string
  value: number
  onValue: (v: number) => void
  step?: number
  min?: number
  max?: number
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(value * 1000) / 1000}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v)) onValue(v)
        }}
      />
    </label>
  )
}

function SliderField({
  label,
  value,
  onValue,
  min,
  max,
  step,
}: {
  label: string
  value: number
  onValue: (v: number) => void
  min: number
  max: number
  step: number
}) {
  return (
    <label className="field">
      <span>
        {label} <em className="val">{value.toFixed(2)}</em>
      </span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onValue(parseFloat(e.target.value))} />
    </label>
  )
}

// Kept for type completeness; not rendered directly.
export type { SceneObject }
