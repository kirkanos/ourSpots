import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import type { ImportResultDto } from '@womo/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { TransferService } from './transfer.service';

/**
 * HTTP-Header tragen kein UTF-8. Ohne die zweite, prozentkodierte Form landet
 * „Nordsee im Frühjahr“ als „Fr?hjahr“ auf der Platte.
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

@Controller()
export class TransferController {
  constructor(private readonly transfer: TransferService) {}

  @Get('trips/:id/export.:format')
  async exportTrip(
    @Param('id') tripId: string,
    @Param('format') format: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ): Promise<void> {
    if (format !== 'gpx' && format !== 'kml') {
      throw new BadRequestException('Unterstützt werden die Formate gpx und kml');
    }

    const file = await this.transfer.exportTrip(tripId, user.id, format);
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': contentDisposition(file.filename),
    });
    res.send(file.content);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  importSpots(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('tripId') tripId: string | undefined,
    @CurrentUser() user: User,
  ): Promise<ImportResultDto> {
    if (!file) throw new BadRequestException('Es wurde keine Datei übertragen');
    if (file.size > 20 * 1024 * 1024) {
      throw new BadRequestException('Die Datei ist größer als 20 MB');
    }

    return this.transfer.importSpots(
      user.id,
      file.originalname,
      file.buffer.toString('utf8'),
      tripId || null,
    );
  }
}
