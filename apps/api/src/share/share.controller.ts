import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import {
  shareLinkInputSchema,
  type PublicTripDto,
  type ShareLinkDto,
  type ShareLinkInput,
} from '@womo/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { isPhotoSize, PhotosService, type PhotoSize } from '../photos/photos.service';
import { ShareService } from './share.service';

@Controller()
export class ShareController {
  constructor(
    private readonly share: ShareService,
    private readonly photos: PhotosService,
  ) {}

  @Get('trips/:id/share')
  list(@Param('id') tripId: string, @CurrentUser() user: User): Promise<ShareLinkDto[]> {
    return this.share.list(tripId, user.id);
  }

  @Post('trips/:id/share')
  create(
    @Param('id') tripId: string,
    @Body(new ZodValidationPipe(shareLinkInputSchema)) body: ShareLinkInput,
    @CurrentUser() user: User,
  ): Promise<ShareLinkDto> {
    return this.share.create(tripId, user.id, body);
  }

  @Delete('share/:token')
  @HttpCode(204)
  revoke(@Param('token') token: string, @CurrentUser() user: User): Promise<void> {
    return this.share.revoke(token, user.id);
  }

  // --- Ohne Anmeldung erreichbar -------------------------------------------

  @Public()
  @Get('public/:token')
  publicTrip(@Param('token') token: string): Promise<PublicTripDto> {
    return this.share.publicTrip(token);
  }

  @Public()
  @Get('public/:token/photos/:photoId')
  async publicPhoto(
    @Param('token') token: string,
    @Param('photoId') photoId: string,
    @Query('size') sizeParam: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const size: PhotoSize = sizeParam && isPhotoSize(sizeParam) ? sizeParam : 'medium';
    const storageKey = await this.share.photoStorageKey(token, photoId);
    const { stream, bytes } = await this.photos.openFile(storageKey, size);

    res.set({
      'Content-Type': 'image/webp',
      'Content-Length': String(bytes),
      'Cache-Control': 'public, max-age=3600',
    });
    stream.pipe(res);
  }
}
