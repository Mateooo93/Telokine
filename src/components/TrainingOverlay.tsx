import { useTrainingStore } from '../store/useTrainingStore'
import { stopTrain } from '../net/trainSocket'
import { RewardGraph } from './RewardGraph'

/**
 * Floating training dashboard shown over the viewport while/after training.
 * Live reward + success graph, progress, and a Stop button.
 */
export function TrainingOverlay() {
  const status = useTrainingStore((s) => s.status)
  const progress = useTrainingStore((s) => s.progress)
  const history = useTrainingStore((s) => s.history)
  const episodes = useTrainingStore((s) => s.episodes)
  const elapsed = useTrainingStore((s) => s.elapsed)
  const error = useTrainingStore((s) => s.error)
  const policyName = useTrainingStore((s) => s.policyName)
  const previewEpisode = useTrainingStore((s) => s.previewEpisode)
  const device = useTrainingStore((s) => s.device)

  if (status === 'idle' && !error) return null

  const last = history[history.length - 1]
  const successPct = last ? Math.round(last.success * 100) : 0

  return (
    <div className="train-overlay">
      <div className="train-head">
        {status === 'training' && (
          <>
            <span className="dot pulse" />
            <b>Training…</b>
            <span className="muted">{Math.round(progress * 100)}%</span>
            <span className="muted">· {elapsed.toFixed(0)}s</span>
            <span className="muted">· {episodes} tries</span>
            {device && (
              <span className="muted">· {device === 'cuda' ? 'GPU' : 'CPU'}</span>
            )}
            <button className="btn mini danger" onClick={stopTrain}>
              Stop
            </button>
          </>
        )}
        {status === 'training' && previewEpisode != null && (
          <span className="preview-chip">▶ Watching checkpoint · {previewEpisode} tries</span>
        )}
        {status === 'done' && (
          <>
            <span className="dot done" />
            <b>Trained!</b>
            <span className="muted">
              reward {last ? `${last.reward >= 0 ? '+' : ''}${last.reward.toFixed(1)}` : '—'} · {successPct}% reach
            </span>
            <span className="muted">in {elapsed.toFixed(0)}s</span>
          </>
        )}
        {status === 'error' && (
          <>
            <span className="dot err" />
            <b>Training failed</b>
            <span className="muted err-text">{error}</span>
          </>
        )}
      </div>

      <RewardGraph history={history} />

      {status === 'done' && (
        <div className="train-hint">
          {policyName ? 'Press ▶ Run trained to watch the cube reach the target.' : 'Policy saved.'}
        </div>
      )}
    </div>
  )
}
