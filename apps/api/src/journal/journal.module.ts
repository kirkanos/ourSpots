import { Module } from '@nestjs/common';
import { TripsModule } from '../trips/trips.module';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';

@Module({
  imports: [TripsModule],
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService],
})
export class JournalModule {}
