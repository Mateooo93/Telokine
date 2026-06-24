import { useEffect, useState, type RefObject } from 'react'

const HINT_KEY = 'telokine-train-hint-dismissed'

export function useTrainHintDismissed(): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(HINT_KEY) === '1')
  const dismiss = () => {
    localStorage.setItem(HINT_KEY, '1')
    setDismissed(true)
  }
  return [dismissed, dismiss]
}

export function TrainHint({
  anchorRef,
  onPages,
  onDismiss,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>
  onPages: boolean
  onDismiss: () => void
}) {
  const [style, setStyle] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    const place = () => {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setStyle({ left: r.left + r.width / 2, top: r.bottom + 10 })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchorRef])

  if (!style) return null

  const label = onPages ? 'Simulate train' : 'Train'

  return (
    <div className="train-hint-popover" style={{ left: style.left, top: style.top }}>
      <span className="train-hint-arrow" aria-hidden>
        ↑
      </span>
      <div className="train-hint-card">
        <b>Start here</b>
        <p>
          Hit <em>{label}</em> to watch the walker learn to reach the target.
        </p>
        <button type="button" className="btn mini" onClick={onDismiss}>
          Got it
        </button>
      </div>
    </div>
  )
}
