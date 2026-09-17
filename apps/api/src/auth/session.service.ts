import { Inject, Injectable } from '@nestjs/common';
import type { Session, User } from '@prisma/client';
import { AppConfig, CONFIG } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { newId } from '../common/ids';
import type { OidcProfile } from './oidc.service';

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Legt den Nutzer beim ersten Login an. Schluessel ist der OIDC-`sub`, nicht
   * die E-Mail – eine geaenderte Adresse in Authelia darf kein zweites Konto
   * erzeugen.
   */
  async upsertUser(profile: OidcProfile): Promise<User> {
    return this.prisma.user.upsert({
      where: { oidcSub: profile.sub },
      create: {
        id: newId(),
        oidcSub: profile.sub,
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        lastLoginAt: new Date(),
      },
      update: {
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        lastLoginAt: new Date(),
      },
    });
  }

  async create(
    userId: string,
    opts: { userAgent?: string; ip?: string; idToken?: string | null; refreshToken?: string | null },
  ): Promise<Session> {
    const expiresAt = new Date(
      Date.now() + this.config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    return this.prisma.session.create({
      data: {
        id: newId(),
        userId,
        expiresAt,
        userAgent: opts.userAgent?.slice(0, 500) ?? null,
        ip: opts.ip?.slice(0, 45) ?? null,
        idToken: opts.idToken ?? null,
        refreshToken: opts.refreshToken ?? null,
      },
    });
  }

  async resolve(sessionId: string): Promise<(Session & { user: User }) | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.destroy(sessionId);
      return null;
    }
    return session;
  }

  async destroy(sessionId: string): Promise<Session | null> {
    return this.prisma.session.delete({ where: { id: sessionId } }).catch(() => null);
  }

  /** Aufraeumen abgelaufener Sessions; wird beim Start einmal ausgefuehrt. */
  async purgeExpired(): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return count;
  }
}
