import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { TripsModule } from './trips/trips.module';
import { SpotsModule } from './spots/spots.module';
import { PhotosModule } from './photos/photos.module';
import { GeocodeModule } from './geocode/geocode.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    TripsModule,
    SpotsModule,
    PhotosModule,
    GeocodeModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global: jede Route ist geschützt, sofern sie nicht @Public() trägt.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
