import { useId, useState } from 'react'

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
}

const EyeIcon = () => (
  <svg {...iconProps}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeOffIcon = () => (
  <svg {...iconProps}>
    <path d="M10.6 6.7A7.9 7.9 0 0112 6.5c6 0 9.5 6.5 9.5 6.5a16 16 0 01-3.2 3.9" />
    <path d="M6.3 8.1A15.9 15.9 0 002.5 13S6 19.5 12 19.5c1.5 0 2.8-.4 4-1" />
    <path d="M9.9 10.4a3 3 0 004.2 4.2" />
    <path d="M3 3l18 18" />
  </svg>
)

/**
 * Password input with a show/hide toggle.
 *
 * The toggle is a real button so it is keyboard reachable, and it is
 * type="button" so pressing Enter in the field still submits the form rather
 * than flipping visibility.
 */
export function PasswordField({
  label,
  value,
  onChange,
  id,
  placeholder,
  autoComplete = 'current-password',
  required = false,
  hint,
}) {
  const [visible, setVisible] = useState(false)
  const generatedId = useId()
  const inputId = id ?? generatedId
  const action = visible ? 'Hide password' : 'Show password'

  return (
    <div className="field">
      <label className="label" htmlFor={inputId}>{label}</label>

      <div className="password-wrap">
        <input
          id={inputId}
          className="input password-input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((shown) => !shown)}
          aria-label={action}
          aria-pressed={visible}
          aria-controls={inputId}
          title={action}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>

      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}
