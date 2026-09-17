import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { DevLoginController } from './dev-login.controller';
import { OidcService } from './oidc.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController, DevLoginController],
  providers: [OidcService, SessionService],
  exports: [SessionService],
})
export class AuthModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthModule.name);

  constructor(private readonly sessions: SessionService) {}

  async onApplicationBootstrap(): Promise<void> {
    const removed = await this.sessions.purgeExpired().catch(() => 0);
    if (removed > 0) this.logger.log(`${removed} abgelaufene Sitzungen entfernt`);
  }
}
