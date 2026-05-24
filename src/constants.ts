// Fixed endpoints + protocol constants for the Carnet Santé Québec and RAMQ APIs. Unlike
// src/config.ts (user-tunable runtime settings), these are the government platform's own
// addresses — kept in one place so the collectors and the main process never drift apart.

// Portal SPA the user logs into by hand (ClicSEQUR + MFA). Loaded into the embedded site view.
// Note the bare host (no `www.`); it redirects to the `www.` host once authenticated.
export const CARNET_PORTAL_URL = 'https://carnetsante.gouv.qc.ca'

// Origin of the authenticated app + its REST API. All in-app navigation and every /api/1 call
// live under the `www.` host — distinct from the portal URL above.
export const CARNET_ORIGIN = 'https://www.carnetsante.gouv.qc.ca'

// Landing page after login. Also the Referer the API expects on every /api/1 request.
export const CARNET_HOME_URL = `${CARNET_ORIGIN}/accueil`

// Main Carnet Santé REST API: profile, medications, imaging, appointments, medical services —
// everything except labs.
export const CARNET_API_BASE = `${CARNET_ORIGIN}/api/1`

// RAMQ "passerelle d'autorisation" gateway. Labs (Prélèvements) live here, NOT on the Carnet
// host: the sample list, per-sample reports (PDF inlined as base64), and analysis values.
export const RAMQ_GATEWAY_API_BASE = 'https://ais-passerelle-autorisation-api.ramq.gouv.qc.ca/api/1'

// RAMQ "accès aux renseignements de santé" gateway. Hosts the fused-record ACCESS JOURNAL —
// who (which intervenant) consulted the citizen's record, when, and which domains they touched.
export const RAMQ_FUSED_RECORDS_API_BASE = 'https://ais-acces-renseignements-sante-api.ramq.gouv.qc.ca/api/1'

// webRequest filter for the Bearer-capture interceptor — every host that carries the SPA's JWT.
export const AUTH_CAPTURE_URL_PATTERNS = ['https://*.carnetsante.gouv.qc.ca/*', 'https://*.ramq.gouv.qc.ca/*']

// The gov API 403s any request whose User-Agent contains "Electron/<v>", so the partition spoofs a
// plain Chrome UA. fr-CA leads the Accept-Language to match the portal.
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
export const ACCEPT_LANGUAGE = 'fr-CA,fr;q=0.9,en;q=0.8'
