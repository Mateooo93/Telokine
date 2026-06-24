import { useSceneStore } from '../store/useSceneStore'
import { TYPE_LABEL, type ObjectType } from '../viewport/types'

const BODY: { type: ObjectType; color: string; note: string }[] = [
  { type: 'cube', color: '#d18b3d', note: 'the trainable core (agent)' },
  { type: 'beam', color: '#b9c0c3', note: 'limb or chassis bar' },
  { type: 'capsule', color: '#7fb7a8', note: 'rounded limb' },
  { type: 'sphere', color: '#8fa3ad', note: 'mass node' },
  { type: 'wheel', color: '#2f3337', note: 'rolling part' },
]

const CONNECTORS: { type: Extract<ObjectType, 'motor' | 'joint'>; color: string; note: string }[] = [
  { type: 'motor', color: '#a86f37', note: 'powered hinge — drives the robot' },
  { type: 'joint', color: '#c7a35a', note: 'free hinge — pivots, no power' },
]

const WORLD: { type: ObjectType; color: string; note: string }[] = [
  { type: 'target', color: '#d6a246', note: 'goal marker' },
  { type: 'floor', color: '#1d2225', note: 'platform' },
]

export function Palette() {
  const addObject = useSceneStore((s) => s.addObject)
  const placementTool = useSceneStore((s) => s.placementTool)
  const placementDraft = useSceneStore((s) => s.placementDraft)
  const setPlacementTool = useSceneStore((s) => s.setPlacementTool)
  const cancelPlacement = useSceneStore((s) => s.cancelPlacement)
  const addTemplate = useSceneStore((s) => s.addTemplate)
  const objects = useSceneStore((s) => s.objects)

  const links = objects.filter((o) => o.role === 'connector' && o.attachedTo && o.connectedTo).length
  const hasAgent = objects.some((o) => o.role === 'agent')

  return (
    <div className="sidebar">
      <div className="panel-title">
        <div>
          <h3>Build</h3>
          <span>{objects.length} parts · {links} links</span>
        </div>
        <div className={`ready-pill ${hasAgent ? 'ok' : 'warn'}`} title={hasAgent ? 'Scene has an agent — ready to run & train' : 'Add a Cube or load a starter robot to run'}>
          {hasAgent ? 'Ready' : 'No agent'}
        </div>
      </div>

      <div className="template-kit">
        <h4>Starter Robots</h4>
        <span className="kit-note">Loads a complete, ready-to-run agent.</span>
        <div className="kit-buttons">
          <button onClick={() => addTemplate('rover')}>Rover</button>
          <button onClick={() => addTemplate('walker')}>Walker</button>
          <button onClick={() => addTemplate('arm')}>Arm</button>
        </div>
      </div>

      <div className="palette">
        <div className="palette-group">
          <h4>Body parts</h4>
          <span className="group-note">Click to drop into the scene.</span>
          {BODY.map((p) => (
            <button key={p.type} className="item" onClick={() => addObject(p.type)}>
              <span className="swatch" style={{ background: p.color }} />
              <span>
                <b>{TYPE_LABEL[p.type]}</b>
                <small>{p.note}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="palette-group connect-group">
          <h4>Connect parts</h4>
          <span className="group-note">Pick a tool, then click two parts to link them.</span>
          {CONNECTORS.map((p) => {
            const active = placementTool === p.type
            return (
              <button
                key={p.type}
                className={`item ${active ? 'active' : ''}`}
                onClick={() => setPlacementTool(active ? null : p.type)}
              >
                <span className="swatch" style={{ background: p.color }} />
                <span>
                  <b>{TYPE_LABEL[p.type]}</b>
                  <small>{active ? (placementDraft ? 'now click part B →' : 'now click part A →') : p.note}</small>
                </span>
              </button>
            )
          })}
          <button
            className={`item ${placementTool === 'sensor' ? 'active' : ''}`}
            onClick={() => setPlacementTool(placementTool === 'sensor' ? null : 'sensor')}
          >
            <span className="swatch" style={{ background: '#6f8f9b' }} />
            <span>
              <b>Sensor</b>
              <small>{placementTool === 'sensor' ? 'click a surface to mount' : 'reward signal probe'}</small>
            </span>
          </button>
        </div>

        <div className="palette-group">
          <h4>World</h4>
          {WORLD.map((p) => (
            <button key={p.type} className="item" onClick={() => addObject(p.type)}>
              <span className="swatch" style={{ background: p.color }} />
              <span>
                <b>{TYPE_LABEL[p.type]}</b>
                <small>{p.note}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      {placementTool && (
        <div className="placement-card">
          <b>Placing {TYPE_LABEL[placementTool]}</b>
          {placementTool === 'sensor' ? (
            <ol className="ph-steps">
              <li className="active">Hover a body part to preview.</li>
              <li>Click the surface to mount it.</li>
            </ol>
          ) : (
            <ol className="ph-steps">
              <li className={placementDraft ? 'done' : 'active'}>Click part A (the pivot).</li>
              <li className={placementDraft ? 'active' : ''}>Click part B — it snaps on, touching.</li>
            </ol>
          )}
          <button onClick={cancelPlacement}>Cancel</button>
        </div>
      )}
    </div>
  )
}
