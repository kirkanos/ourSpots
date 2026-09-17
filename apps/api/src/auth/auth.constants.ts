/** Name des Session-Cookies (signiert, httpOnly). */
export const SESSION_COOKIE = 'ourspots_sid';

/** Kurzlebiges Cookie fuer state + PKCE-Verifier waehrend des Logins. */
export const OIDC_FLOW_COOKIE = 'ourspots_oidc';

/** Metadaten-Key fuer Routen, die ohne Login erreichbar sein muessen. */
export const IS_PUBLIC_KEY = 'ourspots:isPublic';
