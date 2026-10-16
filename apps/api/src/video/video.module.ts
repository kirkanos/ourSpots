import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TripsModule } from '../trips/trips.module';
import { RoutingModule } from '../routing/routing.module';
import { PhotosModule } from '../photos/photos.module';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';

@Module({
  imports: [
    TripsModule,
    RoutingModule,
    PhotosModule,
    // Eigene Musik laeuft wie die Fotos ueber den Speicher und nicht ueber
    // eine temporaere Datei. 20 MB reichen fuer ein Stueck in guter Qualitaet.
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    }),
  ],
  controllers: [VideoController],
  providers: [VideoService],
  exports: [VideoService],
})
export class VideoModule {}
