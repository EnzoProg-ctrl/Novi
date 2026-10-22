import { MascotRig } from './MascotRig'

export function FullPageLoader({ label = 'Loading…' }) {
  return (
    <div className="full-loader">
      <MascotRig pose="waving-sm" size={44} className="bob" />
      <p className="hint">{label}</p>
    </div>
  )
}
