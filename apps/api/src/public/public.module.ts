import { Module } from '@nestjs/common';
import { PhotosModule } from '../photos/photos.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [PhotosModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
