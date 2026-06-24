import { demoFrame } from './demoFrames'
import { evaluateRewards, type RewardBlock, type RewardState } from './demoReward'
import { eulerXYZToQuat, type SerializedObject, type Vec3 } from '../viewport/types'
import type { FrameObject } from '../store/useRunStore'

const REACH_RADIUS = 0.6
const OUT_OF_BOUNDS = 14
const MAX_FORCE = 30
const MAX_TORQUE = 8
const DT = 0.016
const MASS = 1.2
const GROUND_Y = 0.5

function dist(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function mulScalar(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function normalize(v: Vec3): Vec3 {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

export interface DemoEnvOptions {
  objects: SerializedObject[]
  rewards: RewardBlock[]
  episodeLength: number
  actionPower: number
  curriculum: number
  skill: number
  seed: number
}

/** Lightweight browser env — same reward blocks + body attraction forces as the backend cube env. */
export class DemoCubeEnv {
  private objects: SerializedObject[]
  private rewards: RewardBlock[]
  private agentId: string
  private agentStart: Vec3
  private targetPos: Vec3
  private maxSteps: number
  private maxForce: number
  private maxTorque: number
  private curriculum: number
  private skill: number
  private rng: () => number

  pos: Vec3
  vel: Vec3 = [0, 0, 0]
  euler: Vec3 = [0, 0, 0]
  stepCount = 0
  private prevDist = 0
  private prevX = 0

  constructor(opts: DemoEnvOptions) {
    this.objects = opts.objects
    this.rewards = opts.rewards
    this.maxSteps = opts.episodeLength
    this.maxForce = MAX_FORCE * opts.actionPower
    this.maxTorque = MAX_TORQUE * opts.actionPower
    this.curriculum = opts.curriculum
    this.skill = opts.skill
    let s = opts.seed >>> 0
    this.rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 0xffffffff
    }

    const agent = opts.objects.find((o) => o.role === 'agent')
    const target = opts.objects.find((o) => o.role === 'target')
    if (!agent || !target) throw new Error('Need an agent and target')
    this.agentId = agent.id
    this.agentStart = [...agent.position] as Vec3
    this.targetPos = [...target.position] as Vec3
    this.pos = [...this.agentStart] as Vec3
    this.prevDist = dist(this.pos, this.targetPos)
    this.prevX = this.pos[0]
  }

  setSkill(skill: number): void {
    this.skill = skill
  }

  reset(): void {
    this.pos = [
      this.agentStart[0] + (this.rng() - 0.5) * 0.8 * (1 - this.curriculum * 0.5),
      this.agentStart[1],
      this.agentStart[2] + (this.rng() - 0.5) * 0.8 * (1 - this.curriculum * 0.5),
    ]
    this.vel = [0, 0, 0]
    this.euler = [0, 0, 0]
    this.stepCount = 0
    this.prevDist = dist(this.pos, this.targetPos)
    this.prevX = this.pos[0]
  }

  /** Policy output in [-1, 1]^6 — body attraction toward target, noise fades as skill rises. */
  policyAction(): number[] {
    const dir = normalize(sub(this.targetPos, this.pos))
    const noise = (1 - this.skill) * (0.85 - this.curriculum * 0.35)
    const pull = 0.35 + this.skill * 0.65
    const r = () => (this.rng() - 0.5) * 2 * noise
    return [
      clamp(dir[0] * pull + r(), -1, 1),
      clamp(dir[1] * pull * 0.25 + r() * 0.15, -1, 1),
      clamp(dir[2] * pull + r(), -1, 1),
      clamp(r() * 0.4, -1, 1),
      clamp(r() * 0.4, -1, 1),
      clamp(r() * 0.4, -1, 1),
    ]
  }

  step(action: number[]): {
    reward: number
    terminated: boolean
    truncated: boolean
    info: { reached: boolean; out_of_bounds_metric: number; episode?: { r: number } }
  } {
    const force = mulScalar([action[0], action[1], action[2]], this.maxForce)
    const torque = mulScalar([action[3], action[4], action[5]], this.maxTorque)

    this.vel = add(this.vel, mulScalar(force, DT / MASS))
    this.vel = [this.vel[0] * 0.92, this.vel[1] * 0.92, this.vel[2] * 0.92]
    this.pos = add(this.pos, mulScalar(this.vel, DT))
    this.pos[1] = GROUND_Y
    this.euler = [
      this.euler[0] + torque[0] * DT * 0.08,
      this.euler[1] + torque[1] * DT * 0.08,
      this.euler[2] + torque[2] * DT * 0.08,
    ]

    this.stepCount += 1
    const d = dist(this.pos, this.targetPos)
    const reached = d < REACH_RADIUS
    const oob = Math.abs(this.pos[0]) > OUT_OF_BOUNDS || Math.abs(this.pos[2]) > OUT_OF_BOUNDS
    const progress = this.prevDist - d
    const forwardDelta = this.pos[0] - this.prevX
    const upright = Math.max(0, 1 - Math.abs(this.euler[0]) - Math.abs(this.euler[2]))

    const state: RewardState = {
      progress,
      reached,
      upright,
      forward_delta: forwardDelta,
      fallen: upright < 0.25,
      out_of_bounds: oob,
      action_energy: action.reduce((s, v) => s + v * v, 0),
    }
    const reward = evaluateRewards(this.rewards, state)
    this.prevDist = d
    this.prevX = this.pos[0]

    const truncated = this.stepCount >= this.maxSteps
    const terminated = reached || oob
    return {
      reward,
      terminated,
      truncated,
      info: {
        reached,
        out_of_bounds_metric: oob ? 1 : Math.max(0, (Math.max(Math.abs(this.pos[0]), Math.abs(this.pos[2])) - OUT_OF_BOUNDS) / OUT_OF_BOUNDS),
      },
    }
  }

  frame(): FrameObject[] {
    const base = demoFrame(this.objects, this.agentId, this.agentStart, this.pos)
    const rot = eulerXYZToQuat(this.euler)
    return base.map((o) => (o.id === this.agentId ? { ...o, rot } : o))
  }
}
