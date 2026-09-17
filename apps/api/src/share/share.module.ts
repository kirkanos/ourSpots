import { Module } from '@nestjs/common';
import { PhotosModule } from '../photos/photos.module';
import { TripsModule } from '../trips/trips.module';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';

@Module({
  imports: [TripsModule, PhotosModule],
  controllers: [ShareController],
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}
