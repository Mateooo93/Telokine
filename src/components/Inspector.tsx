import { useSceneStore } from '../store/useSceneStore'
import {
  ROLE_LABEL,
  TYPE_LABEL,
  type ControlMode,
  type JointType,
  type SceneObject,
  type Vec3,
} from '../viewport/types'

const RAD2DEG = 180 / Math.PI
const DEG2RAD = Math.PI / 180

export function Inspector() {
  const selectedId = useSceneStore((s) => s.selectedId)
  const objects = useSceneStore((s) => s.objects)
  const obj = useSceneStore((s) => s.objects.find((o) => o.id === selectedId)) ?? null
  const updateObject = useSceneStore((s) => s.updateObject)
  const rotateObject = useSceneStore((s) => s.rotateObject)
  const removeObject = useSceneStore((s) => s.removeObject)
  const snapConnectedPart = useSceneStore((s) => s.snapConnectedPart)
  const select = useSceneStore((s) => s.select)

  if (!obj) {
    return (
      <aside className="inspector">
        <h3>Properties</h3>
        <p className="empty">Select a part to edit geometry, physics, attachment, control, and reward-facing parameters.</p>
      </aside>
    )
  }

  const setRot = (axis: 0 | 1 | 2, deg: number) => {
    const rot: Vec3 = [...obj.rotation] as Vec3
    rot[axis] = deg * DEG2RAD
    rotateObject(obj.id, rot)
  }
  const partOptions = objects
    .filter((o) => o.id !== obj.id && (o.role === 'agent' || o.role === 'prop'))
    .map((o) => ({ value: o.id, label: `${TYPE_LABEL[o.type]} ${o.id.slice(-4)}` }))

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
        {obj.type === 'beam' && (
          <>
            <NumField
              label="Length"
              value={obj.dimensions[0]}
              step={0.1}
              min={0.1}
              onValue={(v) => updateObject(obj.id, { dimensions: [Math.max(0.1, v), obj.dimensions[1], obj.dimensions[2]] })}
            />
            <NumField
              label="Thickness"
              value={obj.dimensions[1]}
              step={0.05}
              min={0.05}
              onValue={(v) => updateObject(obj.id, { dimensions: [obj.dimensions[0], Math.max(0.05, v), Math.max(0.05, v)] })}
            />
          </>
        )}
        {(obj.type === 'capsule' || obj.type === 'floor' || obj.type === 'wheel' || obj.type === 'joint' || obj.type === 'motor' || obj.type === 'sensor') && (
          <NumField
            label={obj.type === 'wheel' ? 'Width' : 'Size'}
            value={obj.size}
            step={0.1}
            min={0.1}
            onValue={(v) => updateObject(obj.id, { size: Math.max(0.1, v) })}
          />
        )}
        {(obj.type === 'sphere' || obj.type === 'target' || obj.type === 'capsule' || obj.type === 'wheel' || obj.type === 'joint' || obj.type === 'motor' || obj.type === 'sensor') && (
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
        {(obj.role === 'prop' || obj.role === 'connector' || obj.role === 'sensor') && (
          <label className="field">
            <span>Pinned in place</span>
            <input
              type="checkbox"
              checked={obj.pinned}
              onChange={(e) => updateObject(obj.id, { pinned: e.target.checked })}
            />
          </label>
        )}
        {(obj.type === 'cube' || obj.type === 'sphere' || obj.type === 'capsule' || obj.type === 'beam' || obj.type === 'wheel') && (
          <SliderField label="Weight" value={obj.weight} min={0.1} max={5} step={0.1} onValue={(v) => updateObject(obj.id, { weight: v })} />
        )}
        {obj.type !== 'target' && (
          <SliderField label="Friction" value={obj.friction} min={0} max={1.5} step={0.05} onValue={(v) => updateObject(obj.id, { friction: v })} />
        )}
      </Section>

      {(obj.role === 'connector' || obj.role === 'sensor') && (
        <Section title="Assembly">
          <div className="connection-help">
            {obj.role === 'connector'
              ? 'A motor/joint links two parts: Part A is the anchor, Part B pivots about the axis. The easiest way is the “Connect parts” tool in the Build panel.'
              : 'A sensor mounts to one part and exposes a training signal.'}
          </div>
          <SelectField
            label={obj.role === 'connector' ? 'Part A (anchor)' : 'Mounted on'}
            value={obj.attachedTo ?? ''}
            onValue={(v) => updateObject(obj.id, { attachedTo: v || null })}
            options={[{ value: '', label: 'World / free' }, ...partOptions]}
          />
          {obj.role === 'connector' && (
            <SelectField
              label="Part B (moves)"
              value={obj.connectedTo ?? ''}
              onValue={(v) => updateObject(obj.id, { connectedTo: v || null })}
              options={[{ value: '', label: 'None' }, ...partOptions]}
            />
          )}
          {obj.role === 'connector' && (
            <>
              <SelectField
                label="Joint"
                value={obj.jointType}
                onValue={(v) => updateObject(obj.id, { jointType: v as JointType })}
                options={[
                  { value: 'fixed', label: 'Fixed (weld)' },
                  { value: 'hinge', label: 'Hinge (rotate)' },
                  { value: 'slider', label: 'Slider (slide)' },
                  { value: 'ball', label: 'Ball (free)' },
                ]}
              />
              <div className="field axis-row">
                <span>Axis</span>
                <div className="axis-presets">
                  {(['X', 'Y', 'Z'] as const).map((ax, i) => {
                    const active = Math.abs(obj.axis[i]) > 0.9 && Math.abs(obj.axis[(i + 1) % 3]) < 0.1 && Math.abs(obj.axis[(i + 2) % 3]) < 0.1
                    return (
                      <button
                        key={ax}
                        className={`axis-btn ${active ? 'active' : ''}`}
                        onClick={() => {
                          const a: Vec3 = [0, 0, 0]
                          a[i] = 1
                          updateObject(obj.id, { axis: a })
                        }}
                      >
                        {ax}
                      </button>
                    )
                  })}
                </div>
              </div>
              <NumField label="Axis X" value={obj.axis[0]} step={0.1} min={-1} max={1} onValue={(v) => updateObject(obj.id, { axis: [v, obj.axis[1], obj.axis[2]] })} />
              <NumField label="Axis Y" value={obj.axis[1]} step={0.1} min={-1} max={1} onValue={(v) => updateObject(obj.id, { axis: [obj.axis[0], v, obj.axis[2]] })} />
              <NumField label="Axis Z" value={obj.axis[2]} step={0.1} min={-1} max={1} onValue={(v) => updateObject(obj.id, { axis: [obj.axis[0], obj.axis[1], v] })} />
              {obj.attachedTo && obj.connectedTo ? (
                <>
                  <button className="btn snap-btn" onClick={() => snapConnectedPart(obj.id)}>
                    Snap Part B to touch
                  </button>
                  <div className="connection-readout ok">
                    Linked: {labelFor(objects, obj.attachedTo)} ↔ {labelFor(objects, obj.connectedTo)}
                  </div>
                </>
              ) : (
                <div className="connection-readout warn">Needs both Part A and Part B</div>
              )}
            </>
          )}
          {obj.role === 'sensor' && obj.attachedTo && (
            <button className="btn link-jump" onClick={() => select(obj.attachedTo)}>
              Select {labelFor(objects, obj.attachedTo)}
            </button>
          )}
        </Section>
      )}

      {(obj.role === 'connector' || obj.role === 'sensor' || obj.role === 'agent') && (
        <Section title="Control">
          <SelectField
            label="Mode"
            value={obj.controlMode}
            onValue={(v) => updateObject(obj.id, { controlMode: v as ControlMode })}
            options={[
              { value: 'passive', label: 'Passive' },
              { value: 'position', label: 'Position' },
              { value: 'velocity', label: 'Velocity' },
              { value: 'torque', label: 'Torque' },
            ]}
          />
          <SliderField label="Motor" value={obj.motorStrength} min={0} max={8} step={0.1} onValue={(v) => updateObject(obj.id, { motorStrength: v })} />
          {obj.role === 'sensor' && (
            <SelectField
              label="Channel"
              value={obj.sensorChannel}
              onValue={(v) => updateObject(obj.id, { sensorChannel: v })}
              options={[
                { value: 'distance_to_target', label: 'Distance target' },
                { value: 'upright_vector', label: 'Upright vector' },
                { value: 'contact_state', label: 'Contact state' },
                { value: 'agent_velocity', label: 'Agent velocity' },
              ]}
            />
          )}
        </Section>
      )}

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

function labelFor(objects: SceneObject[], id: string | null): string {
  if (!id) return '—'
  const o = objects.find((x) => x.id === id)
  return o ? `${TYPE_LABEL[o.type]} ${o.id.slice(-4)}` : '—'
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

function SelectField({
  label,
  value,
  options,
  onValue,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onValue: (v: string) => void
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onValue(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

// Kept for type completeness; not rendered directly.
export type { SceneObject }
