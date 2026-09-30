// Image type helpers for sync (ticket 094). Pure.

const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

export function mimeForExtension(ext) {
  return MIME_BY_EXT[String(ext).toLowerCase()] ?? 'image/jpeg';
}

// The extension of a downloaded image, from its first bytes (the file has no
// name to go by). Falls back to 'jpg'.
export function sniffImageExtension(bytes) {
  const b = bytes ?? [];
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  const ascii = (from, to) => String.fromCharCode(...Array.from(b).slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(4, 8) === 'ftyp') return 'heic';
  return 'jpg';
}
