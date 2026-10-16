import { Module } from '@nestjs/common';
import { TripsModule } from '../trips/trips.module';
import { RoutingModule } from '../routing/routing.module';
import { PhotosModule } from '../photos/photos.module';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';

@Module({
  imports: [TripsModule, RoutingModule, PhotosModule],
  controllers: [VideoController],
  providers: [VideoService],
  exports: [VideoService],
})
export class VideoModule {}
