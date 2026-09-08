import { Mascot } from './Mascot'

export function FullPageLoader({ label = 'Loading…' }) {
  return (
    <div className="full-loader">
      <Mascot size={44} mood="calm" className="bob" />
      <p className="hint">{label}</p>
    </div>
  )
}
