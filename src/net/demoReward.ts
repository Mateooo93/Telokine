/** Browser mirror of backend/telokine/reward.py — same block terms. */

export interface RewardBlock {
  id: string
  kind: string
  name: string
  weight: number
}

export interface RewardState {
  progress: number
  reached: boolean
  upright: number
  forward_delta: number
  fallen: boolean
  out_of_bounds: boolean
  action_energy: number
}

function term(name: string, state: RewardState): number {
  switch (name) {
    case 'Approach Target':
    case 'Attraction':
      return Math.max(-1, Math.min(1, state.progress)) * 0.5
    case 'Reach Target':
      return state.reached ? 10 : 0
    case 'Stay Upright':
      return Math.max(0, state.upright)
    case 'Move Forward':
      return Math.max(0, state.forward_delta)
    case 'Fall':
      return state.fallen ? 4 : 0
    case 'Touch Wall':
      return state.out_of_bounds ? 3 : 0
    case 'Move Backward':
      return Math.max(0, -state.forward_delta)
    case 'Exertion':
      return 0.01 * state.action_energy
    default:
      return 0
  }
}

export function evaluateRewards(blocks: RewardBlock[], state: RewardState): number {
  const active =
    blocks.length > 0
      ? blocks
      : [
          { id: 'd1', kind: 'reward' as const, name: 'Approach Target', weight: 1 },
          { id: 'd2', kind: 'reward' as const, name: 'Reach Target', weight: 4 },
          { id: 'd3', kind: 'penalty' as const, name: 'Exertion', weight: 0.4 },
        ]
  let total = 0
  for (const block of active) {
    const magnitude = term(block.name, state)
    const sign = block.kind === 'penalty' ? -1 : 1
    total += sign * block.weight * magnitude
  }
  return total
}

export function blockWeight(blocks: RewardBlock[], name: string): number {
  return blocks.filter((b) => b.name === name).reduce((s, b) => s + b.weight, 0)
}
