import { createObject, type SceneObject, type Vec3 } from '../viewport/types'

/** Stable object ids — must match `public/walker-demo.json` captured from MuJoCo. */
export const WALKER_DEMO_IDS = {
  body: 'walker-body',
  legL: 'walker-leg-l',
  motorL: 'walker-motor-l',
  legR: 'walker-leg-r',
  motorR: 'walker-motor-r',
  target: 'walker-target',
} as const

function connector(
  type: 'motor' | 'joint',
  id: string,
  parent: SceneObject,
  child: SceneObject,
  pivot: Vec3,
  axis: Vec3,
): SceneObject {
  const c = createObject(type, pivot)
  c.id = id
  c.attachedTo = parent.id
  c.connectedTo = child.id
  c.anchor = pivot
  c.connectedAnchor = [...child.position] as Vec3
  c.axis = axis
  c.jointType = 'hinge'
  c.controlMode = type === 'motor' ? 'torque' : 'passive'
  return c
}

/** Default walker build used in the editor and on GitHub Pages. */
export function walkerDemoTemplate(): SceneObject[] {
  const body = createObject('cube', [-2, 1.05, 0])
  body.id = WALKER_DEMO_IDS.body
  body.role = 'agent'
  body.dimensions = [1.1, 0.42, 0.6]
  body.color = '#c9933f'

  const legL = createObject('beam', [-2, 0.5, -0.36])
  legL.id = WALKER_DEMO_IDS.legL
  legL.dimensions = [0.24, 1.1, 0.24]
  legL.color = '#b9c0c3'
  legL.rotation = [0, 0, 0.35]

  const motorL = connector('motor', WALKER_DEMO_IDS.motorL, body, legL, [-2, 0.84, -0.36], [0, 0, 1])
  motorL.motorStrength = 4

  const legR = createObject('beam', [-2, 0.5, 0.36])
  legR.id = WALKER_DEMO_IDS.legR
  legR.dimensions = [0.24, 1.1, 0.24]
  legR.color = '#b9c0c3'
  legR.rotation = [0, 0, -0.35]

  const motorR = connector('motor', WALKER_DEMO_IDS.motorR, body, legR, [-2, 0.84, 0.36], [0, 0, 1])
  motorR.motorStrength = 4

  return [body, legL, motorL, legR, motorR]
}

export function walkerDemoTarget(): SceneObject {
  const target = createObject('target', [4, 0.5, 0])
  target.id = WALKER_DEMO_IDS.target
  return target
}
