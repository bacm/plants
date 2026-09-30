// A real <input> (react-native-web's TextInput drops `name`), moved off-screen
// rather than display:none so bots that fill visible-looking fields still do.
// Hidden from assistive tech and the tab order.
export function Honeypot({ value, onChange }) {
  return (
    <input
      type="text"
      name="website"
      id="website"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      style={{ position: 'absolute', left: -10000, width: 1, height: 1, opacity: 0 }}
    />
  );
}
