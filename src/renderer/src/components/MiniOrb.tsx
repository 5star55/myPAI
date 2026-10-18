/** A tiny version of pai's orb, used as the "working" spinner (about the size of a letter). */
export function MiniOrb({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`mini-orb ${className}`} style={{ width: size, height: size }} aria-hidden>
      <span className="mini-orb-ring" />
      <span className="mini-orb-core" />
    </span>
  )
}
