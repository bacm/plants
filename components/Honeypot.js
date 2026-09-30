// Anti-bot trap of the signup form (ticket 101): the web build renders a real
// hidden input named "website" (Honeypot.web.js); the phone never shows one.
export function Honeypot() {
  return null;
}
