/** The one-click off switch. Off = stops the current reply and denies all pending actions. */
export function PowerSwitch({ on }: { on: boolean }) {
  return (
    <button
      className={`power ${on ? 'power-on' : 'power-off'}`}
      onClick={() => window.pai.setEnabled(!on)}
      aria-pressed={on}
      title={on ? 'Turn the assistant OFF now' : 'Turn the assistant ON'}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
        <path d="M12 3v8M6.3 6.3a8 8 0 1 0 11.4 0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      {on ? 'ON' : 'OFF'}
    </button>
  )
}
