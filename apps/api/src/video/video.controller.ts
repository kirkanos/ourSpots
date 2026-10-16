import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { videoInputSchema, type VideoInput, type VideoJobDto } from '@ourspots/shared';
import type { User } from '../generated/prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { VideoService } from './video.service';

@Controller()
export class VideoController {
  constructor(private readonly video: VideoService) {}

  /** Die Oberflaeche blendet den Knopf aus, wenn kein Renderer eingerichtet ist. */
  @Get('video/status')
  verfuegbar(): { configured: boolean } {
    return { configured: this.video.verfuegbar };
  }

  @Get('trips/:id/video')
  status(@Param('id') tripId: string, @CurrentUser() user: User): Promise<VideoJobDto | null> {
    return this.video.status(tripId, user.id);
  }

  @Post('trips/:id/video')
  start(
    @Param('id') tripId: string,
    @Body(new ZodValidationPipe(videoInputSchema)) eingabe: VideoInput,
    @CurrentUser() user: User,
  ): Promise<VideoJobDto> {
    return this.video.start(tripId, user.id, eingabe);
  }

  @Get('trips/:id/video/musik')
  async musik(
    @Param('id') tripId: string,
    @CurrentUser() user: User,
  ): Promise<{ vorhanden: boolean }> {
    await this.video.status(tripId, user.id);
    return { vorhanden: (await this.video.eigeneMusikdatei(tripId)) !== null };
  }

  @Post('trips/:id/video/musik')
  @UseInterceptors(FileInterceptor('file'))
  async musikHochladen(
    @Param('id') tripId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: User,
  ): Promise<void> {
    if (!file) throw new BadRequestException('Es wurde keine Datei übertragen');
    await this.video.speichereMusik(tripId, user.id, file);
  }

  @Delete('trips/:id/video/musik')
  @HttpCode(204)
  musikLoeschen(@Param('id') tripId: string, @CurrentUser() user: User): Promise<void> {
    return this.video.loescheMusik(tripId, user.id);
  }

  @Delete('trips/:id/video')
  @HttpCode(204)
  remove(@Param('id') tripId: string, @CurrentUser() user: User): Promise<void> {
    return this.video.remove(tripId, user.id);
  }

  @Get('trips/:id/video/datei')
  async datei(
    @Param('id') tripId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, bytes } = await this.video.openStream(tripId, user.id);
    res.set({
      'Content-Type': 'video/mp4',
      'Content-Length': String(bytes),
      'Content-Disposition': `attachment; filename="reisevideo-${tripId}.mp4"`,
      // Kein Caching: Ein neuer Lauf liegt unter derselben Adresse.
      'Cache-Control': 'private, no-store',
    });
    stream.pipe(res);
  }
}
