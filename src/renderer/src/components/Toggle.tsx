/** A neon on/off switch. */
export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${on ? 'toggle-on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span className="toggle-knob" />
    </button>
  )
}
