import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Logger,
  OnModuleInit,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AppConfig, CONFIG } from '../config/app-config';
import { SESSION_COOKIE } from './auth.constants';
import { Public } from './public.decorator';
import { SessionService } from './session.service';

/**
 * Anmeldung ohne Authelia – ausschliesslich fuer die lokale Entwicklung.
 *
 * Der Endpunkt existiert nur, wenn DEV_LOGIN=true gesetzt ist, und die
 * Konfiguration laesst das mit NODE_ENV=production gar nicht erst zu. Zusaetzlich
 * prueft jeder Aufruf die Bedingung noch einmal selbst: eine versehentlich
 * falsch gesetzte Variable soll nicht ausreichen, um sich fremd anzumelden.
 */
@Controller('auth')
export class DevLoginController implements OnModuleInit {
  private readonly logger = new Logger(DevLoginController.name);

  constructor(
    private readonly sessions: SessionService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (this.config.DEV_LOGIN) {
      this.logger.warn(
        'DEV_LOGIN ist aktiv: /api/auth/dev-login meldet ohne Authelia an. Niemals im Betrieb einschalten.',
      );
    }
  }

  /** Das Frontend fragt hier, ob es den lokalen Anmeldeknopf anzeigen soll. */
  @Public()
  @Get('config')
  authConfig(): { devLogin: boolean; issuer: string } {
    return { devLogin: this.config.DEV_LOGIN, issuer: this.config.OIDC_ISSUER };
  }

  @Public()
  @Post('dev-login')
  async devLogin(@Req() req: Request, @Res() res: Response): Promise<void> {
    if (!this.config.DEV_LOGIN || this.config.NODE_ENV === 'production') {
      throw new ForbiddenException('Die lokale Anmeldung ist nicht verfügbar');
    }

    const user = await this.sessions.upsertUser({
      sub: 'dev-local-user',
      email: 'entwicklung@localhost',
      displayName: 'Lokaler Testnutzer',
      avatarUrl: null,
    });
    const session = await this.sessions.create(user.id, {
      userAgent: req.get('user-agent') ?? undefined,
      ip: req.ip,
    });

    const options: CookieOptions = {
      httpOnly: true,
      signed: true,
      sameSite: 'lax',
      secure: this.config.cookieSecure,
      path: '/',
      maxAge: this.config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    };
    res.cookie(SESSION_COOKIE, session.id, options);
    res.json({ ok: true });
  }
}
