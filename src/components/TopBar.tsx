import { useSceneStore } from '../store/useSceneStore'
import { useRunStore } from '../store/useRunStore'
import { useTrainingStore } from '../store/useTrainingStore'
import { startRun, stopRun } from '../net/simSocket'
import { startTrain, stopTrain } from '../net/trainSocket'
import { serializeScene } from '../viewport/types'
import { rewardPayload, useProgramStore } from '../store/useProgramStore'

export function TopBar() {
  const running = useRunStore((s) => s.running)
  const runError = useRunStore((s) => s.error)
  const objects = useSceneStore((s) => s.objects)
  const selectedId = useSceneStore((s) => s.selectedId)
  const transformMode = useSceneStore((s) => s.transformMode)
  const setTransformMode = useSceneStore((s) => s.setTransformMode)

  const training = useTrainingStore((s) => s.status === 'training')
  const trainError = useTrainingStore((s) => s.error)
  const policyName = useTrainingStore((s) => s.policyName)
  const blocks = useProgramStore((s) => s.blocks)
  const totalTimesteps = useProgramStore((s) => s.totalTimesteps)
  const episodeLength = useProgramStore((s) => s.episodeLength)
  const actionPower = useProgramStore((s) => s.actionPower)
  const curriculum = useProgramStore((s) => s.curriculum)

  const hasAgent = objects.some((o) => o.role === 'agent')
  // A build can only move through motors. Wheels/parts alone are dead weight
  // until a Motor drives them — warn so people don't train a thing that can't move.
  const hasMotor = objects.some((o) => o.type === 'motor')
  const toolsEnabled = !running && !training && !!selectedId

  const handleRun = () => {
    if (running) {
      stopRun()
      return
    }
    startRun(serializeScene(objects), { policy: policyName ?? undefined }).catch((e: unknown) => {
      useRunStore.getState().setError(e instanceof Error ? e.message : String(e))
    })
  }

  const handleTrain = () => {
    if (training) {
      stopTrain()
      return
    }
    useTrainingStore.getState().reset()
    startTrain(serializeScene(objects), {
      totalTimesteps,
      rewards: rewardPayload(blocks),
      episodeLength,
      actionPower,
      curriculum,
    }).catch((e: unknown) => {
      useTrainingStore.getState().setError(e instanceof Error ? e.message : String(e))
    })
  }

  const runLabel = policyName ? '▶ Run trained' : '▶ Run'
  const runTitle = hasAgent
    ? policyName
      ? 'Run the trained policy — watch it reach the target'
      : 'Drop the agent under gravity and watch it settle'
    : 'Add a Cube (agent) to run a simulation'

  return (
    <div className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name">Telokine</span>
      </div>

      <div className="toolgroup">
        <button
          className={`btn tool ${transformMode === 'translate' ? 'active' : ''}`}
          onClick={() => setTransformMode('translate')}
          disabled={!toolsEnabled}
          title="Move (drag the gizmo arrows)"
        >
          ✥ Move
        </button>
        <button
          className={`btn tool ${transformMode === 'rotate' ? 'active' : ''}`}
          onClick={() => setTransformMode('rotate')}
          disabled={!toolsEnabled}
          title="Rotate (drag the gizmo rings)"
        >
          ⟳ Rotate
        </button>
      </div>

      <div className="spacer" />
      {(runError || trainError) && <span className="err">{trainError ?? runError}</span>}
      {!hasAgent && !running && !training && (
        <span className="agent-hint">Add a Cube or a starter robot to begin</span>
      )}
      {hasAgent && !hasMotor && !running && !training && (
        <span className="agent-hint">No motors yet — add a Motor (and a wheel/part) so your agent can actually move</span>
      )}
      <button
        className={`btn run ${running ? 'stop' : ''}`}
        onClick={handleRun}
        disabled={(!hasAgent && !running) || training}
        title={runTitle}
      >
        {running ? '■ Stop' : runLabel}
      </button>
      <button
        className={`btn primary ${training ? 'stop' : ''}`}
        onClick={handleTrain}
        disabled={(!hasAgent && !training) || running}
        title={hasAgent ? 'Train the agent with reinforcement learning' : 'Add a Cube (agent) to train'}
      >
        {training ? '■ Stop' : 'Train'}
      </button>
    </div>
  )
}
