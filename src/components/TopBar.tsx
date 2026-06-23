import { useSceneStore } from '../store/useSceneStore'
import { useRunStore } from '../store/useRunStore'
import { startRun, stopRun } from '../net/simSocket'
import { serializeScene } from '../viewport/types'

export function TopBar() {
  const running = useRunStore((s) => s.running)
  const error = useRunStore((s) => s.error)
  const objects = useSceneStore((s) => s.objects)

  const hasAgent = objects.some((o) => o.role === 'agent')

  const handleRun = () => {
    if (running) {
      stopRun()
      return
    }
    startRun(serializeScene(objects)).catch((e: unknown) => {
      useRunStore.getState().setError(e instanceof Error ? e.message : String(e))
    })
  }

  return (
    <div className="topbar">
      <div className="brand">
        Telokine<span className="dot">.</span>
      </div>
      <div className="spacer" />
      {error && <span className="err">{error}</span>}
      <button
        className={`btn run ${running ? 'stop' : ''}`}
        onClick={handleRun}
        disabled={!hasAgent && !running}
        title={hasAgent ? 'Drop the agent under gravity and watch it settle' : 'Add a Cube (agent) to run a simulation'}
      >
        {running ? '■ Stop' : '▶ Run'}
      </button>
      <button className="btn primary" disabled title="Start training (coming soon)">
        Train
      </button>
    </div>
  )
}
