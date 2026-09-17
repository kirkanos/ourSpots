import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { loadConfig } from '../config/app-config';
import { TripsModule } from '../trips/trips.module';
import { PhotosController } from './photos.controller';
import { PhotosService } from './photos.service';

@Module({
  imports: [
    TripsModule,
    // Uploads laufen durch sharp; sie landen im Speicher, nicht als temporäre
    // Datei auf der Platte.
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: loadConfig().MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
    }),
  ],
  controllers: [PhotosController],
  providers: [PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}
