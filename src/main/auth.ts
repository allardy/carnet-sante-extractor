import { type Session, type WebContents } from 'electron'

// The Carnet Santé SPA (Angular) attaches an `Authorization: Bearer <JWT>` header to every
// /api/1/* request via an HttpInterceptor. The JWT is issued by RAMQ's ADFS after the
// ClicSEQUR login and lives in-memory inside the SPA — not in localStorage/sessionStorage
// where we could read it. Our raw `session.fetch` from the main process never has it, and
// even `page.executeJavaScript("fetch(...)")` bypasses the Angular interceptor and 403s.
//
// Workaround: intercept the partition's outgoing requests at the network layer (which sees
// every header the SPA sets), capture the Bearer once, and replay it on our own session.fetch
// calls. The token is short-lived (≈1h) but is refreshed in-place by the SPA whenever it
// expires, so we just always read the latest captured value.

let capturedAuth: string | null = null

export const installAuthCapture = (session: Session): void => {
  session.webRequest.onBeforeSendHeaders(
    {
      urls: ['https://*.carnetsante.gouv.qc.ca/*', 'https://*.ramq.gouv.qc.ca/*'],
    },
    (details, callback) => {
      const headers = details.requestHeaders
      const auth = headers['Authorization'] ?? headers['authorization']

      if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
        capturedAuth = auth
      }

      callback({ requestHeaders: headers })
    },
  )
}

export const getCapturedAuth = (): string | null => capturedAuth

// Bootstrap fallback: oidc-client-js stores the user object (with `access_token`) in
// sessionStorage under a key like `oidc.user:<authority>:<client_id>`. Read it directly so
// the first extract click works without waiting for the SPA to fire another request.
export const seedAuthFromSessionStorage = async (webContents: WebContents): Promise<void> => {
  const code = `
    (() => {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith('oidc.user:')) {
          try {
            const user = JSON.parse(sessionStorage.getItem(key))
            if (user && typeof user.access_token === 'string') {
              return user.access_token
            }
          } catch (_) {}
        }
      }
      return null
    })()
  `
  const token = (await webContents.executeJavaScript(code, true)) as string | null

  if (typeof token === 'string' && token.length > 0) {
    capturedAuth = `Bearer ${token}`
  }
}

export const authHeaders = (referer: string): Record<string, string> => {
  const auth = capturedAuth

  if (!auth) {
    throw new Error('Bearer token not yet captured — navigate the site once before extracting')
  }

  return {
    Authorization: auth,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8',
    Referer: referer,
  }
}
