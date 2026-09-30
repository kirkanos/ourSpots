import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  allowInsecureRequests,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  buildEndSessionUrl,
  calculatePKCECodeChallenge,
  ClientSecretPost,
  discovery,
  fetchUserInfo,
  randomPKCECodeVerifier,
  randomState,
  type Configuration,
  type TokenEndpointResponse,
  type TokenEndpointResponseHelpers,
} from 'openid-client';
import { AppConfig, CONFIG } from '../config/app-config';

export interface AuthorizationRequest {
  url: string;
  state: string;
  codeVerifier: string;
}

export interface OidcProfile {
  sub: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
}

/** Was der Token-Endpunkt liefert, samt der Helfer fuer die ID-Token-Claims. */
export type OidcTokens = TokenEndpointResponse & TokenEndpointResponseHelpers;

/**
 * Kapselt den Authorization-Code-Flow mit PKCE gegen Authelia. Tokens bleiben
 * ausschliesslich hier und in der Session-Tabelle – der Browser bekommt nur
 * die Session-ID.
 *
 * openid-client 6 ist reines ESM, diese Anwendung wird nach CommonJS gebaut.
 * Das geht gut, weil Node seit 22.12 ein ESM-Modul auch aus require heraus
 * laden kann und beide Images auf 22.23 liegen. Faellt die Laufzeit je unter
 * 22.12, scheitert der Start mit ERR_REQUIRE_ESM.
 */
@Injectable()
export class OidcService implements OnModuleInit {
  private readonly logger = new Logger(OidcService.name);
  private configuration?: Configuration;
  private discovering?: Promise<Configuration>;

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    // Discovery im Hintergrund anstossen, aber den Start nicht blockieren:
    // Authelia kann beim gemeinsamen Hochfahren noch nicht erreichbar sein.
    this.getConfiguration().catch((err) => {
      this.logger.warn(
        `OIDC-Discovery beim Start fehlgeschlagen, wird beim ersten Login erneut versucht: ${String(err)}`,
      );
    });
  }

  private async getConfiguration(): Promise<Configuration> {
    if (this.configuration) return this.configuration;
    if (!this.discovering) {
      const issuer = new URL(this.config.OIDC_ISSUER);

      // Fassung 6 spricht ausschliesslich HTTPS. Fuer eine lokale Authelia
      // ohne Zertifikat war das bisher moeglich, deshalb die Ausnahme – aber
      // nur ausserhalb der Produktion und nur fuer einen http-Issuer.
      const unsicherErlaubt = !this.config.isProduction && issuer.protocol === 'http:';
      if (unsicherErlaubt) {
        this.logger.warn(`OIDC-Issuer ${issuer.origin} wird unverschluesselt angesprochen`);
      }

      this.discovering = discovery(
        issuer,
        this.config.OIDC_CLIENT_ID,
        undefined,
        ClientSecretPost(this.config.OIDC_CLIENT_SECRET),
        unsicherErlaubt ? { execute: [allowInsecureRequests] } : undefined,
      )
        .then((configuration) => {
          this.logger.log(`OIDC-Issuer gefunden: ${configuration.serverMetadata().issuer}`);
          this.configuration = configuration;
          return configuration;
        })
        .catch((err: unknown) => {
          // Fehlgeschlagene Discovery nicht dauerhaft merken.
          this.discovering = undefined;
          throw err;
        });
    }
    return this.discovering;
  }

  async createAuthorizationRequest(): Promise<AuthorizationRequest> {
    const configuration = await this.getConfiguration();
    const codeVerifier = randomPKCECodeVerifier();
    const state = randomState();

    const url = buildAuthorizationUrl(configuration, {
      // In Fassung 6 steckt die Redirect-URI nicht mehr in den Client-Daten,
      // sondern gehoert zu jeder Anfrage dazu.
      redirect_uri: this.config.OIDC_REDIRECT_URI,
      scope: this.config.OIDC_SCOPES,
      state,
      code_challenge: await calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });

    return { url: url.href, state, codeVerifier };
  }

  async exchangeCode(
    params: Record<string, string>,
    state: string,
    codeVerifier: string,
  ): Promise<OidcTokens> {
    const configuration = await this.getConfiguration();

    // Fassung 6 liest die Antwortparameter aus einer URL statt aus einem
    // Objekt. Die Redirect-URI ist der richtige Sockel dafuer – der Browser
    // hat den Code genau dorthin geschickt.
    const currentUrl = new URL(this.config.OIDC_REDIRECT_URI);
    for (const [key, value] of Object.entries(params)) {
      currentUrl.searchParams.set(key, value);
    }

    return authorizationCodeGrant(configuration, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState: state,
      idTokenExpected: true,
    });
  }

  async fetchProfile(tokens: OidcTokens): Promise<OidcProfile> {
    const configuration = await this.getConfiguration();
    const claims = tokens.claims();

    // Ohne sub laesst sich der Nutzer nicht zuordnen; das Userinfo-Ergebnis
    // wird von der Bibliothek ausserdem dagegen geprueft.
    const sub = claims?.sub;
    if (!sub) throw new Error('Das ID-Token enthaelt kein sub');

    const info = await fetchUserInfo(configuration, tokens.access_token, sub);

    const email = info.email ?? (claims.email as string | undefined) ?? null;
    const name =
      info.name ??
      info.preferred_username ??
      (claims.name as string | undefined) ??
      email ??
      sub;

    return {
      sub,
      email,
      displayName: String(name),
      avatarUrl: info.picture ?? null,
    };
  }

  /**
   * Abmelde-URL bei Authelia, damit der Logout nicht nur lokal wirkt.
   * Gibt null zurueck, falls der Provider kein end_session_endpoint anbietet.
   */
  async endSessionUrl(idToken: string | null): Promise<string | null> {
    try {
      const configuration = await this.getConfiguration();
      if (!configuration.serverMetadata().end_session_endpoint) return null;

      const url = buildEndSessionUrl(configuration, {
        post_logout_redirect_uri: this.config.APP_URL,
        ...(idToken ? { id_token_hint: idToken } : {}),
      });
      return url.href;
    } catch (err) {
      this.logger.warn(`Abmelde-URL konnte nicht gebildet werden: ${String(err)}`);
      return null;
    }
  }
}
