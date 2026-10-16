import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { adminRolleInputSchema, einrichtungInputSchema, type AdminRolleInput, type AdminUserDto, type EinrichtungInput } from '@ourspots/shared';
import type { User } from '../generated/prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /**
   * Ob die Oberflaeche den Einrichtungsschritt anbieten soll.
   *
   * Ohne Admin-Guard: Zu diesem Zeitpunkt gibt es ja noch keinen Admin. Die
   * Auskunft verraet nichts Schuetzenswertes -- nur, dass noch niemand
   * eingerichtet hat. Das Token selbst steht ausschliesslich im Log.
   */
  @Get('einrichtung')
  einrichtung(): { offen: boolean } {
    return { offen: this.admin.einrichtungOffen };
  }

  @Post('einrichtung')
  beanspruchen(
    @Body(new ZodValidationPipe(einrichtungInputSchema)) eingabe: EinrichtungInput,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.admin.beanspruchen(user.id, eingabe.token);
  }

  @Get('users')
  @UseGuards(AdminGuard)
  liste(): Promise<AdminUserDto[]> {
    return this.admin.liste();
  }

  @Post('users')
  @UseGuards(AdminGuard)
  setzeRolle(
    @Body(new ZodValidationPipe(adminRolleInputSchema)) eingabe: AdminRolleInput,
    @CurrentUser() user: User,
  ): Promise<AdminUserDto[]> {
    return this.admin.setzeRolle(user.id, eingabe.userId, eingabe.role, eingabe.canRenderVideo);
  }
}
