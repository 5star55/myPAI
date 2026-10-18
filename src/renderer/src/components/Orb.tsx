/** The animated "presence" orb. Spins faster while the assistant is thinking. */
export function Orb({ busy = false, size = 132 }: { busy?: boolean; size?: number }) {
  return (
    <div className={`orb ${busy ? 'orb-busy' : ''}`} style={{ width: size, height: size }} aria-hidden>
      <div className="orb-ring" />
      <div className="orb-ring orb-ring-2" />
      <div className="orb-core" />
    </div>
  )
}
