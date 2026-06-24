import { create } from 'zustand'
import { uid } from '../viewport/types'

export type BlockKind = 'sensor' | 'logic' | 'reward' | 'penalty' | 'control'

export interface ProgramBlock {
  id: string
  kind: BlockKind
  name: string
  weight: number
  x: number
  y: number
}

export interface ProgramConnection {
  id: string
  from: string
  to: string
}

interface ProgramState {
  blocks: ProgramBlock[]
  connections: ProgramConnection[]
  totalTimesteps: number
  episodeLength: number
  actionPower: number
  curriculum: number

  addBlock: (kind: BlockKind, name: string) => void
  removeBlock: (id: string) => void
  moveBlock: (id: string, position: { x: number; y: number }) => void
  setBlockWeight: (id: string, weight: number) => void
  addConnection: (from: string, to: string) => void
  removeConnection: (id: string) => void
  loadTemplate: (template: TemplateName) => void
  setBlocks: (blocks: ProgramBlock[]) => void
  setTrainingParam: (key: 'totalTimesteps' | 'episodeLength' | 'actionPower' | 'curriculum', value: number) => void
}

export type TemplateName = 'reach' | 'upright' | 'efficient'

const columnX: Record<BlockKind, number> = {
  sensor: 18,
  logic: 238,
  reward: 458,
  penalty: 458,
  control: 678,
}

function block(kind: BlockKind, name: string, y: number, weight = 1): ProgramBlock {
  return { id: uid('blk'), kind, name, weight, x: columnX[kind], y }
}

function connect(from: ProgramBlock, to: ProgramBlock): ProgramConnection {
  return { id: uid('edge'), from: from.id, to: to.id }
}

function reachTemplate() {
  const distance = block('sensor', 'Distance To Target', 24)
  const velocity = block('sensor', 'Agent Velocity', 132)
  const attraction = block('reward', 'Attraction', 48, 1.2)
  const reach = block('reward', 'Reach Target', 156, 4)
  const exertion = block('penalty', 'Exertion', 264, 0.4)
  const policy = block('control', 'PPO Policy', 104)
  return {
    blocks: [distance, velocity, attraction, reach, exertion, policy],
    connections: [connect(distance, attraction), connect(distance, reach), connect(velocity, exertion), connect(attraction, policy), connect(reach, policy), connect(exertion, policy)],
  }
}

function uprightTemplate() {
  const up = block('sensor', 'Upright Vector', 24)
  const distance = block('sensor', 'Distance To Target', 132)
  const upright = block('reward', 'Stay Upright', 48, 1.6)
  const approach = block('reward', 'Approach Target', 156, 1)
  const fall = block('penalty', 'Fall', 264, 2.4)
  const policy = block('control', 'PPO Policy', 104)
  return {
    blocks: [up, distance, upright, approach, fall, policy],
    connections: [connect(up, upright), connect(up, fall), connect(distance, approach), connect(upright, policy), connect(approach, policy), connect(fall, policy)],
  }
}

function efficientTemplate() {
  const distance = block('sensor', 'Distance To Target', 24)
  const velocity = block('sensor', 'Agent Velocity', 132)
  const approach = block('reward', 'Approach Target', 48, 1)
  const forward = block('reward', 'Move Forward', 156, 0.6)
  const exertion = block('penalty', 'Exertion', 264, 1.1)
  const policy = block('control', 'PPO Policy', 104)
  return {
    blocks: [distance, velocity, approach, forward, exertion, policy],
    connections: [connect(distance, approach), connect(velocity, forward), connect(velocity, exertion), connect(approach, policy), connect(forward, policy), connect(exertion, policy)],
  }
}

function template(name: TemplateName) {
  if (name === 'upright') return uprightTemplate()
  if (name === 'efficient') return efficientTemplate()
  return reachTemplate()
}

export function rewardPayload(blocks: ProgramBlock[]) {
  return blocks
    .filter((b) => b.kind === 'reward' || b.kind === 'penalty')
    .map((b) => ({ id: b.id, kind: b.kind, name: b.name, weight: b.weight }))
}

export const useProgramStore = create<ProgramState>((set) => ({
  ...reachTemplate(),
  totalTimesteps: 150_000,
  episodeLength: 250,
  actionPower: 1,
  curriculum: 0.25,

  addBlock: (kind, name) =>
    set((state) => {
      const count = state.blocks.filter((b) => b.kind === kind).length
      return { blocks: [...state.blocks, block(kind, name, 24 + count * 108)] }
    }),

  removeBlock: (id) =>
    set((state) => ({
      blocks: state.blocks.filter((b) => b.id !== id),
      connections: state.connections.filter((c) => c.from !== id && c.to !== id),
    })),

  moveBlock: (id, position) =>
    set((state) => ({
      blocks: state.blocks.map((b) => (b.id === id ? { ...b, x: position.x, y: position.y } : b)),
    })),

  setBlockWeight: (id, weight) =>
    set((state) => ({
      blocks: state.blocks.map((b) => (b.id === id ? { ...b, weight } : b)),
    })),

  addConnection: (from, to) =>
    set((state) => {
      if (from === to) return state
      const exists = state.connections.some((c) => c.from === from && c.to === to)
      if (exists) return state
      return { connections: [...state.connections, { id: uid('edge'), from, to }] }
    }),

  removeConnection: (id) =>
    set((state) => ({ connections: state.connections.filter((c) => c.id !== id) })),

  loadTemplate: (name) => set(template(name)),

  setBlocks: (blocks) => set({ blocks, connections: [] }),

  setTrainingParam: (key, value) => set({ [key]: value }),
}))
