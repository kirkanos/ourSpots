import { ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { AdminUserDto, UserRole } from '@ourspots/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Globale Rollen und die Einrichtung der ersten Installation.
 *
 * Es gibt genau zwei Rollen: "admin" darf alles anlegen, aendern und loeschen
 * und vergibt die Rollen der anderen; "user" arbeitet in den Reisen, zu denen
 * er eingeladen wurde. Was jemand innerhalb einer Reise darf, steht weiterhin
 * an der Mitgliedschaft -- die beiden Ebenen sind unabhaengig.
 */
@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger(AdminService.name);

  /**
   * Das Einrichtungstoken einer frischen Installation.
   *
   * Nur im Arbeitsspeicher und bei jedem Start neu: Wer es verliert, startet
   * den Dienst neu und liest es erneut im Log. In der Datenbank haette es
   * nichts zu suchen -- dort liegt es dauerhaft herum, auch wenn es laengst
   * niemand mehr braucht.
   */
  private einrichtungstoken: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.pruefeEinrichtung();
  }

  /**
   * Schreibt ein Einrichtungstoken ins Log, solange es keinen Admin gibt.
   *
   * Der Gedanke dahinter: Wer das Log des Servers lesen kann, betreibt ihn
   * auch. Damit wird nicht der erste Anmeldende zum Admin -- das koennte
   * jemand sein, der zufaellig schneller war --, sondern derjenige, der
   * tatsaechlich Zugriff auf die Maschine hat.
   */
  private async pruefeEinrichtung(): Promise<void> {
    const admins = await this.prisma.user.count({ where: { role: 'admin' } });
    if (admins > 0) {
      this.einrichtungstoken = null;
      return;
    }

    this.einrichtungstoken = randomBytes(24).toString('base64url');
    this.logger.warn(
      '\n' +
        '='.repeat(72) +
        '\n  Diese Installation hat noch keinen Administrator.\n' +
        '\n  Melde dich an und gib in den Einstellungen dieses Token ein:\n' +
        `\n      ${this.einrichtungstoken}\n` +
        '\n  Es gilt nur bis zum naechsten Neustart und verschwindet, sobald\n' +
        '  der erste Administrator feststeht.\n' +
        '='.repeat(72),
    );
  }

  /** Ob die Oberflaeche den Einrichtungsschritt anbieten soll. */
  get einrichtungOffen(): boolean {
    return this.einrichtungstoken !== null;
  }

  /**
   * Macht den anfragenden Nutzer zum Admin, wenn das Token stimmt.
   *
   * Der Vergleich laeuft ueber timingSafeEqual: Ein gewoehnlicher
   * Zeichenvergleich bricht beim ersten Unterschied ab und verraet ueber die
   * Antwortzeit, wie viele Zeichen gestimmt haben.
   */
  async beanspruchen(userId: string, token: string): Promise<void> {
    const erwartet = this.einrichtungstoken;
    if (!erwartet) {
      throw new ForbiddenException('Diese Installation hat bereits einen Administrator');
    }

    const a = Buffer.from(token);
    const b = Buffer.from(erwartet);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn(`Fehlgeschlagener Einrichtungsversuch von Nutzer ${userId}`);
      throw new ForbiddenException('Das Token stimmt nicht');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { role: 'admin', canRenderVideo: true },
    });
    this.einrichtungstoken = null;
    this.logger.log(`Nutzer ${userId} ist jetzt Administrator`);
  }

  async liste(): Promise<AdminUserDto[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        canRenderVideo: true,
        createdAt: true,
        lastLoginAt: true,
        _count: { select: { ownedTrips: true } },
      },
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role as UserRole,
      canRenderVideo: u.canRenderVideo,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      ownedTrips: u._count.ownedTrips,
    }));
  }

  /**
   * Rolle und Videorecht eines Nutzers setzen.
   *
   * Der letzte Administrator kann sich nicht selbst herabstufen. Sonst stuende
   * die Installation ohne jemanden da, der Rollen vergeben darf, und waere nur
   * noch ueber die Datenbank zu retten.
   */
  async setzeRolle(
    adminId: string,
    userId: string,
    rolle: UserRole,
    canRenderVideo: boolean,
  ): Promise<AdminUserDto[]> {
    if (rolle !== 'admin') {
      const andere = await this.prisma.user.count({
        where: { role: 'admin', id: { not: userId } },
      });
      if (andere === 0) {
        throw new ForbiddenException(
          'Das ist der letzte Administrator. Ernenne zuerst einen anderen.',
        );
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      // Ein Admin darf ohnehin rendern; das Recht getrennt zu fuehren waere
      // nur eine Quelle fuer widerspruechliche Zustaende.
      data: { role: rolle, canRenderVideo: rolle === 'admin' ? true : canRenderVideo },
    });
    this.logger.log(`${adminId} setzt ${userId} auf ${rolle}`);
    return this.liste();
  }
}
