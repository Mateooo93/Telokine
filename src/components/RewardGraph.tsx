import type { TelemetryPoint } from '../store/useTrainingStore'

interface Props {
  history: TelemetryPoint[]
  width?: number
  height?: number
}

/**
 * Tiny dependency-free line chart of reward (blue) and success rate (orange,
 * 0..1) over the training telemetry history. Auto-scales the reward axis.
 */
export function RewardGraph({ history, width = 260, height = 90 }: Props) {
  const pad = 6
  const w = width - pad * 2
  const h = height - pad * 2

  if (history.length === 0) {
    return (
      <svg width={width} height={height} className="graph">
        <text x={width / 2} y={height / 2} textAnchor="middle" className="graph-empty">
          waiting for data…
        </text>
      </svg>
    )
  }

  const rewards = history.map((p) => p.reward)
  const outOfBounds = history.map((p) => p.outOfBoundsMetric)
  let lo = Math.min(0, ...rewards)
  let hi = Math.max(0, ...rewards)
  if (hi - lo < 1) hi = lo + 1 // avoid div-by-zero / flat line

  const xAt = (i: number) => pad + (history.length === 1 ? w / 2 : (i / (history.length - 1)) * w)
  const yReward = (r: number) => pad + h - ((r - lo) / (hi - lo)) * h
  const ySuccess = (s: number) => pad + h - s * h
  const yOOB = (oob: number) => pad + h - oob * h // out-of-bounds is [0,1]

  const rewardPath = history.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yReward(p.reward)}`).join(' ')
  const successPath = history.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${ySuccess(p.success)}`).join(' ')
  const oobPath = history.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yOOB(p.outOfBoundsMetric)}`).join(' ')

  const zeroY = yReward(0)

  return (
    <svg width={width} height={height} className="graph">
      {/* zero line for reward */}
      <line x1={pad} y1={zeroY} x2={width - pad} y2={zeroY} className="graph-zero" />
      {/* out-of-bounds metric (0..1) */}
      <path d={oobPath} fill="none" className="graph-oob" />
      {/* success rate (0..1) */}
      <path d={successPath} fill="none" className="graph-success" />
      {/* reward */}
      <path d={rewardPath} fill="none" className="graph-reward" />
      <text x={pad} y={pad + 2} className="graph-label">
        reward {rewards[rewards.length - 1] >= 0 ? '+' : ''}
        {rewards[rewards.length - 1].toFixed(1)}
      </text>
    </svg>
  )
}
