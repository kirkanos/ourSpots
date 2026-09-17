import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RoutingModule } from '../routing/routing.module';
import { TripsModule } from '../trips/trips.module';
import { TransferController } from './transfer.controller';
import { TransferService } from './transfer.service';

@Module({
  imports: [
    TripsModule,
    RoutingModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    }),
  ],
  controllers: [TransferController],
  providers: [TransferService],
})
export class TransferModule {}
