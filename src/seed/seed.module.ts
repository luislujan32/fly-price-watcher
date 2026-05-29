import { Module } from '@nestjs/common';
import { FlightSearchesModule } from '../flight-searches/flight-searches.module';
import { SeedFlightSearches } from './seed-flight-searches';

@Module({
  imports: [FlightSearchesModule],
  providers: [SeedFlightSearches],
  exports: [SeedFlightSearches],
})
export class SeedModule {}
