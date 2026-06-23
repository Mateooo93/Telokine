export function TopBar() {
  return (
    <div className="topbar">
      <div className="brand">
        Telokine<span className="dot">.</span>
      </div>
      <div className="spacer" />
      <button className="btn run" disabled title="Run a single rollout with the current policy (coming soon)">
        ▶ Run
      </button>
      <button className="btn primary" disabled title="Start training (coming soon)">
        Train
      </button>
    </div>
  )
}
