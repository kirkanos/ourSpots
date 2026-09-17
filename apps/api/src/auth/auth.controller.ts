import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AppConfig, CONFIG } from '../config/app-config';
import { OIDC_FLOW_COOKIE, SESSION_COOKIE } from './auth.constants';
import { OidcService } from './oidc.service';
import { SessionService } from './session.service';
import { Public } from './public.decorator';
import { CurrentUser, type AuthenticatedRequest } from './current-user.decorator';
import type { User } from '@prisma/client';
import type { UserDto } from '@ourspots/shared';

interface FlowState {
  state: string;
  codeVerifier: string;
  returnTo: string;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly oidc: OidcService,
    private readonly sessions: SessionService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('login')
  async login(
    @Query('returnTo') returnTo: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const request = await this.oidc.createAuthorizationRequest();

    const flow: FlowState = {
      state: request.state,
      codeVerifier: request.codeVerifier,
      returnTo: sanitizeReturnTo(returnTo),
    };

    // Kurzlebig: der Nutzer hat zehn Minuten, um sich bei Authelia anzumelden.
    res.cookie(OIDC_FLOW_COOKIE, JSON.stringify(flow), {
      ...this.cookieOptions(),
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(request.url);
  }

  @Public()
  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const raw = req.signedCookies?.[OIDC_FLOW_COOKIE];
    res.clearCookie(OIDC_FLOW_COOKIE, this.cookieOptions());

    if (typeof raw !== 'string') {
      throw new BadRequestException(
        'Der Login ist abgelaufen oder wurde in einem anderen Browser begonnen. Bitte erneut versuchen.',
      );
    }

    let flow: FlowState;
    try {
      flow = JSON.parse(raw) as FlowState;
    } catch {
      throw new BadRequestException('Der Login-Vorgang ist ungültig');
    }

    if (typeof req.query.error === 'string') {
      this.logger.warn(`Authelia hat den Login abgelehnt: ${req.query.error}`);
      res.redirect(`${this.config.APP_URL}/login?error=${encodeURIComponent(req.query.error)}`);
      return;
    }

    const params = Object.fromEntries(
      Object.entries(req.query).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );

    const tokenSet = await this.oidc.exchangeCode(params, flow.state, flow.codeVerifier);
    const profile = await this.oidc.fetchProfile(tokenSet);
    const user = await this.sessions.upsertUser(profile);
    const session = await this.sessions.create(user.id, {
      userAgent: req.get('user-agent') ?? undefined,
      ip: req.ip,
      idToken: tokenSet.id_token ?? null,
      refreshToken: tokenSet.refresh_token ?? null,
    });

    res.cookie(SESSION_COOKIE, session.id, {
      ...this.cookieOptions(),
      maxAge: this.config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
    res.redirect(`${this.config.APP_URL}${flow.returnTo}`);
  }

  @Post('logout')
  async logout(@Req() req: AuthenticatedRequest, @Res() res: Response): Promise<void> {
    let idToken: string | null = null;
    if (req.sessionId) {
      const removed = await this.sessions.destroy(req.sessionId);
      idToken = removed?.idToken ?? null;
    }
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());

    // Die Abmeldung soll auch bei Authelia greifen, sonst landet der naechste
    // Login-Klick sofort wieder in einer aktiven Sitzung.
    const endSession = await this.oidc.endSessionUrl(idToken);
    res.json({ ok: true, endSessionUrl: endSession });
  }

  @Get('me')
  me(@CurrentUser() user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    };
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      signed: true,
      sameSite: 'lax',
      secure: this.config.cookieSecure,
      path: '/',
    };
  }
}

/**
 * Nur relative Pfade zulassen. Ein `//fremde-domain` wuerde der Browser sonst
 * als protokollrelative URL behandeln – klassische Open-Redirect-Luecke.
 */
function sanitizeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
