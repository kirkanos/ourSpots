import { Module } from '@nestjs/common';
import { TripsModule } from '../trips/trips.module';
import { OrsClient } from './ors.client';
import { RoutingController } from './routing.controller';
import { RoutingService } from './routing.service';

@Module({
  imports: [TripsModule],
  controllers: [RoutingController],
  providers: [OrsClient, RoutingService],
  exports: [RoutingService, OrsClient],
})
export class RoutingModule {}
