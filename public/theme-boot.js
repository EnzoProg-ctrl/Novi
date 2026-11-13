// Apply a signed-in student's saved look before first paint, so dark mode
// never flashes white. PreferencesProvider takes over once React runs.
// A file rather than an inline script, so the Content Security Policy can
// forbid inline scripts entirely.
try {
  var cached = JSON.parse(localStorage.getItem('novi.preferences') || 'null')
  var signedIn = Object.keys(localStorage).some(function (k) { return /^sb-.+-auth-token$/.test(k) })
  if (cached && cached.prefs && signedIn) {
    var p = cached.prefs, root = document.documentElement
    var dark = p.theme === 'dark' || (p.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    if (dark) root.setAttribute('data-theme', 'dark')
    if (p.accent && p.accent !== 'coral') root.setAttribute('data-accent', p.accent)
    if (p.fontScale && p.fontScale !== 'medium') root.setAttribute('data-font', p.fontScale)
  }
} catch (e) {}
