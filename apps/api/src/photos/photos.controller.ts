import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { User } from '../generated/prisma/client';
import type { PhotoDto } from '@ourspots/shared';
import { AppConfig, CONFIG } from '../config/app-config';
import { CurrentUser } from '../auth/current-user.decorator';
import { isPhotoSize, PhotosService, type PhotoSize } from './photos.service';

@Controller()
export class PhotosController {
  constructor(
    private readonly photos: PhotosService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('spots/:id/photos')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('id') spotId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: User,
  ): Promise<PhotoDto> {
    if (!file) throw new BadRequestException('Es wurde keine Datei übertragen');
    if (file.size > this.config.MAX_UPLOAD_MB * 1024 * 1024) {
      throw new BadRequestException(`Das Bild ist größer als ${this.config.MAX_UPLOAD_MB} MB`);
    }
    return this.photos.uploadForSpot(spotId, user.id, file);
  }

  @Get('photos/:id')
  async serve(
    @Param('id') id: string,
    @Query('size') sizeParam: string | undefined,
    @CurrentUser() user: User,
    @Res() res: Response,
  ): Promise<void> {
    const size: PhotoSize = sizeParam && isPhotoSize(sizeParam) ? sizeParam : 'medium';
    const { stream, bytes } = await this.photos.openStream(id, user.id, size);

    res.set({
      'Content-Type': 'image/webp',
      'Content-Length': String(bytes),
      // Bilder sind unveränderlich: eine neue Version bekommt eine neue ID.
      'Cache-Control': 'private, max-age=31536000, immutable',
    });
    stream.pipe(res);
  }

  @Delete('photos/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: User): Promise<void> {
    return this.photos.remove(id, user.id);
  }
}
