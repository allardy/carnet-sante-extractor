export type LabIdParts = { NoReq: string; OIDSIL: string; TypeRapp: 'LAB' }

export const encodeLabId = (parts: LabIdParts): string => {
  const json = JSON.stringify(parts)
  // URL-safe base64 (RFC 4648 §5) — the gov API uses standard base64 but the URLs in the wild
  // contain no `+`/`/`/`=` characters in the captures, so standard base64 works. If a future
  // capture shows URL-encoded characters, switch to base64url here.

  return Buffer.from(json, 'utf8').toString('base64').replace(/=+$/, '')
}
