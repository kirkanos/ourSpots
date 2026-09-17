import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client, generators, Issuer, TokenSet } from 'openid-client';
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

/**
 * Kapselt den Authorization-Code-Flow mit PKCE gegen Authelia. Tokens bleiben
 * ausschliesslich hier und in der Session-Tabelle – der Browser bekommt nur
 * die Session-ID.
 */
@Injectable()
export class OidcService implements OnModuleInit {
  private readonly logger = new Logger(OidcService.name);
  private client?: Client;
  private discovery?: Promise<Client>;

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    // Discovery im Hintergrund anstossen, aber den Start nicht blockieren:
    // Authelia kann beim gemeinsamen Hochfahren noch nicht erreichbar sein.
    this.getClient().catch((err) => {
      this.logger.warn(
        `OIDC-Discovery beim Start fehlgeschlagen, wird beim ersten Login erneut versucht: ${String(err)}`,
      );
    });
  }

  private async getClient(): Promise<Client> {
    if (this.client) return this.client;
    if (!this.discovery) {
      this.discovery = Issuer.discover(this.config.OIDC_ISSUER)
        .then((issuer) => {
          this.logger.log(`OIDC-Issuer gefunden: ${issuer.issuer}`);
          const client = new issuer.Client({
            client_id: this.config.OIDC_CLIENT_ID,
            client_secret: this.config.OIDC_CLIENT_SECRET,
            redirect_uris: [this.config.OIDC_REDIRECT_URI],
            response_types: ['code'],
            token_endpoint_auth_method: 'client_secret_post',
          });
          this.client = client;
          return client;
        })
        .catch((err) => {
          // Fehlgeschlagene Discovery nicht dauerhaft merken.
          this.discovery = undefined;
          throw err;
        });
    }
    return this.discovery;
  }

  async createAuthorizationRequest(): Promise<AuthorizationRequest> {
    const client = await this.getClient();
    const codeVerifier = generators.codeVerifier();
    const state = generators.state();

    const url = client.authorizationUrl({
      scope: this.config.OIDC_SCOPES,
      state,
      code_challenge: generators.codeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });

    return { url, state, codeVerifier };
  }

  async exchangeCode(
    params: Record<string, string>,
    state: string,
    codeVerifier: string,
  ): Promise<TokenSet> {
    const client = await this.getClient();
    return client.callback(this.config.OIDC_REDIRECT_URI, params, {
      state,
      code_verifier: codeVerifier,
    });
  }

  async fetchProfile(tokenSet: TokenSet): Promise<OidcProfile> {
    const client = await this.getClient();
    const info = await client.userinfo(tokenSet);
    const claims = tokenSet.claims();

    const sub = info.sub || claims.sub;
    const email = (info.email ?? (claims.email as string | undefined)) ?? null;
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
      const client = await this.getClient();
      if (!client.issuer.metadata.end_session_endpoint) return null;
      return client.endSessionUrl({
        id_token_hint: idToken ?? undefined,
        post_logout_redirect_uri: this.config.APP_URL,
      });
    } catch (err) {
      this.logger.warn(`Abmelde-URL konnte nicht gebildet werden: ${String(err)}`);
      return null;
    }
  }
}
