/** Determinate progress bar with an accessible name and live value. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular">{clamped}%</span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} className="h-3 w-full border-2 border-border-strong">
        <div className="h-full bg-accent" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}
